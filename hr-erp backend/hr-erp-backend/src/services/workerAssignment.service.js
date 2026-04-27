/**
 * Worker auto-assignment based on category specialization.
 *
 * Pipeline:
 *   1. Look up the ticket's category → ticket_categories.default_specialization
 *      (set by migration 102 on every leaf sub-category).
 *   2. Find active workers in `worker_specializations` matching that
 *      specialization, scoped to the ticket's contractor.
 *   3. Pick the worker with the lowest current workload (open + in_progress
 *      tickets). Ties broken randomly so a long queue doesn't always go to
 *      the alphabetically-first user.
 *   4. UPDATE tickets.assigned_to + write a ticket_history row + send an
 *      in-app notification.
 *
 * Returns the assigned user row (or null if no match anywhere — caller may
 * then fall back to the legacy assignmentRules path).
 *
 * NOTE: This runs ALONGSIDE the existing autoAssign.service.js. The ticket
 * controller calls this first — if it returns null, the rule-based service
 * is the fallback. This keeps the new spec-based flow opt-in by data
 * (a contractor that hasn't seeded worker_specializations gets the old
 * behavior unchanged).
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inApp = require('./inAppNotification.service');

// Canonical specialization list. Mirrors the comment in migration 102 plus
// the AI prompt's worker types. Used by the REST API + admin UI.
const SPECIALIZATIONS = [
  { slug: 'electrical',   icon: '⚡', name: 'Villanyszerelő' },
  { slug: 'plumbing',     icon: '💧', name: 'Vízszerelő' },
  { slug: 'heating',      icon: '🌡️', name: 'Fűtésszerelő' },
  { slug: 'gas',          icon: '🔥', name: 'Gázszerelő',           requiresCertification: true },
  { slug: 'general',      icon: '🔧', name: 'Általános karbantartó' },
  { slug: 'cleaning',     icon: '🧹', name: 'Takarító' },
  { slug: 'furniture',    icon: '🪑', name: 'Bútor / Asztalos' },
  { slug: 'pest_control', icon: '🐀', name: 'Rovarírtó' },
];

const SPEC_SLUGS = new Set(SPECIALIZATIONS.map(s => s.slug));

/**
 * Find the active worker with the lowest open/in_progress workload for a
 * given specialization. Returns null if nobody matches.
 */
async function findBestWorker(specialization, contractorId = null) {
  if (!specialization || !SPEC_SLUGS.has(specialization)) return null;

  // Open + in_progress count per candidate. CTE keeps this readable; the
  // outer ORDER BY breaks ties randomly.
  const r = await query(`
    WITH candidates AS (
      SELECT u.id, u.first_name, u.last_name, u.email, u.contractor_id,
             ws.specialization, ws.certification_expiry
      FROM users u
      JOIN worker_specializations ws ON ws.user_id = u.id
      WHERE ws.specialization = $1
        AND ws.is_active = TRUE
        AND u.is_active = TRUE
        AND ($2::uuid IS NULL OR u.contractor_id = $2)
    ),
    workload AS (
      SELECT c.id,
             COUNT(t.id) FILTER (
               WHERE ts.slug IN ('new', 'in_progress', 'waiting', 'waiting_material')
             )::int AS open_count
      FROM candidates c
      LEFT JOIN tickets t ON t.assigned_to = c.id
      LEFT JOIN ticket_statuses ts ON ts.id = t.status_id
      GROUP BY c.id
    )
    SELECT c.*, w.open_count
    FROM candidates c
    JOIN workload w ON w.id = c.id
    ORDER BY w.open_count ASC, RANDOM()
    LIMIT 1
  `, [specialization, contractorId]);

  return r.rows[0] || null;
}

/**
 * Resolve a specialization name → display-friendly Hungarian for log lines.
 */
function _humanSpec(slug) {
  return SPECIALIZATIONS.find(s => s.slug === slug)?.name || slug;
}

/**
 * Auto-assign a ticket. Idempotent: skips if `assigned_to` is already set.
 * Returns the assigned user row, or null if nobody could be matched.
 */
async function autoAssignTicket(ticketId) {
  if (!ticketId) return null;
  try {
    const tRes = await query(`
      SELECT t.id, t.title, t.assigned_to, t.contractor_id, t.created_by,
             c.slug AS category_slug, c.default_specialization
      FROM tickets t
      LEFT JOIN ticket_categories c ON c.id = t.category_id
      WHERE t.id = $1
    `, [ticketId]);
    const ticket = tRes.rows[0];
    if (!ticket) {
      logger.warn(`[workerAssignment] ticket ${ticketId} not found`);
      return null;
    }
    if (ticket.assigned_to) return null;        // Already assigned (manual or prior auto)

    const spec = ticket.default_specialization;
    if (!spec) {
      // Category has no default specialization (legacy categories like
      // accommodation/administration were intentionally left as 'general' or
      // null). Try general as a last resort.
      logger.info(`[workerAssignment] ticket ${ticketId}: no default_specialization on category ${ticket.category_slug}, trying 'general'`);
    }

    // Try the requested specialization, then 'general' as fallback (only
    // once — avoid infinite recursion if neither has workers).
    let worker = spec ? await findBestWorker(spec, ticket.contractor_id) : null;
    let usedSpec = spec;
    if (!worker && spec !== 'general') {
      worker = await findBestWorker('general', ticket.contractor_id);
      usedSpec = 'general';
    }

    if (!worker) {
      logger.warn(`[workerAssignment] no worker for ticket ${ticketId} (spec=${spec}, contractor=${ticket.contractor_id})`);
      return null;
    }

    // Assign — same column conventions as autoAssign.service.js (no
    // assigned_at column on tickets; we just touch updated_at).
    await query(
      `UPDATE tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
      [worker.id, ticketId]
    );

    const workerName = [worker.first_name, worker.last_name].filter(Boolean).join(' ') || worker.email;

    await query(
      `INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
       VALUES ($1, $2, 'auto_assigned', $3)`,
      [ticketId, worker.id, `Automatikus hozzárendelés szakértelem alapján: ${workerName} (${_humanSpec(usedSpec)})`]
    ).catch(err => logger.error('[workerAssignment] history insert failed:', err.message));

    // In-app notification to the assigned worker. Email is intentionally
    // out of scope here — there is no general-purpose email helper yet
    // (email.service.js only ships sendInvoiceEmail). Add when the email
    // service grows a generic sender.
    await inApp.notify({
      userId: worker.id,
      contractorId: ticket.contractor_id,
      type: 'ticket_assigned',
      title: 'Új hibajegy',
      message: `Új hibajegyet kaptál: ${ticket.title}`,
      link: `/tickets/${ticketId}`,
      data: { ticket_id: ticketId, specialization: usedSpec, auto: true },
    }).catch(err => logger.error('[workerAssignment] notify failed:', err.message));

    logger.info(`[workerAssignment] ticket ${ticketId} → ${workerName} (${usedSpec}, workload=${worker.open_count})`);

    return worker;
  } catch (err) {
    // Never let assignment failure block the caller — they already created
    // the ticket and have to respond to the user.
    logger.error('[workerAssignment] autoAssignTicket failed:', err.message);
    return null;
  }
}

module.exports = {
  findBestWorker,
  autoAssignTicket,
  SPECIALIZATIONS,
  SPEC_SLUGS,
};
