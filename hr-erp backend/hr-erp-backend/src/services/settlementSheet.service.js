/**
 * Monthly settlement sheets ("szállástábla") — the outward-facing document that goes
 * to a partner with the invoice.
 *
 * One engine, two aggregations of the SAME stored billing detail:
 *   • SZÁLLÁSADÓ (landlord)  — per accommodation, and combined across their sites.
 *                              What WE owe: bed-nights, rate in force, rent basis,
 *                              the utility lines we pay.
 *   • MEGBÍZÓ (client)       — per client across all their sites. What THEY owe:
 *                              occupied / empty / reduced bed-nights, rate used,
 *                              occupancy floor applied, net / VAT / gross,
 *                              compensation lines, pass-throughs.
 *
 * ── THE ATTRIBUTION RULE (verified 2026-09-02, do not break) ────────────────────────
 * The megbízó attribution is FROZEN into the billing row at calculation time:
 * `accommodation_billings.partner_contractor_id` and the employee list embedded in
 * `calculation_details.rooms[].employees[]` are written from the run's grouping key and
 * are never re-derived. Proven empirically: after a worker's `billing_client_id` was
 * changed A→B without re-billing, the stored row still read A.
 *
 * Therefore this service reads the STORED billing detail and MUST NOT live-join
 * `employees.billing_client_id`. The same probe showed a naive live join would
 * re-attribute a closed month to the new client — which is exactly what an invoiced
 * document must never do.
 *
 * The one place employees are read live is the per-person × per-day grid, and that
 * comes from `occupancy_snapshots` (the historical record billing itself uses), joined
 * to `employees` for NAMES ONLY — never for the client relation.
 */
const { query } = require('../database/connection');

const MONTH_RE = /^\d{4}-\d{2}$/;

class SettlementError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const num = (v) => (v === null || v === undefined ? 0 : Number(v));

/**
 * Munkahely (workplace) is FREE TEXT on employees, which is where "Ikea" vs "IKEA"
 * comes from — `contractors` itself has no duplicates. Group case- and
 * whitespace-insensitively, then display the spelling that occurs most often, so the
 * sheet shows one canonical label per workplace without anyone editing 300 rows.
 *
 * Deliberately conservative: it folds "Ikea" / "IKEA" / " ikea ", but NEVER merges
 * "Ikea" with "Ikea Kft" — those may genuinely be different sites and that is the
 * owner's call, not a report's.
 */
const wpKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

function canonicalWorkplaces(rows) {
  const counts = new Map();
  // Count DISTINCT PEOPLE per spelling, not rows. `rows` is one record per
  // (employee, day), so counting rows weights the tally by how long each person stayed
  // — a single mid-month leaver was enough to demote the correct spelling below a
  // variant. "How many people are recorded this way" is the question that matters.
  const seenPerVariant = new Map();
  for (const r of rows) {
    const raw = String(r.workplace || '').trim().replace(/\s+/g, ' ');
    if (!raw) continue;
    const k = wpKey(raw);
    const dedupeKey = `${raw}|${r.employee_id}`;
    if (seenPerVariant.has(dedupeKey)) continue;
    seenPerVariant.set(dedupeKey, true);
    if (!counts.has(k)) counts.set(k, new Map());
    const m = counts.get(k);
    m.set(raw, (m.get(raw) || 0) + 1);
  }
  // Tie-break matters: with "Ikea" / "IKEA" / " ikea " seen equally often, a purely
  // alphabetical tie-break picks "ikea", and an all-lowercase brand on a document sent
  // to a client looks like a mistake. Prefer, in order: most frequent → mixed case
  // (someone typed it deliberately) → not all-lowercase → alphabetical.
  const caseRank = (v) => {
    const hasLower = /[a-zà-ÿ]/.test(v);
    const hasUpper = /[A-ZÀ-Þ]/.test(v);
    if (hasLower && hasUpper) return 0;   // "Ikea", "Autoliv Kft"
    if (hasUpper) return 1;               // "IKEA"
    return 2;                             // "ikea"
  };
  const canon = new Map();
  const variants = [];
  for (const [k, m] of counts) {
    const sorted = [...m.entries()].sort((a, b) =>
      b[1] - a[1] || caseRank(a[0]) - caseRank(b[0]) || a[0].localeCompare(b[0]));
    canon.set(k, sorted[0][0]);
    if (sorted.length > 1) {
      variants.push({ canonical: sorted[0][0], seen: sorted.map(([v, n]) => `${v} (${n})`) });
    }
  }
  return { canon, variants };
}

/** Local YYYY-MM-DD from a pg DATE (never toISOString — that shifts a day under CEST). */
function ymd(d) {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * Is this month closed? A sheet rendered from a CLOSED month is stable — the engine
 * refuses to re-bill it (mig 148). A sheet from an open month can still move, and the
 * document says so rather than implying a finality it does not have.
 */
async function monthState(month) {
  const r = await query(
    `SELECT id, status, finalized_at, run_type
       FROM billing_runs
      WHERE billing_month = $1 AND run_type = 'incoming' AND status <> 'cancelled'
      ORDER BY started_at DESC LIMIT 1`, [month]);
  if (r.rows.length === 0) return { exists: false, closed: false, label: 'NINCS FUTÁS' };
  const run = r.rows[0];
  const closed = run.status === 'finalized';
  return {
    exists: true,
    closed,
    runId: run.id,
    finalizedAt: run.finalized_at,
    label: closed ? 'ZÁRT' : 'PISZKOZAT',
  };
}

/** Live billing rows for the month — always via the run, never a bare month filter. */
async function liveBillings(month, where = '', params = []) {
  const r = await query(
    `SELECT ab.id, ab.accommodation_id, ab.partner_contractor_id, ab.billing_month,
            ab.total_amount, ab.vat_amount, ab.gross_amount, ab.cost_amount,
            ab.margin_amount, ab.total_employee_days, ab.compensation_amount,
            ab.payroll_handoff, ab.calculation_details,
            a.name AS accommodation_name, a.address AS accommodation_address,
            a.current_contractor_id AS landlord_id,
            ll.name AS landlord_name,
            cl.name AS client_name
       FROM accommodation_billings ab
       JOIN billing_runs br    ON br.id = ab.billing_run_id
       JOIN accommodations a   ON a.id  = ab.accommodation_id
       LEFT JOIN contractors ll ON ll.id = a.current_contractor_id
       LEFT JOIN contractors cl ON cl.id = ab.partner_contractor_id
      WHERE ab.billing_month = $1
        AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
        ${where}
      ORDER BY a.name`,
    [month, ...params]);
  return r.rows;
}

/**
 * Gap B — the per-person × per-day grid.
 *
 * From `occupancy_snapshots`, which is the historical per-(employee, day, accommodation)
 * record the billing engine itself consumes. NOT from employees.arrival_date/end_date,
 * which is the current record projected backwards and mis-attributes anyone who moved
 * mid-month (that is what /reports/occupancy/monthly does, and why it is not
 * billing-grade).
 *
 * `employees` is joined for the NAME only. The client relation is never read here.
 */
async function personDayGrid(month, accommodationIds) {
  if (!accommodationIds.length) return { days: [], people: [] };
  const r = await query(
    `SELECT os.employee_id, os.accommodation_id,
            TO_CHAR(os.snapshot_date, 'YYYY-MM-DD') AS day,
            COALESCE(NULLIF(TRIM(e.last_name || ' ' || COALESCE(e.first_name,'')), ''), 'n/a') AS name,
            e.workplace,
            ar.room_number,
            a.name AS accommodation_name
       FROM occupancy_snapshots os
       LEFT JOIN employees e            ON e.id  = os.employee_id
       LEFT JOIN accommodations a       ON a.id  = os.accommodation_id
       LEFT JOIN accommodation_rooms ar ON ar.id = os.room_id
      WHERE TO_CHAR(os.snapshot_date, 'YYYY-MM') = $1
        AND os.accommodation_id = ANY($2::uuid[])
      ORDER BY name, day`,
    [month, accommodationIds]);

  const dim = daysInMonth(month);
  const days = Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);

  const { canon, variants } = canonicalWorkplaces(r.rows);

  const byPerson = new Map();
  for (const row of r.rows) {
    const key = `${row.employee_id}|${row.accommodation_id}`;
    if (!byPerson.has(key)) {
      byPerson.set(key, {
        employee_id: row.employee_id,
        accommodation_id: row.accommodation_id,
        accommodation_name: row.accommodation_name,
        name: row.name,
        workplace: canon.get(wpKey(row.workplace)) || null,
        room_number: row.room_number || null,
        nights: new Set(),
      });
    }
    byPerson.get(key).nights.add(row.day);
  }

  const people = [...byPerson.values()]
    .map((p) => ({
      ...p,
      nights: undefined,
      grid: days.map((d) => p.nights.has(d)),
      bed_nights: p.nights.size,
    }))
    // Munkahely → Szálláshely → Szoba → Név, matching how the manual sheet reads.
    .sort((a, b) =>
      String(a.workplace || '').localeCompare(String(b.workplace || ''), 'hu')
      || String(a.accommodation_name || '').localeCompare(String(b.accommodation_name || ''), 'hu')
      || String(a.room_number || '').localeCompare(String(b.room_number || ''), 'hu', { numeric: true })
      || a.name.localeCompare(b.name, 'hu'));

  return { days, people, workplace_variants: variants };
}

/**
 * "Üres" rows — the empty beds the manual sheet tracks as rows with Név = "Üres".
 *
 * These are the beds we BILL the client for although nobody slept in them, which is
 * what `contracted_beds` + `occupancy_floor_pct` produce: on each day the client is
 * charged for `full = max(occupied, ceil(capacity × floor))` beds, and the remaining
 * `capacity − full` are billed at the empty rate. Summed over the month that is the
 * engine's `reduced_bed_nights`, so this reconstruction is checked against it.
 *
 * DEVIATION FROM THE MANUAL SHEET, on purpose: the manual version has one row per empty
 * BED. We do not track bed identity — only counts — so inventing 13 indistinguishable
 * "Üres" rows would be fabricating detail we do not have. Instead there is ONE "Üres"
 * row per site whose daily cell holds the NUMBER of empty beds that day. It totals to
 * the same bed-nights and reconciles with the billed figure.
 */
function emptyBedRows(site, grid, days) {
  const cap = num(site.contracted_beds);
  if (!cap) return null;                       // no contracted block → nothing billed empty
  const floor = site.floor_pct == null ? 0 : Number(site.floor_pct);

  const ofSite = grid.people.filter((p) => p.accommodation_id === site.accommodation_id);
  const perDay = days.map((_, i) => {
    const occupied = ofSite.reduce((n, p) => n + (p.grid[i] ? 1 : 0), 0);
    if (occupied === 0) return 0;              // engine bills nothing on an unoccupied day
    const full = Math.max(occupied, Math.ceil(cap * floor));
    return Math.max(0, cap - full);
  });

  return {
    is_empty_row: true,
    name: 'Üres',
    workplace: null,
    accommodation_id: site.accommodation_id,
    accommodation_name: site.accommodation_name,
    room_number: null,
    counts: perDay,                            // a COUNT per day, not a 1/0 flag
    bed_nights: perDay.reduce((a, b) => a + b, 0),
    contracted_beds: cap,
    floor_pct: site.floor_pct,
  };
}

// ── (a) SZÁLLÁSADÓ ──────────────────────────────────────────────────────────

/**
 * What we owe a landlord for a month.
 *
 * A landlord's settlement is per ACCOMMODATION regardless of which client's workers
 * slept there, so this aggregates the (accommodation × client) billing rows back up to
 * the accommodation — the cost side is the landlord's whole story.
 */
async function landlordSheet({ month, landlordId }) {
  if (!MONTH_RE.test(month)) throw new SettlementError('Hónap formátum: YYYY-MM');
  if (!landlordId) throw new SettlementError('landlord_id kötelező');

  const ll = await query('SELECT id, name, tax_number, address, bank_account FROM contractors WHERE id = $1', [landlordId]);
  if (ll.rows.length === 0) throw new SettlementError('Szállásadó nem található', 404);

  const rows = await liveBillings(month, 'AND a.current_contractor_id = $2', [landlordId]);
  const state = await monthState(month);

  // Collapse (accommodation × client) → accommodation.
  const byAcc = new Map();
  for (const r of rows) {
    if (!byAcc.has(r.accommodation_id)) {
      byAcc.set(r.accommodation_id, {
        accommodation_id: r.accommodation_id,
        accommodation_name: r.accommodation_name,
        address: r.accommodation_address,
        rent_basis: r.calculation_details?.rent_basis || null,
        rent_rate_used: r.calculation_details?.rent_rate_used ?? null,
        rent_site_total: num(r.calculation_details?.rent_site_total),
        bed_nights: 0,
        cost_total: 0,
        utility_lines_we_pay: r.calculation_details?.utility_lines_we_pay || [],
      });
    }
    const acc = byAcc.get(r.accommodation_id);
    acc.cost_total += num(r.cost_amount);
    acc.bed_nights += num(r.calculation_details?.rent_bed_nights
      ?? r.calculation_details?.per_bed?.occupied_bed_nights);
    // Deliberately NOT recorded: which client each row belonged to, or any client-side
    // price. This document goes to the landlord — it is their house, so they see
    // everyone housed there, but never who a worker is placed with or what we charge
    // for them. The (accommodation × client) rows are collapsed here precisely so that
    // attribution cannot leak into the rendered sheet.
  }

  const accommodations = [...byAcc.values()];
  const grid = await personDayGrid(month, accommodations.map((a) => a.accommodation_id));

  // A free-text room label can carry a client's name ("201-IKEA"), which would leak the
  // attribution this document is specifically supposed to withhold. The client names
  // billed at these properties are known here, so scan for them and redact — the names
  // are used ONLY to match and are never emitted.
  //
  // Redact rather than drop: the landlord still needs to identify the room. Warn rather
  // than silently rewrite: the real fix is renaming the room, which is the operator's
  // call, so the sheet reports what it had to mask.
  const clientNames = [...new Set(rows.map((r) => r.client_name).filter(Boolean))];
  const privacyWarnings = [];
  if (clientNames.length) {
    const escaped = clientNames
      .map((n) => String(n).trim())
      .filter((n) => n.length >= 3)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      // also match the name with separators stripped, e.g. "Teszt Megbízó Zrt" in
      // "201-TesztMegbizoZrt"
      .flatMap((n) => [n, n.replace(/\s+/g, '\\s*')]);
    const re = new RegExp(`(${escaped.join('|')})`, 'gi');
    const deaccent = (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const p of grid.people) {
      if (!p.room_number) continue;
      const plain = deaccent(p.room_number);
      const hit = clientNames.some((n) => plain.toLowerCase().includes(deaccent(n).replace(/\s+/g, '').toLowerCase()))
        || re.test(p.room_number);
      re.lastIndex = 0;
      if (hit) {
        privacyWarnings.push({ room_number: p.room_number, reason: 'ügyfélnevet tartalmazó szobafelirat — elrejtve' });
        p.room_number = '—';
      }
    }
  }

  return {
    kind: 'landlord',
    privacy_warnings: privacyWarnings,
    month,
    state,
    partner: ll.rows[0],
    accommodations,
    grid,
    totals: {
      bed_nights: accommodations.reduce((s, a) => s + a.bed_nights, 0),
      // What we owe. The landlord side has no VAT here: what we pay is driven by the
      // cost terms, and the landlord invoices us — their VAT is on THEIR document.
      cost_total: accommodations.reduce((s, a) => s + a.cost_total, 0),
    },
  };
}

// ── (b) MEGBÍZÓ ─────────────────────────────────────────────────────────────

/**
 * What a client owes us for a month, across every site their workers slept at.
 *
 * Reads `partner_contractor_id` — the attribution frozen at calculation time. It does
 * NOT resolve the client through `employees.billing_client_id`; see the header.
 */
async function clientSheet({ month, clientId }) {
  if (!MONTH_RE.test(month)) throw new SettlementError('Hónap formátum: YYYY-MM');
  if (!clientId) throw new SettlementError('client_id kötelező');

  const cl = await query(
    `SELECT c.id, c.name, c.tax_number, c.address, c.billing_email,
            p.legal_type, p.vat_exemption_reason, p.invoicing_enabled
       FROM contractors c
       LEFT JOIN client_billing_profiles p ON p.contractor_id = c.id
      WHERE c.id = $1`, [clientId]);
  if (cl.rows.length === 0) throw new SettlementError('Megbízó nem található', 404);

  const rows = await liveBillings(month, 'AND ab.partner_contractor_id = $2', [clientId]);
  const state = await monthState(month);

  const sites = rows.map((r) => {
    const d = r.calculation_details || {};
    const pb = d.per_bed || {};
    return {
      accommodation_id: r.accommodation_id,
      accommodation_name: r.accommodation_name,
      address: r.accommodation_address,
      billing_basis: d.billing_basis || null,
      employee_days: num(r.total_employee_days),
      occupied_bed_nights: num(pb.occupied_bed_nights),
      full_bed_nights: num(pb.full_bed_nights),
      empty_bed_nights: num(pb.empty_bed_nights),
      reduced_bed_nights: num(pb.reduced_bed_nights),
      contracted_beds: pb.contracted_beds ?? null,
      floor_pct: pb.floor_pct ?? null,
      rate_used: pb.rate_used ?? null,
      rate_empty: pb.rate_empty ?? null,
      base_net: num(d.base_net ?? d.revenue_net),
      utility_passthrough_net: num(d.utility_passthrough_net),
      utility_passthrough_lines: d.utility_passthrough_lines || [],
      compensation_amount: num(r.compensation_amount),
      compensation_lines: d.compensation_lines || [],
      vat_rate: d.vat_rate ?? null,
      vat_exempt: !!d.vat_exempt,
      net: num(r.total_amount),
      vat: num(r.vat_amount),
      gross: num(r.gross_amount ?? r.total_amount),
      payroll_handoff: !!r.payroll_handoff,
      // Names of the people billed to THIS client at THIS site, as frozen at
      // calculation time — not a live lookup.
      people: (d.rooms || []).flatMap((rm) => (rm.employees || []).map((e) => ({
        employee_id: e.employee_id, name: e.name, days: e.days, room_number: rm.room_number || null,
      }))),
    };
  });

  const grid = await personDayGrid(month, sites.map((s) => s.accommodation_id));
  // The grid is per accommodation, so at a shared site it would show other clients'
  // people too. Restrict it to the employees this client was actually billed for.
  //
  // Match on employee_id, NEVER on name: the engine writes "first last" into the stored
  // detail while this grid builds "last first" for Hungarian sorting, so a name-based
  // intersection is silently empty (it was, until this was caught).
  const billedIds = new Set(sites.flatMap((s) => s.people.map((p) => p.employee_id)).filter(Boolean));
  if (billedIds.size > 0) grid.people = grid.people.filter((p) => billedIds.has(p.employee_id));

  // Present ONE name order across the whole document. The engine stored "first last"
  // in the billing detail; the grid builds "last first", which is the Hungarian
  // convention and how the sheet sorts. Without this the same person appears twice in
  // one workbook under two different orderings, which reads like two people.
  // The stored value stays authoritative — this only relabels for display.
  const canonical = new Map(grid.people.map((p) => [p.employee_id, p.name]));
  for (const site of sites) {
    for (const p of site.people) {
      if (p.employee_id && canonical.has(p.employee_id)) p.name = canonical.get(p.employee_id);
    }
    site.people.sort((a, b) => String(a.name).localeCompare(String(b.name), 'hu'));
  }

  // "Üres" rows, one per site that has a contracted block.
  const emptyRows = sites.map((st) => emptyBedRows(st, grid, grid.days)).filter(Boolean);
  // Reconcile the reconstruction against what the engine actually billed. A mismatch
  // means the empty-bed maths here has drifted from the engine's, and the sheet must
  // say so rather than quietly present a different number to a paying client.
  const reconstructed = emptyRows.reduce((n, r) => n + r.bed_nights, 0);
  const billedReduced = sites.reduce((n, st) => n + num(st.reduced_bed_nights), 0);

  return {
    kind: 'client',
    month,
    state,
    partner: cl.rows[0],
    sites,
    grid,
    empty_rows: emptyRows,
    empty_reconciles: reconstructed === billedReduced,
    empty_reconciliation: { reconstructed, billed: billedReduced },
    totals: {
      occupied_bed_nights: sites.reduce((s, x) => s + x.occupied_bed_nights, 0),
      empty_bed_nights: sites.reduce((s, x) => s + x.empty_bed_nights, 0),
      reduced_bed_nights: sites.reduce((s, x) => s + x.reduced_bed_nights, 0),
      net: sites.reduce((s, x) => s + x.net, 0),
      vat: sites.reduce((s, x) => s + x.vat, 0),
      gross: sites.reduce((s, x) => s + x.gross, 0),
      compensation: sites.reduce((s, x) => s + x.compensation_amount, 0),
      passthrough: sites.reduce((s, x) => s + x.utility_passthrough_net, 0),
    },
  };
}

/** Partners that actually have a settlement for a month (drives the admin picker). */
async function availablePartners(month) {
  if (!MONTH_RE.test(month)) throw new SettlementError('Hónap formátum: YYYY-MM');
  const r = await query(
    `SELECT DISTINCT 'landlord' AS kind, a.current_contractor_id AS id, ll.name
       FROM accommodation_billings ab
       JOIN billing_runs br  ON br.id = ab.billing_run_id
       JOIN accommodations a ON a.id  = ab.accommodation_id
       LEFT JOIN contractors ll ON ll.id = a.current_contractor_id
      WHERE ab.billing_month = $1 AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
        AND a.current_contractor_id IS NOT NULL
     UNION
     SELECT DISTINCT 'client', ab.partner_contractor_id, cl.name
       FROM accommodation_billings ab
       JOIN billing_runs br ON br.id = ab.billing_run_id
       LEFT JOIN contractors cl ON cl.id = ab.partner_contractor_id
      WHERE ab.billing_month = $1 AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
        AND ab.partner_contractor_id IS NOT NULL
     ORDER BY 1, 3`, [month]);
  return r.rows;
}

module.exports = {
  SettlementError,
  landlordSheet, clientSheet, availablePartners,
  monthState, personDayGrid,
  _helpers: { ymd, daysInMonth },
};
