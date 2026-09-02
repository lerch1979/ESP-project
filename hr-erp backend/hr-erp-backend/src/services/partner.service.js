/**
 * Partner module — contacts + contracts.
 *
 * Everything here hangs off a "party": exactly one of contractor / accommodation /
 * lead (lead arrives in Phase 3). `resolveParty` is the single place that reads a
 * party out of a request, so no controller invents its own convention.
 *
 * Tenant scope reuses `utils/tenantScope` rather than growing a private copy — the
 * owning contractor of an accommodation-party row is the accommodation's
 * current_contractor_id, the same rule compensations use.
 */
const { query, transaction } = require('../database/connection');
const { scopeOf, ownsRow } = require('../utils/tenantScope');

const PARTY_KEYS = ['contractor_id', 'accommodation_id', 'lead_id'];
const VALID_ROLES = ['megbizo', 'szallasado', 'alvallalkozo'];
const VALID_STATUSES = ['draft', 'active', 'expired', 'terminated'];
const VALID_RENEWAL = ['none', 'auto', 'option'];

class PartnerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Pull exactly one party key out of a body/query. Returns {key, id}.
 * A contract may name BOTH a contractor and an accommodation — that pair IS a lease —
 * so contracts pass `allowLeasePair`.
 */
function resolveParty(src, { allowLeasePair = false } = {}) {
  const present = PARTY_KEYS.filter((k) => src[k]);
  if (allowLeasePair
      && present.length === 2
      && src.contractor_id && src.accommodation_id) {
    return { key: 'lease', contractor_id: src.contractor_id, accommodation_id: src.accommodation_id };
  }
  if (present.length !== 1) {
    throw new PartnerError(
      'Pontosan egy fél adható meg: contractor_id, accommodation_id vagy lead_id'
      + (allowLeasePair ? ' (bérleti szerződésnél contractor_id + accommodation_id együtt).' : '.'),
    );
  }
  return { key: present[0], id: src[present[0]] };
}

/** The contractor that owns a party, for tenant scoping. */
async function ownerContractorOf({ contractor_id, accommodation_id }) {
  if (contractor_id) return contractor_id;
  if (accommodation_id) {
    const r = await query('SELECT current_contractor_id FROM accommodations WHERE id = $1', [accommodation_id]);
    if (r.rows.length === 0) throw new PartnerError('Szálláshely nem található', 404);
    return r.rows[0].current_contractor_id;
  }
  return null; // lead — Phase 3
}

async function assertPartyInScope(req, party) {
  const owner = await ownerContractorOf(party);
  if (!ownsRow(scopeOf(req), owner)) throw new PartnerError('Nem található', 404);
}

// ── contacts ────────────────────────────────────────────────────────────────

async function listContacts(req, filters = {}) {
  const party = resolveParty(filters);
  await assertPartyInScope(req, { [party.key]: party.id });
  const r = await query(
    `SELECT * FROM partner_contacts
      WHERE ${party.key} = $1
        AND ($2::boolean IS NOT TRUE OR is_active)
      ORDER BY is_primary DESC, is_active DESC, name`,
    [party.id, filters.active_only === 'true'],
  );
  return r.rows;
}

/**
 * Create/update a contact. Setting is_primary demotes the previous primary IN THE SAME
 * TRANSACTION — the partial unique index would otherwise reject the insert, and doing
 * it in two statements outside a transaction could leave a party with none.
 */
async function saveContact(req, id, body) {
  const party = resolveParty(body);
  await assertPartyInScope(req, { [party.key]: party.id });

  if (!body.name || !String(body.name).trim()) throw new PartnerError('A név kötelező');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    throw new PartnerError('Érvénytelen email cím');
  }

  return transaction(async (client) => {
    if (body.is_primary) {
      await client.query(
        `UPDATE partner_contacts SET is_primary = false, updated_at = now()
          WHERE ${party.key} = $1 AND is_primary AND ($2::uuid IS NULL OR id <> $2)`,
        [party.id, id || null],
      );
    }

    const cols = {
      name: String(body.name).trim(),
      role_title: body.role_title ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      language: body.language || 'hu',
      is_primary: !!body.is_primary,
      is_active: body.is_active === undefined ? true : !!body.is_active,
      notes: body.notes ?? null,
    };

    if (id) {
      const r = await client.query(
        `UPDATE partner_contacts SET
           name=$1, role_title=$2, phone=$3, email=$4, language=$5,
           is_primary=$6, is_active=$7, notes=$8, updated_at=now()
         WHERE id=$9 AND ${party.key} = $10
         RETURNING *`,
        [...Object.values(cols), id, party.id],
      );
      if (r.rows.length === 0) throw new PartnerError('Kapcsolattartó nem található', 404);
      return r.rows[0];
    }

    const r = await client.query(
      `INSERT INTO partner_contacts
         (${party.key}, name, role_title, phone, email, language, is_primary, is_active, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [party.id, ...Object.values(cols), req.user?.id || null],
    );
    return r.rows[0];
  });
}

async function deleteContact(req, id) {
  const cur = await query('SELECT * FROM partner_contacts WHERE id = $1', [id]);
  if (cur.rows.length === 0) throw new PartnerError('Kapcsolattartó nem található', 404);
  const row = cur.rows[0];
  await assertPartyInScope(req, row);
  await query('DELETE FROM partner_contacts WHERE id = $1', [id]);
  return { deleted: true };
}

// ── contracts ───────────────────────────────────────────────────────────────

function validateContract(body) {
  if (!VALID_ROLES.includes(body.contract_role)) {
    throw new PartnerError(`contract_role: ${VALID_ROLES.join(' | ')}`);
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    throw new PartnerError(`status: ${VALID_STATUSES.join(' | ')}`);
  }
  if (body.renewal_type && !VALID_RENEWAL.includes(body.renewal_type)) {
    throw new PartnerError(`renewal_type: ${VALID_RENEWAL.join(' | ')}`);
  }
  if (body.accommodation_id && body.contract_role !== 'szallasado') {
    throw new PartnerError('Ingatlanhoz kötött (bérleti) szerződés csak szállásadó szerepkörrel rögzíthető');
  }
  if (body.is_open_ended && body.end_date) {
    throw new PartnerError('Határozatlan idejű szerződésnek nincs lejárati dátuma');
  }
  if (body.end_date && body.start_date && body.end_date < body.start_date) {
    throw new PartnerError('A lejárat nem lehet a kezdet előtt');
  }
  if (body.notice_days != null && Number(body.notice_days) < 0) {
    throw new PartnerError('A felmondási idő nem lehet negatív');
  }
  if (body.financial_exit && !['immediate', 'notice'].includes(body.financial_exit)) {
    throw new PartnerError('financial_exit: immediate | notice');
  }
}

const CONTRACT_SELECT = `
  SELECT pc.*,
         c.name  AS contractor_name,
         a.name  AS accommodation_name,
         CASE WHEN pc.accommodation_id IS NOT NULL THEN true ELSE false END AS is_lease,
         -- The soonest thing a human must act on: give notice before it renews,
         -- otherwise the expiry itself.
         -- ROLLING NOTICE (2026-09-02). An open-ended contract has no end_date, so it
         -- has no notice_deadline either — but it is still exitable: serve notice today
         -- and we are out in notice_days. That earliest-exit date is exactly what the
         -- board exists to show ("which sites could I leave, and by when"), so it is
         -- computed here rather than leaving such contracts undated and invisible.
         CASE WHEN pc.is_open_ended AND pc.notice_days IS NOT NULL
              THEN CURRENT_DATE + pc.notice_days
         END AS earliest_exit_date,

         -- ── LEGAL vs FINANCIAL exit (mig 147) ────────────────────────────────
         -- When the RELATIONSHIP ends. Open-ended: serve notice today, out in
         -- notice_days. Fixed-term: at end_date (notice_deadline is when we must
         -- DECIDE, not when we are out).
         COALESCE(
           CASE WHEN pc.is_open_ended AND pc.notice_days IS NOT NULL
                THEN CURRENT_DATE + pc.notice_days END,
           pc.end_date
         ) AS legal_exit_date,

         -- When the COST stops. An explicit override wins; otherwise derive from the
         -- cost terms in force TODAY on the linked property. Per-actual-use with no
         -- minimum means we can reach zero cost by moving people out, without
         -- terminating — so the notice period does not gate our exposure. Anything
         -- else (flat rent, or a per-use deal with a floor) keeps costing until the
         -- relationship actually ends.
         COALESCE(
           pc.financial_exit,
           CASE
             WHEN pc.accommodation_id IS NULL THEN 'notice'   -- no property = no cost basis to reason about
             WHEN cur.rent_basis = 'per_bed_night'
              AND cur.min_bed_nights IS NULL
              AND cur.min_monthly_amount IS NULL THEN 'immediate'
             ELSE 'notice'
           END
         ) AS financial_exit_kind,

         CASE
           WHEN COALESCE(
                  pc.financial_exit,
                  CASE
                    WHEN pc.accommodation_id IS NULL THEN 'notice'
                    WHEN cur.rent_basis = 'per_bed_night'
                     AND cur.min_bed_nights IS NULL
                     AND cur.min_monthly_amount IS NULL THEN 'immediate'
                    ELSE 'notice'
                  END) = 'immediate'
           THEN CURRENT_DATE
           ELSE COALESCE(
                  CASE WHEN pc.is_open_ended AND pc.notice_days IS NOT NULL
                       THEN CURRENT_DATE + pc.notice_days END,
                  pc.end_date)
         END AS financial_exit_date,

         -- Surfaced so the UI can explain WHY, rather than asserting a conclusion.
         cur.rent_basis        AS cost_basis,
         cur.min_bed_nights    AS cost_min_bed_nights,
         cur.min_monthly_amount AS cost_min_monthly_amount,
         LEAST(
           COALESCE(pc.notice_deadline, DATE '9999-12-31'),
           COALESCE(pc.end_date,        DATE '9999-12-31'),
           -- A rolling exit sorts by when we could actually be out.
           COALESCE(CASE WHEN pc.is_open_ended AND pc.notice_days IS NOT NULL
                         THEN CURRENT_DATE + pc.notice_days END, DATE '9999-12-31')
         ) AS next_action_date,
         CASE
           WHEN pc.notice_deadline IS NOT NULL AND pc.notice_deadline >= CURRENT_DATE THEN 'notice'
           WHEN pc.end_date        IS NOT NULL AND pc.end_date        >= CURRENT_DATE THEN 'expiry'
           -- 'rolling' is deliberately its own kind: unlike 'notice' it never expires
           -- and can never be missed, so the UI must not colour it as a deadline.
           WHEN pc.is_open_ended AND pc.notice_days IS NOT NULL                       THEN 'rolling'
           WHEN pc.notice_deadline IS NOT NULL OR pc.end_date IS NOT NULL             THEN 'overdue'
         END AS next_action_kind
    FROM partner_contracts pc
    LEFT JOIN contractors    c ON c.id = pc.contractor_id
    LEFT JOIN accommodations a ON a.id = pc.accommodation_id
    -- The cost terms in force TODAY for the linked property. Today's row (not the
    -- month being billed) is right here: the question is "if I acted now, when would
    -- the cost stop", which depends on the agreement currently in force.
    LEFT JOIN LATERAL (
      SELECT arr.rent_basis, arr.min_bed_nights, arr.min_monthly_amount
        FROM accommodation_rent_rates arr
       WHERE arr.accommodation_id = pc.accommodation_id
         AND arr.valid_from <= CURRENT_DATE
         AND (arr.valid_to IS NULL OR arr.valid_to >= CURRENT_DATE)
       ORDER BY arr.valid_from DESC
       LIMIT 1
    ) cur ON TRUE`;

/**
 * Contract board / list. Default ordering is by soonest actionable date — the question
 * "which sites can we still exit this quarter" is answered by notice deadlines, not by
 * expiry dates, so a contract whose notice window closes first sorts first.
 */
async function listContracts(req, filters = {}) {
  const where = [];
  const params = [];
  let i = 1;

  const s = scopeOf(req);
  if (!s.all) {
    if (!s.contractorId) return { contracts: [] };
    params.push(s.contractorId);
    where.push(`(pc.contractor_id = $${i} OR a.current_contractor_id = $${i})`);
    i += 1;
  }
  if (filters.contractor_id)    { params.push(filters.contractor_id);    where.push(`pc.contractor_id = $${i++}`); }
  if (filters.accommodation_id) { params.push(filters.accommodation_id); where.push(`pc.accommodation_id = $${i++}`); }
  if (filters.contract_role)    { params.push(filters.contract_role);    where.push(`pc.contract_role = $${i++}`); }
  if (filters.status)           { params.push(filters.status);           where.push(`pc.status = $${i++}`); }
  if (filters.leases_only === 'true') where.push('pc.accommodation_id IS NOT NULL');

  // "actionable within N days" — the board's default lens.
  if (filters.within_days) {
    params.push(parseInt(filters.within_days, 10));
    // Must stay identical to next_action_date in CONTRACT_SELECT — including the
    // rolling-exit arm. It previously duplicated only two of the three terms, so an
    // open-ended contract could never appear in any horizon.
    where.push(`LEAST(COALESCE(pc.notice_deadline, DATE '9999-12-31'),
                      COALESCE(pc.end_date,        DATE '9999-12-31'),
                      COALESCE(CASE WHEN pc.is_open_ended AND pc.notice_days IS NOT NULL
                                    THEN CURRENT_DATE + pc.notice_days END, DATE '9999-12-31'))
                <= CURRENT_DATE + ($${i++} || ' days')::interval`);
  }

  const sql = `${CONTRACT_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY next_action_date ASC, pc.end_date ASC NULLS LAST, pc.created_at DESC`;
  const r = await query(sql, params);
  return { contracts: r.rows };
}

async function getContract(req, id) {
  const r = await query(`${CONTRACT_SELECT} WHERE pc.id = $1`, [id]);
  if (r.rows.length === 0) throw new PartnerError('Szerződés nem található', 404);
  const row = r.rows[0];
  await assertPartyInScope(req, row);
  return row;
}

async function saveContract(req, id, body) {
  const party = resolveParty(body, { allowLeasePair: true });
  validateContract(body);
  await assertPartyInScope(req, party.key === 'lease' ? party : { [party.key]: party.id });

  const contractorId    = party.key === 'lease' ? party.contractor_id    : (party.key === 'contractor_id'    ? party.id : null);
  const accommodationId = party.key === 'lease' ? party.accommodation_id : (party.key === 'accommodation_id' ? party.id : null);

  const vals = [
    contractorId, accommodationId, body.contract_role,
    body.contract_no ?? null, body.title ?? null, body.status || 'draft',
    body.start_date || null, body.end_date || null, !!body.is_open_ended,
    body.notice_days ?? null,
    body.renewal_type || 'none', body.renewal_term_months ?? null,
    body.parent_contract_id || null, body.signed_at || null, body.document_id || null,
    body.currency || 'HUF', body.indexation_note ?? null, body.notes ?? null,
    body.financial_exit ?? null,
  ];

  if (id) {
    const r = await query(
      `UPDATE partner_contracts SET
         contractor_id=$1, accommodation_id=$2, contract_role=$3, contract_no=$4, title=$5,
         status=$6, start_date=$7, end_date=$8, is_open_ended=$9, notice_days=$10,
         renewal_type=$11, renewal_term_months=$12, parent_contract_id=$13, signed_at=$14,
         document_id=$15, currency=$16, indexation_note=$17, notes=$18,
         financial_exit=$19, updated_at=now()
       WHERE id=$20 RETURNING *`,
      [...vals, id],
    );
    if (r.rows.length === 0) throw new PartnerError('Szerződés nem található', 404);
    return r.rows[0];
  }

  const r = await query(
    `INSERT INTO partner_contracts
       (contractor_id, accommodation_id, contract_role, contract_no, title, status,
        start_date, end_date, is_open_ended, notice_days, renewal_type, renewal_term_months,
        parent_contract_id, signed_at, document_id, currency, indexation_note, notes,
        financial_exit, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [...vals, req.user?.id || null],
  );
  return r.rows[0];
}

async function deleteContract(req, id) {
  await getContract(req, id); // scope check + 404
  await query('DELETE FROM partner_contracts WHERE id = $1', [id]);
  return { deleted: true };
}


// ── activities + follow-ups ─────────────────────────────────────────────────

const VALID_KINDS = ['note', 'call', 'meeting', 'email', 'offer_sent'];

const KIND_LABEL_HU = {
  note: 'Jegyzet', call: 'Hívás', meeting: 'Találkozó',
  email: 'E-mail', offer_sent: 'Ajánlat kiküldve',
};

async function listActivities(req, filters = {}) {
  const party = resolveParty(filters);
  await assertPartyInScope(req, { [party.key]: party.id });
  const r = await query(
    `SELECT pa.*,
            pc.name AS contact_name,
            t.status   AS follow_up_status,
            t.due_date AS follow_up_due_date,
            t.title    AS follow_up_title
       FROM partner_activities pa
       LEFT JOIN partner_contacts pc ON pc.id = pa.contact_id
       LEFT JOIN tasks t             ON t.id  = pa.follow_up_task_id
      WHERE pa.${party.key} = $1
      ORDER BY pa.occurred_at DESC, pa.created_at DESC
      LIMIT $2`,
    [party.id, Math.min(parseInt(filters.limit, 10) || 200, 500)],
  );
  return r.rows;
}

/**
 * Create an activity, and — when a follow-up date is given — a REAL task to carry it.
 *
 * Both rows are written in ONE transaction. A half-written follow-up (an activity
 * promising a callback with no task behind it, or an orphan task) is exactly the
 * silent-failure shape this codebase keeps getting bitten by, and the DB CHECK
 * `partner_activities_followup_chk` would reject it anyway.
 */
async function createActivity(req, body) {
  const party = resolveParty(body);
  await assertPartyInScope(req, { [party.key]: party.id });

  const kind = body.kind || 'note';
  if (!VALID_KINDS.includes(kind)) throw new PartnerError(`kind: ${VALID_KINDS.join(' | ')}`);
  if (!body.subject && !body.body) throw new PartnerError('Tárgy vagy leírás megadása kötelező');

  if (body.contact_id) {
    const c = await query(`SELECT ${party.key} AS owner FROM partner_contacts WHERE id = $1`, [body.contact_id]);
    if (c.rows.length === 0 || c.rows[0].owner !== party.id) {
      throw new PartnerError('A kapcsolattartó nem ehhez a félhez tartozik');
    }
  }

  const ownerContractor = await ownerContractorOf({ [party.key]: party.id });

  return transaction(async (client) => {
    let followUpTaskId = null;

    if (body.follow_up_at) {
      const partyName = await partyLabel(client, party);
      const title = body.follow_up_title
        || `Utánkövetés — ${partyName}${body.subject ? `: ${body.subject}` : ''}`;

      // Reuse the ordinary standalone-task shape so the follow-up shows up in the
      // Kanban/GTD views staff already use, with the partner it is about attached.
      const t = await client.query(
        `INSERT INTO tasks
           (title, description, status, priority, assigned_to, due_date, deadline,
            contractor_id, created_by, related_contractor_id, tags)
         VALUES ($1,$2,'todo',$3,$4,$5::timestamptz::date,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          title,
          body.body || null,
          body.follow_up_priority || 'medium',
          body.follow_up_assigned_to || req.user?.id || null,
          body.follow_up_at,
          req.user?.contractorId || ownerContractor || null,
          req.user?.id || null,
          party.key === 'contractor_id' ? party.id : ownerContractor,
          ['partner-utankovetes'],
        ],
      );
      followUpTaskId = t.rows[0].id;
    }

    const a = await client.query(
      `INSERT INTO partner_activities
         (${party.key}, contact_id, kind, occurred_at, subject, body,
          follow_up_at, follow_up_task_id, created_by)
       VALUES ($1,$2,$3,COALESCE($4, now()),$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        party.id, body.contact_id || null, kind, body.occurred_at || null,
        body.subject || null, body.body || null,
        body.follow_up_at || null, followUpTaskId, req.user?.id || null,
      ],
    );
    return a.rows[0];
  });
}

/** Human label for a party, used in the generated follow-up task title. */
async function partyLabel(client, party) {
  if (party.key === 'contractor_id') {
    const r = await client.query('SELECT name FROM contractors WHERE id = $1', [party.id]);
    return r.rows[0]?.name || 'Partner';
  }
  if (party.key === 'accommodation_id') {
    const r = await client.query('SELECT name FROM accommodations WHERE id = $1', [party.id]);
    return r.rows[0]?.name || 'Szálláshely';
  }
  return 'Érdeklődő';
}

async function updateActivity(req, id, body) {
  const cur = await query('SELECT * FROM partner_activities WHERE id = $1', [id]);
  if (cur.rows.length === 0) throw new PartnerError('Aktivitás nem található', 404);
  await assertPartyInScope(req, cur.rows[0]);

  if (body.kind && !VALID_KINDS.includes(body.kind)) {
    throw new PartnerError(`kind: ${VALID_KINDS.join(' | ')}`);
  }
  const r = await query(
    `UPDATE partner_activities
        SET kind = COALESCE($1, kind),
            occurred_at = COALESCE($2, occurred_at),
            subject = $3, body = $4, contact_id = $5, updated_at = now()
      WHERE id = $6 RETURNING *`,
    [body.kind || null, body.occurred_at || null, body.subject ?? null,
     body.body ?? null, body.contact_id || null, id],
  );
  return r.rows[0];
}

async function deleteActivity(req, id) {
  const cur = await query('SELECT * FROM partner_activities WHERE id = $1', [id]);
  if (cur.rows.length === 0) throw new PartnerError('Aktivitás nem található', 404);
  await assertPartyInScope(req, cur.rows[0]);
  // The follow-up task is deliberately NOT deleted: it may already be assigned and in
  // someone's queue. The FK is ON DELETE SET NULL, so the task survives the activity.
  await query('DELETE FROM partner_activities WHERE id = $1', [id]);
  return { deleted: true };
}

/** Open follow-ups across all partners — the "who owes a callback" view. */
async function listOpenFollowUps(req, filters = {}) {
  const s = scopeOf(req);
  const params = [];
  let i = 1;
  const where = ["pa.follow_up_task_id IS NOT NULL", "t.status <> 'done'"];

  if (!s.all) {
    if (!s.contractorId) return [];
    params.push(s.contractorId);
    where.push(`(pa.contractor_id = $${i} OR a.current_contractor_id = $${i})`);
    i += 1;
  }
  if (filters.within_days) {
    params.push(parseInt(filters.within_days, 10));
    where.push(`pa.follow_up_at <= now() + ($${i++} || ' days')::interval`);
  }

  const r = await query(
    `SELECT pa.id, pa.subject, pa.kind, pa.follow_up_at, pa.follow_up_task_id,
            t.title AS task_title, t.status AS task_status, t.assigned_to,
            c.name AS contractor_name, a.name AS accommodation_name
       FROM partner_activities pa
       JOIN tasks t              ON t.id = pa.follow_up_task_id
       LEFT JOIN contractors c   ON c.id = pa.contractor_id
       LEFT JOIN accommodations a ON a.id = pa.accommodation_id
      WHERE ${where.join(' AND ')}
      ORDER BY pa.follow_up_at ASC`,
    params,
  );
  return r.rows;
}

module.exports = {
  PartnerError,
  resolveParty,
  listContacts, saveContact, deleteContact,
  listContracts, getContract, saveContract, deleteContract,
  listActivities, createActivity, updateActivity, deleteActivity, listOpenFollowUps,
  KIND_LABEL_HU,
};
