/**
 * Sales pipeline — leads → opportunities → quotes (Phase 3, mig 150).
 *
 * ── ROW SCOPING ────────────────────────────────────────────────────────────────────
 * Every read and write goes through `scopeClause()`. The recurring failure mode in this
 * codebase is not "the filter was written wrong" but "the filter was not written at
 * all" (DEEP_AUDIT 6/7/8), so there is exactly ONE place that decides visibility and
 * every query composes it. It returns a complete boolean expression — never an empty
 * string — so a caller cannot accidentally emit a filter-less WHERE.
 *
 * Today every staff user holds `sales.all` in effect (see canSeeAll), so scoping is
 * inert in practice. It is built now because Phase 4 puts EXTERNAL people on this data,
 * and retrofitting row visibility onto live sales records is exactly the migration this
 * avoids.
 *
 * ── THE PIPELINE FEEDS BILLING, IT NEVER SHADOWS IT ────────────────────────────────
 * `quote_lines` carries the same basis vocabulary and per-basis fields as
 * `client_night_rates`. Accepting a quote writes ONE partner_contracts row and ONE
 * client_night_rates row per priced site, inside a single transaction. There is no
 * second place a price lives: after acceptance the RATE is what bills, and the quote is
 * just the record of how that rate was agreed.
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

class SalesError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'];
const BASES = ['per_person', 'flat', 'per_bed_night'];
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * May this caller see every sales record, or only their own?
 *
 * `sales.all.view` (mig 151) is the manager grant. Superadmin bypasses as it does
 * everywhere else. Anyone else sees their own rows plus what has been explicitly shared
 * with them — which is the state an external agent will be in from Phase 4.
 */
const canSeeAll = (req) =>
  !!req?.user?.roles?.includes('superadmin')
  || !!req?.user?.permissions?.includes('sales.all.view');

/**
 * Visibility predicate for a sales table.
 * `alias.owner_user_id = me` OR explicitly shared with me OR the caller sees everything.
 */
function scopeClause(req, alias, recordType, startIndex) {
  if (canSeeAll(req)) return { sql: 'TRUE', params: [], nextIndex: startIndex };
  const me = req?.user?.id;
  if (!me) return { sql: 'FALSE', params: [], nextIndex: startIndex };
  const i = startIndex;
  return {
    sql: `(${alias}.owner_user_id = $${i} OR EXISTS (
             SELECT 1 FROM sales_record_shares s
              WHERE s.record_type = '${recordType}' AND s.record_id = ${alias}.id AND s.user_id = $${i}))`,
    params: [me],
    nextIndex: i + 1,
  };
}

/** Fetch one row and refuse it if the caller cannot see it — 404, never 403. */
async function fetchScoped(req, table, alias, recordType, id) {
  const sc = scopeClause(req, alias, recordType, 2);
  const r = await query(
    `SELECT ${alias}.* FROM ${table} ${alias} WHERE ${alias}.id = $1 AND ${sc.sql}`,
    [id, ...sc.params]);
  return r.rows[0] || null;
}

// ── leads ───────────────────────────────────────────────────────────────────

async function listLeads(req, filters = {}) {
  const where = [];
  const params = [];
  let i = 1;
  const sc = scopeClause(req, 'l', 'lead', i);
  where.push(sc.sql); params.push(...sc.params); i = sc.nextIndex;

  if (filters.status) { params.push(filters.status); where.push(`l.status = $${i++}`); }
  if (filters.q) { params.push(`%${filters.q}%`); where.push(`l.name ILIKE $${i++}`); }

  const r = await query(
    `SELECT l.*, c.name AS converted_contractor_name,
            u.first_name || ' ' || COALESCE(u.last_name,'') AS owner_name,
            (SELECT count(*) FROM opportunities o WHERE o.lead_id = l.id) AS opportunity_count
       FROM partner_leads l
       LEFT JOIN contractors c ON c.id = l.converted_contractor_id
       LEFT JOIN users u ON u.id = l.owner_user_id
      WHERE ${where.join(' AND ')}
      ORDER BY l.created_at DESC LIMIT 500`, params);
  return r.rows;
}

async function saveLead(req, id, body) {
  if (!body.name || !String(body.name).trim()) throw new SalesError('A név kötelező');
  if (body.status && !LEAD_STATUSES.includes(body.status)) {
    throw new SalesError(`status: ${LEAD_STATUSES.join(' | ')}`);
  }
  if (body.status === 'lost' && !String(body.lost_reason || '').trim()) {
    throw new SalesError('Elvesztett érdeklődőnél az indoklás kötelező');
  }
  // Conversion is its own operation (convertLead) — it has to create a contractor and
  // carry the pipeline across, which a field update cannot do safely.
  if (body.status === 'converted') {
    throw new SalesError('A konvertáláshoz használd a külön műveletet (POST /sales/leads/:id/convert)');
  }

  const vals = [
    String(body.name).trim(), body.source ?? null, body.industry ?? null, body.country ?? null,
    body.status || 'new', body.expected_headcount ?? null, body.notes ?? null,
    body.lost_reason ?? null,
  ];

  if (id) {
    const cur = await fetchScoped(req, 'partner_leads', 'l', 'lead', id);
    if (!cur) throw new SalesError('Érdeklődő nem található', 404);
    if (cur.status === 'converted') throw new SalesError('Konvertált érdeklődő nem szerkeszthető', 409);
    const r = await query(
      `UPDATE partner_leads SET name=$1, source=$2, industry=$3, country=$4, status=$5,
              expected_headcount=$6, notes=$7, lost_reason=$8, updated_at=now()
        WHERE id=$9 RETURNING *`, [...vals, id]);
    return r.rows[0];
  }
  const r = await query(
    `INSERT INTO partner_leads (name, source, industry, country, status, expected_headcount,
                                notes, lost_reason, owner_user_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
    [...vals, req.user?.id]);
  return r.rows[0];
}

/**
 * Convert a lead into a real contractor.
 *
 * ASSUMPTION (2026-09-02): conversion CREATES a new `contractors` row tagged `megbizo`,
 * unless an existing contractor id is supplied (a lead that turns out to be a client we
 * already have). Contacts, activities and documents are re-parented from the lead to the
 * contractor; the lead row is KEPT and marked converted, so the pipeline history of a
 * live client is not deleted.
 */
async function convertLead(req, id, body = {}) {
  const lead = await fetchScoped(req, 'partner_leads', 'l', 'lead', id);
  if (!lead) throw new SalesError('Érdeklődő nem található', 404);
  if (lead.status === 'converted') throw new SalesError('Ez az érdeklődő már konvertálva lett', 409);
  if (lead.status === 'lost') throw new SalesError('Elvesztett érdeklődő nem konvertálható', 409);

  return transaction(async (client) => {
    let contractorId = body.contractor_id || null;

    if (!contractorId) {
      const slug = `${String(lead.name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now().toString(36)}`.slice(0, 100);
      const c = await client.query(
        `INSERT INTO contractors (name, slug, is_active, tax_number, address)
         VALUES ($1,$2,true,$3,$4) RETURNING id`,
        [lead.name, slug, body.tax_number || null, body.address || null]);
      contractorId = c.rows[0].id;
      // A converted lead is by definition a client we bill → megbízó.
      await client.query(
        `INSERT INTO contractor_roles (contractor_id, role, created_by)
         VALUES ($1,'megbizo',$2) ON CONFLICT DO NOTHING`, [contractorId, req.user?.id || null]);
    }

    // Re-parent the pipeline's context so nothing is orphaned on the lead.
    const moved = {};
    for (const t of ['partner_contacts', 'partner_activities', 'documents']) {
      const r = await client.query(
        `UPDATE ${t} SET lead_id = NULL, contractor_id = $1 WHERE lead_id = $2 RETURNING 1`,
        [contractorId, id]);
      moved[t] = r.rowCount;
    }
    // Open opportunities follow the client; closed ones stay on the lead as history.
    const opp = await client.query(
      `UPDATE opportunities SET lead_id = NULL, contractor_id = $1, updated_at = now()
        WHERE lead_id = $2 AND stage NOT IN ('won','lost') RETURNING 1`, [contractorId, id]);
    moved.opportunities = opp.rowCount;

    const l = await client.query(
      `UPDATE partner_leads SET status='converted', converted_contractor_id=$1,
              converted_at=now(), updated_at=now()
        WHERE id=$2 RETURNING *`, [contractorId, id]);

    logger.info(`[sales] lead ${id} converted → contractor ${contractorId} (user=${req.user?.id})`);
    return { lead: l.rows[0], contractor_id: contractorId, moved };
  });
}

// ── opportunities ───────────────────────────────────────────────────────────

async function listOpportunities(req, filters = {}) {
  const where = [];
  const params = [];
  let i = 1;
  const sc = scopeClause(req, 'o', 'opportunity', i);
  where.push(sc.sql); params.push(...sc.params); i = sc.nextIndex;

  if (filters.stage) { params.push(filters.stage); where.push(`o.stage = $${i++}`); }
  if (filters.lead_id) { params.push(filters.lead_id); where.push(`o.lead_id = $${i++}`); }
  if (filters.contractor_id) { params.push(filters.contractor_id); where.push(`o.contractor_id = $${i++}`); }
  if (filters.open_only === 'true') where.push(`o.stage NOT IN ('won','lost')`);

  const r = await query(
    `SELECT o.*, l.name AS lead_name, c.name AS contractor_name,
            u.first_name || ' ' || COALESCE(u.last_name,'') AS owner_name,
            (SELECT count(*) FROM quotes q WHERE q.opportunity_id = o.id) AS quote_count
       FROM opportunities o
       LEFT JOIN partner_leads l ON l.id = o.lead_id
       LEFT JOIN contractors   c ON c.id = o.contractor_id
       LEFT JOIN users u ON u.id = o.owner_user_id
      WHERE ${where.join(' AND ')}
      ORDER BY o.expected_close_date NULLS LAST, o.created_at DESC LIMIT 500`, params);
  return r.rows;
}

async function saveOpportunity(req, id, body) {
  const hasLead = !!body.lead_id;
  const hasContractor = !!body.contractor_id;
  if (hasLead === hasContractor) {
    throw new SalesError('Pontosan egy fél adható meg: lead_id VAGY contractor_id');
  }
  if (!body.title || !String(body.title).trim()) throw new SalesError('A megnevezés kötelező');
  const stage = body.stage || 'new';
  if (!STAGES.includes(stage)) throw new SalesError(`stage: ${STAGES.join(' | ')}`);
  if (stage === 'lost' && !body.lost_reason_code && !String(body.lost_reason_text || '').trim()) {
    throw new SalesError('Elvesztett lehetőségnél az indoklás kötelező');
  }
  if (body.probability != null && (body.probability < 0 || body.probability > 100)) {
    throw new SalesError('A valószínűség 0 és 100 között lehet');
  }

  // The closed-stage timestamps are derived from the stage, never accepted from the
  // client — that is what keeps the DB CHECKs satisfiable and win-rate honest.
  const wonAt = stage === 'won' ? 'now()' : 'NULL';
  const lostAt = stage === 'lost' ? 'now()' : 'NULL';

  const vals = [
    body.lead_id || null, body.contractor_id || null, String(body.title).trim(), stage,
    body.expected_headcount ?? null, num(body.expected_monthly_value), body.currency || 'HUF',
    body.probability ?? null, body.expected_close_date || null,
    body.lost_reason_code || null, body.lost_reason_text || null,
  ];

  if (id) {
    const cur = await fetchScoped(req, 'opportunities', 'o', 'opportunity', id);
    if (!cur) throw new SalesError('Lehetőség nem található', 404);
    const r = await query(
      `UPDATE opportunities SET lead_id=$1, contractor_id=$2, title=$3, stage=$4,
              expected_headcount=$5, expected_monthly_value=$6, currency=$7, probability=$8,
              expected_close_date=$9, lost_reason_code=$10, lost_reason_text=$11,
              won_at=${wonAt}, lost_at=${lostAt}, updated_at=now()
        WHERE id=$12 RETURNING *`, [...vals, id]);
    return r.rows[0];
  }
  const r = await query(
    `INSERT INTO opportunities (lead_id, contractor_id, title, stage, expected_headcount,
        expected_monthly_value, currency, probability, expected_close_date,
        lost_reason_code, lost_reason_text, won_at, lost_at, owner_user_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${wonAt},${lostAt},$12,$12) RETURNING *`,
    [...vals, req.user?.id]);
  return r.rows[0];
}

/** Kanban: open stages with their counts and weighted value. */
async function pipelineBoard(req) {
  const sc = scopeClause(req, 'o', 'opportunity', 1);
  const r = await query(
    `SELECT o.stage, count(*)::int AS count,
            COALESCE(SUM(o.expected_monthly_value), 0) AS value,
            COALESCE(SUM(o.expected_monthly_value * COALESCE(o.probability,0) / 100.0), 0) AS weighted
       FROM opportunities o WHERE ${sc.sql} GROUP BY o.stage`, sc.params);
  const byStage = new Map(r.rows.map((x) => [x.stage, x]));
  return STAGES.map((s) => ({
    stage: s,
    count: byStage.get(s)?.count || 0,
    value: Number(byStage.get(s)?.value || 0),
    weighted: Number(byStage.get(s)?.weighted || 0),
  }));
}

// ── quotes ──────────────────────────────────────────────────────────────────

function recomputeTotals(lines, vatRate) {
  const net = lines.reduce((s, l) => s + Number(l.line_net || 0), 0);
  const vat = Math.round(net * Number(vatRate) * 100) / 100;
  return { net: Math.round(net * 100) / 100, vat, gross: Math.round((net + vat) * 100) / 100 };
}

/** A line's own subtotal, for the quote's arithmetic only. */
function lineNet(l) {
  const qty = Number(l.quantity ?? 0);
  if (l.billing_basis === 'flat') return Number(l.flat_amount || 0) * (qty || 1);
  if (l.billing_basis === 'per_bed_night') return Number(l.rate_used || 0) * qty;
  return Number(l.rate_per_night || 0) * qty;
}

async function getQuote(req, id) {
  const q = await fetchScoped(req, 'quotes', 'q', 'quote', id);
  if (!q) throw new SalesError('Ajánlat nem található', 404);
  const lines = await query(
    `SELECT ql.*, a.name AS accommodation_name FROM quote_lines ql
       LEFT JOIN accommodations a ON a.id = ql.accommodation_id
      WHERE ql.quote_id = $1 ORDER BY ql.line_no`, [id]);
  return { ...q, lines: lines.rows };
}

async function listQuotes(req, filters = {}) {
  const where = [];
  const params = [];
  let i = 1;
  const sc = scopeClause(req, 'q', 'quote', i);
  where.push(sc.sql); params.push(...sc.params); i = sc.nextIndex;
  if (filters.opportunity_id) { params.push(filters.opportunity_id); where.push(`q.opportunity_id = $${i++}`); }
  if (filters.status) { params.push(filters.status); where.push(`q.status = $${i++}`); }

  const r = await query(
    `SELECT q.*, o.title AS opportunity_title,
            COALESCE(l.name, c.name) AS party_name
       FROM quotes q
       JOIN opportunities o ON o.id = q.opportunity_id
       LEFT JOIN partner_leads l ON l.id = o.lead_id
       LEFT JOIN contractors   c ON c.id = o.contractor_id
      WHERE ${where.join(' AND ')}
      ORDER BY q.created_at DESC LIMIT 500`, params);
  return r.rows;
}

/**
 * Create or replace a quote's lines. A quote is versioned per opportunity; a SENT quote
 * is never edited in place — the caller makes the next version instead.
 */
async function saveQuote(req, id, body) {
  const lines = Array.isArray(body.lines) ? body.lines : [];
  for (const l of lines) {
    if (!BASES.includes(l.billing_basis)) throw new SalesError(`billing_basis: ${BASES.join(' | ')}`);
    if (l.billing_basis === 'flat' && !l.accommodation_id) {
      throw new SalesError('Fix díjas sorhoz szálláshely kötelező (a client_night_rates is ezt követeli)');
    }
    if (l.billing_basis === 'per_person' && num(l.rate_per_night) == null) throw new SalesError('per_person sorhoz díj kötelező');
    if (l.billing_basis === 'flat' && num(l.flat_amount) == null) throw new SalesError('flat sorhoz összeg kötelező');
    if (l.billing_basis === 'per_bed_night' && num(l.rate_used) == null) throw new SalesError('per_bed_night sorhoz díj kötelező');
  }

  return transaction(async (client) => {
    let quoteId = id;
    const vatRate = body.vat_rate == null ? 0.27 : Number(body.vat_rate);

    if (id) {
      const cur = await fetchScoped(req, 'quotes', 'q', 'quote', id);
      if (!cur) throw new SalesError('Ajánlat nem található', 404);
      if (cur.status !== 'draft') {
        throw new SalesError('Csak piszkozat ajánlat szerkeszthető — készíts új verziót', 409);
      }
      await client.query(
        `UPDATE quotes SET valid_until=$1, currency=$2, vat_rate=$3, notes=$4, updated_at=now()
          WHERE id=$5`,
        [body.valid_until || null, body.currency || 'HUF', vatRate, body.notes ?? null, id]);
      await client.query('DELETE FROM quote_lines WHERE quote_id = $1', [id]);
    } else {
      const opp = await fetchScoped(req, 'opportunities', 'o', 'opportunity', body.opportunity_id);
      if (!opp) throw new SalesError('Lehetőség nem található', 404);
      const v = await client.query(
        'SELECT COALESCE(MAX(version),0) + 1 AS next FROM quotes WHERE opportunity_id = $1',
        [body.opportunity_id]);
      const q = await client.query(
        `INSERT INTO quotes (opportunity_id, version, valid_until, currency, vat_rate, notes,
                             owner_user_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
        [body.opportunity_id, v.rows[0].next, body.valid_until || null,
         body.currency || 'HUF', vatRate, body.notes ?? null, req.user?.id]);
      quoteId = q.rows[0].id;
    }

    const stored = [];
    let n = 0;
    for (const l of lines) {
      n += 1;
      const net = lineNet(l);
      stored.push({ line_net: net });
      await client.query(
        `INSERT INTO quote_lines (quote_id, line_no, description, accommodation_id, billing_basis,
            rate_per_night, flat_amount, rate_used, rate_empty, occupancy_floor_pct,
            contracted_beds, quantity, line_net)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [quoteId, n, l.description ?? null, l.accommodation_id || null, l.billing_basis,
         num(l.rate_per_night), num(l.flat_amount), num(l.rate_used), num(l.rate_empty),
         num(l.occupancy_floor_pct), l.contracted_beds ?? null, num(l.quantity), net]);
    }

    const t = recomputeTotals(stored, vatRate);
    await client.query(
      `UPDATE quotes SET net_amount=$1, vat_amount=$2, gross_amount=$3, updated_at=now() WHERE id=$4`,
      [t.net, t.vat, t.gross, quoteId]);

    const out = await client.query('SELECT * FROM quotes WHERE id = $1', [quoteId]);
    return out.rows[0];
  });
}

async function sendQuote(req, id, body = {}) {
  const q = await fetchScoped(req, 'quotes', 'q', 'quote', id);
  if (!q) throw new SalesError('Ajánlat nem található', 404);
  if (q.status !== 'draft') throw new SalesError('Csak piszkozat ajánlat küldhető ki', 409);
  const r = await query(
    `UPDATE quotes SET status='sent', sent_at=now(), sent_to_contact_id=$2, updated_at=now()
      WHERE id=$1 RETURNING *`, [id, body.contact_id || null]);
  return r.rows[0];
}

/**
 * ACCEPT — the step that makes the pipeline feed billing.
 *
 * Writes, in ONE transaction:
 *   • the quote → accepted
 *   • its opportunity → won
 *   • a partner_contracts row (megbízó) for the client
 *   • one client_night_rates row per priced line
 *
 * All of it or none of it: a quote marked accepted without the rate behind it would
 * leave the client billing at nothing, which is precisely the silent-zero failure the
 * billing coverage view exists to catch.
 */
async function acceptQuote(req, id, body = {}) {
  const q = await getQuote(req, id);
  if (q.status === 'accepted') throw new SalesError('Ez az ajánlat már elfogadott', 409);
  if (!['draft', 'sent'].includes(q.status)) throw new SalesError('Csak piszkozat vagy kiküldött ajánlat fogadható el', 409);
  if (q.lines.length === 0) throw new SalesError('Üres ajánlat nem fogadható el');

  return transaction(async (client) => {
    const opp = (await client.query('SELECT * FROM opportunities WHERE id = $1', [q.opportunity_id])).rows[0];

    // The client the rate will hang off. A lead-stage opportunity must be converted
    // first — a rate needs a real contractor row, so this refuses rather than inventing
    // one silently.
    const contractorId = opp.contractor_id;
    if (!contractorId) {
      throw new SalesError(
        'Az ajánlat érdeklődőhöz tartozik. Előbb konvertáld ügyféllé (a díjszabás valódi partnert igényel).', 409);
    }

    const validFrom = body.valid_from || new Date().toISOString().slice(0, 10);

    const contract = await client.query(
      `INSERT INTO partner_contracts (contractor_id, contract_role, title, status, start_date,
                                      is_open_ended, notice_days, currency, notes, created_by)
       VALUES ($1,'megbizo',$2,'active',$3,$4,$5,$6,$7,$8) RETURNING id`,
      [contractorId,
       body.contract_title || `Szerződés — ${opp.title}`,
       validFrom,
       body.is_open_ended !== false,           // default open-ended; see assumptions
       body.notice_days ?? null,
       q.currency,
       `Elfogadott ajánlat v${q.version} alapján.`,
       req.user?.id || null]);

    const rateIds = [];
    for (const l of q.lines) {
      // rate_per_night is NOT NULL-safe but the column is nullable; the engine's
      // per_person path reads it, so mirror the line's own price into it for every
      // basis rather than leaving a hole.
      const perNight = l.billing_basis === 'per_person' ? Number(l.rate_per_night)
        : l.billing_basis === 'per_bed_night' ? Number(l.rate_used)
          : 0;
      const r = await client.query(
        `INSERT INTO client_night_rates (contractor_id, accommodation_id, rate_per_night, currency,
            valid_from, billing_basis, flat_amount, rate_used, rate_empty, occupancy_floor_pct,
            contracted_beds, vat_rate, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [contractorId, l.accommodation_id || null, perNight, q.currency, validFrom,
         l.billing_basis, l.flat_amount, l.rate_used, l.rate_empty, l.occupancy_floor_pct,
         l.contracted_beds, q.vat_rate,
         `Ajánlat v${q.version} ${l.description || ''}`.trim(), req.user?.id || null]);
      rateIds.push(r.rows[0].id);
    }

    // A client we now bill is a megbízó, and megbízó ⊕ szállásadó is mutually exclusive
    // (mig 140) — so only add the tag, never touch an existing szállásadó role here.
    await client.query(
      `INSERT INTO contractor_roles (contractor_id, role, created_by)
       VALUES ($1,'megbizo',$2) ON CONFLICT DO NOTHING`, [contractorId, req.user?.id || null]);

    await client.query(
      `UPDATE quotes SET status='accepted', accepted_at=now(),
              materialised_contract_id=$2, materialised_at=now(), updated_at=now()
        WHERE id=$1`, [id, contract.rows[0].id]);
    await client.query(
      `UPDATE opportunities SET stage='won', won_at=now(), lost_at=NULL, updated_at=now()
        WHERE id=$1`, [q.opportunity_id]);

    logger.info(`[sales] quote ${id} ACCEPTED → contract ${contract.rows[0].id}, ${rateIds.length} rate(s) (user=${req.user?.id})`);
    return { quote_id: id, contract_id: contract.rows[0].id, rate_ids: rateIds, opportunity_id: q.opportunity_id };
  });
}

async function rejectQuote(req, id, body = {}) {
  const q = await fetchScoped(req, 'quotes', 'q', 'quote', id);
  if (!q) throw new SalesError('Ajánlat nem található', 404);
  if (q.status === 'accepted') throw new SalesError('Elfogadott ajánlat nem utasítható el', 409);
  const r = await query(
    `UPDATE quotes SET status='rejected', rejected_at=now(), reject_reason=$2, updated_at=now()
      WHERE id=$1 RETURNING *`, [id, body.reason || null]);
  return r.rows[0];
}


// ── quote sharing (expiring token) ──────────────────────────────────────────
//
// Same security shape as accountantShare / settlement links — token in the URL, expiry
// AND revocation checked on every public read, truncated tokens in logs. Held as COLUMNS
// on `quotes` rather than a fourth share-link table, because a quote's share is 1:1 with
// the quote. (Three near-identical share tables would already be two too many; see the
// assumptions note about unifying them later.)
const crypto = require('crypto');
const DEFAULT_QUOTE_SHARE_DAYS = 30;
const tokenTail = (t) => (t ? `tok_…${String(t).slice(-6)}` : 'tok_…<none>');

async function shareQuote(req, id, body = {}) {
  const q = await fetchScoped(req, 'quotes', 'q', 'quote', id);
  if (!q) throw new SalesError('Ajánlat nem található', 404);
  if (q.status === 'draft') {
    // Sharing a draft invites the client to react to numbers we have not committed to.
    throw new SalesError('Piszkozat ajánlat nem osztható meg — előbb küldd ki', 409);
  }
  const days = Math.max(1, Math.min(parseInt(body.expires_in_days, 10) || DEFAULT_QUOTE_SHARE_DAYS, 365));
  const token = crypto.randomUUID();
  const r = await query(
    `UPDATE quotes SET share_token=$2, share_expires_at=now() + ($3 || ' days')::interval,
            share_revoked_at=NULL, updated_at=now()
      WHERE id=$1 RETURNING share_token, share_expires_at`, [id, token, days]);
  logger.info(`[sales] quote ${id} shared ${tokenTail(token)} for ${days}d (user=${req.user?.id})`);
  return { ...r.rows[0], url: `/public/quote/${token}` };
}

async function revokeQuoteShare(req, id) {
  const q = await fetchScoped(req, 'quotes', 'q', 'quote', id);
  if (!q) throw new SalesError('Ajánlat nem található', 404);
  await query(`UPDATE quotes SET share_revoked_at=now(), updated_at=now() WHERE id=$1`, [id]);
  return { revoked: true };
}

/**
 * Public read by token — NO auth, and deliberately a narrow projection.
 *
 * The client sees their own offer: lines, prices, totals, validity. They do NOT see the
 * opportunity's internal fields (probability, expected value, owner, stage) — those are
 * our commercial position, not theirs.
 */
async function publicQuoteByToken(token) {
  const r = await query(
    `SELECT q.id, q.version, q.status, q.valid_until, q.currency, q.vat_rate,
            q.net_amount, q.vat_amount, q.gross_amount, q.notes, q.sent_at,
            q.share_expires_at, q.share_revoked_at,
            o.title AS opportunity_title,
            COALESCE(l.name, c.name) AS partner_name
       FROM quotes q
       JOIN opportunities o ON o.id = q.opportunity_id
       LEFT JOIN partner_leads l ON l.id = o.lead_id
       LEFT JOIN contractors   c ON c.id = o.contractor_id
      WHERE q.share_token = $1`, [token]);
  const q = r.rows[0];
  if (!q) return null;
  if (q.share_revoked_at) return null;
  if (!q.share_expires_at || new Date(q.share_expires_at) <= new Date()) return null;

  const lines = await query(
    `SELECT ql.line_no, ql.description, ql.billing_basis, ql.rate_per_night, ql.flat_amount,
            ql.rate_used, ql.rate_empty, ql.occupancy_floor_pct, ql.contracted_beds,
            ql.quantity, ql.line_net, a.name AS accommodation_name
       FROM quote_lines ql
       LEFT JOIN accommodations a ON a.id = ql.accommodation_id
      WHERE ql.quote_id = $1 ORDER BY ql.line_no`, [q.id]);

  delete q.share_revoked_at;
  return { ...q, lines: lines.rows };
}

/** A quote plus the names a document needs — used by both the admin and public PDF. */
async function quoteForDocument(quoteId) {
  const r = await query(
    `SELECT q.*, o.title AS opportunity_title, COALESCE(l.name, c.name) AS partner_name
       FROM quotes q
       JOIN opportunities o ON o.id = q.opportunity_id
       LEFT JOIN partner_leads l ON l.id = o.lead_id
       LEFT JOIN contractors   c ON c.id = o.contractor_id
      WHERE q.id = $1`, [quoteId]);
  const q = r.rows[0];
  if (!q) return null;
  const lines = await query(
    `SELECT ql.*, a.name AS accommodation_name FROM quote_lines ql
       LEFT JOIN accommodations a ON a.id = ql.accommodation_id
      WHERE ql.quote_id = $1 ORDER BY ql.line_no`, [quoteId]);
  return { ...q, lines: lines.rows };
}

module.exports = {
  SalesError, STAGES, LEAD_STATUSES, BASES,
  listLeads, saveLead, convertLead,
  listOpportunities, saveOpportunity, pipelineBoard,
  listQuotes, getQuote, saveQuote, sendQuote, acceptQuote, rejectQuote,
  shareQuote, revokeQuoteShare, publicQuoteByToken, quoteForDocument,
  _internals: { scopeClause, canSeeAll, lineNet, recomputeTotals },
};
