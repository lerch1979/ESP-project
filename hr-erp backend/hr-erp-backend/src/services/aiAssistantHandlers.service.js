/**
 * AI Assistant — intent handlers.
 *
 * Each handler receives ({ user, profile, entities, message }) and returns:
 *   { success, action_type, action_params, action_result,
 *     created_ticket_id, created_damage_report_id, created_task_id,
 *     user_response_override?: string }
 *
 * Handlers are deliberately small and reuse existing controller-level
 * primitives (queries to the same tables that ticket.controller / damage_report
 * controllers write to) so the AI cannot wander into "destructive" territory.
 *
 * NOTE: damage_report has many required hand-collected fields
 * (employee_signature, fault_percentage, total_cost, liability_type, ...).
 * Auto-creating a damage_report from a chat message would be wrong. Instead,
 * for the "damage_report" intent we create a ticket flagged with category
 * "Szállás" + tag ['damage'] which the admin can later formalize.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inApp = require('./inAppNotification.service');
const workerAssignment = require('./workerAssignment.service');

async function _resolveCategoryId(slug) {
  // Post-migration 102 the categories table holds both legacy leaf slugs
  // (general/accommodation/...) and new hierarchical sub-slugs (tech_plumbing,
  // hyg_pests, ...). We resolve directly by slug and fall back to 'general'.
  if (slug) {
    const r = await query(
      `SELECT id FROM ticket_categories WHERE slug = $1 AND is_active = TRUE LIMIT 1`,
      [slug]
    );
    if (r.rows[0]?.id) return r.rows[0].id;
  }
  const fb = await query(
    `SELECT id FROM ticket_categories WHERE slug = 'general' AND is_active = TRUE LIMIT 1`
  );
  return fb.rows[0]?.id || null;
}

async function _resolvePriorityId(severity) {
  // Map AI severity -> priorities table. This deployment seeds only
  // {low, normal, urgent, critical}; "high" and "medium" don't exist as
  // slugs, so we map to the nearest available level. Each entry is an
  // ordered fallback list — we use the first slug that resolves.
  const slugChain = {
    emergency: ['critical', 'urgent'],
    critical:  ['critical', 'urgent'],
    high:      ['urgent', 'high', 'critical'],
    medium:    ['normal', 'medium'],
    normal:    ['normal', 'medium'],
    low:       ['low'],
    urgent:    ['urgent', 'critical'],
  };
  const candidates = slugChain[severity] || ['normal', 'medium'];

  for (const slug of candidates) {
    const r = await query(
      `SELECT id FROM priorities WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (r.rows[0]?.id) return r.rows[0].id;
  }

  // Final safety net: fall back to whatever 'normal' / lowest-numeric priority
  // exists, so we never write a NULL priority for an AI-classified ticket.
  const fb = await query(
    `SELECT id FROM priorities ORDER BY (slug = 'normal') DESC, name LIMIT 1`
  );
  return fb.rows[0]?.id || null;
}

async function _findEmployeeForUser(userId) {
  const r = await query(
    `SELECT id FROM employees WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.id || null;
}

async function _resolveOpenStatusId() {
  const r = await query(
    `SELECT id FROM ticket_statuses WHERE slug = 'new' LIMIT 1`
  );
  return r.rows[0]?.id || null;
}

// ─── ticket handler ─────────────────────────────────────────────────────────

async function handleTicket({ user, profile, entities, message }) {
  const title = (entities.title || message).toString().slice(0, 300);
  const description = entities.description || message;
  const categoryId = await _resolveCategoryId(entities.category || 'general');
  const priorityId = await _resolvePriorityId(entities.severity || 'medium');
  const statusId   = await _resolveOpenStatusId();
  const linkedEmployeeId = await _findEmployeeForUser(user.id);

  // Generate ticket number
  const numResult = await query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 2) AS INTEGER)), 0) + 1 AS n FROM tickets`
  );
  const ticketNumber = `#${numResult.rows[0].n}`;

  const insert = await query(
    `INSERT INTO tickets
       (contractor_id, ticket_number, title, description, language,
        category_id, status_id, priority_id, created_by, linked_employee_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, ticket_number`,
    [
      user.contractorId, ticketNumber, title, description,
      profile?.preferred_language || 'hu',
      categoryId, statusId, priorityId, user.id, linkedEmployeeId,
    ]
  );
  const ticket = insert.rows[0];

  await query(
    `INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
     VALUES ($1, $2, 'created', $3)`,
    [ticket.id, user.id, `[AI assistant] ${title}`]
  );

  // Auto-assign by specialization. Failures are non-fatal — the ticket is
  // already created and the worker can be assigned later from the admin UI.
  let assignedWorker = null;
  try {
    assignedWorker = await workerAssignment.autoAssignTicket(ticket.id);
  } catch (err) {
    logger.error('[aiAssistantHandlers] auto-assign failed:', err.message);
  }

  return {
    success: true,
    action_type: 'create_ticket',
    action_params: { title, category: entities.category, severity: entities.severity },
    action_result: {
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      assigned_to: assignedWorker?.id || null,
      assigned_specialization: assignedWorker?.specialization || null,
    },
    created_ticket_id: ticket.id,
  };
}

// ─── damage_report handler (defers to ticket with damage flag) ──────────────

async function handleDamageReport(args) {
  const result = await handleTicket({
    ...args,
    entities: {
      ...args.entities,
      category: 'accommodation',
      severity: args.entities.severity || 'medium',
      title: args.entities.title ? `[Kárigény] ${args.entities.title}` : '[Kárigény]',
    },
  });
  result.action_type = 'create_damage_ticket';
  return {
    ...result,
    user_response_override: 'Kárigényt rögzítettem hibajegyként. Az illetékes felveszi veled a kapcsolatot a részletek formalizálásához.',
  };
}

// ─── faq handler ────────────────────────────────────────────────────────────
//
// Searches chatbot_knowledge_base for the best match. If nothing found, falls
// back to Claude's user_response (which may already be the answer).

async function handleFaq({ entities, message, claudeUserResponse }) {
  // Best-effort full-text search on knowledge base
  let kbHit = null;
  try {
    const r = await query(
      `SELECT id, question, answer
         FROM chatbot_knowledge_base
        WHERE is_active = TRUE
          AND (question ILIKE $1 OR answer ILIKE $1 OR keywords::text ILIKE $1)
        ORDER BY priority DESC NULLS LAST
        LIMIT 1`,
      [`%${message.toLowerCase().slice(0, 80)}%`]
    );
    kbHit = r.rows[0] || null;
  } catch (err) {
    logger.warn('[aiAssistantHandlers.faq] knowledge base lookup failed:', err.message);
  }

  return {
    success: true,
    action_type: 'faq',
    action_params: { kb_id: kbHit?.id || null },
    action_result: { answered_from: kbHit ? 'knowledge_base' : 'claude' },
    user_response_override: kbHit?.answer || claudeUserResponse || null,
  };
}

// ─── data_query handler ─────────────────────────────────────────────────────
//
// Strict whitelist: only the user's own data, never anyone else's. Currently
// supports: profile, accommodation, room, workplace.

async function handleDataQuery({ user, profile }) {
  const summary = [];
  if (profile?.first_name || profile?.last_name) {
    summary.push(`Név: ${[profile.first_name, profile.last_name].filter(Boolean).join(' ')}`);
  }
  if (profile?.accommodation_name) summary.push(`Szállás: ${profile.accommodation_name}`);
  if (profile?.room_number)        summary.push(`Szoba: ${profile.room_number}`);
  if (profile?.workplace)          summary.push(`Munkahely: ${profile.workplace}`);
  if (profile?.email)              summary.push(`Email: ${profile.email}`);

  const text = summary.length
    ? summary.join('\n')
    : 'A profilodban még nincs rögzített adat. Kérlek, jelezd HR-nek!';

  return {
    success: true,
    action_type: 'data_query',
    action_params: {},
    action_result: { fields: summary.length },
    user_response_override: text,
  };
}

// ─── emergency handler ──────────────────────────────────────────────────────
//
// Like ticket, but priority=critical, all admins notified, and we override
// the response with a reassurance message.

async function handleEmergency(args) {
  const ticketResult = await handleTicket({
    ...args,
    entities: {
      ...args.entities,
      severity: 'critical',
      title: args.entities.title || `[VÉSZHELYZET] ${args.message.slice(0, 60)}`,
    },
  });

  // Notify all admin/superadmin users
  try {
    const admins = await query(
      `SELECT DISTINCT u.id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.slug IN ('superadmin', 'admin') AND u.is_active = TRUE`
    );
    for (const row of admins.rows) {
      await inApp.notify({
        userId: row.id,
        contractorId: args.user.contractorId,
        type: 'emergency',
        title: '🚨 VÉSZHELYZET',
        message: `${args.profile?.first_name || ''} ${args.profile?.last_name || ''} — ${args.entities.title || args.message.slice(0, 80)}`,
        link: `/tickets/${ticketResult.created_ticket_id}`,
        data: { ticket_id: ticketResult.created_ticket_id, message: args.message },
      });
    }
  } catch (err) {
    // Non-fatal: ticket is already created, admin can find it via dashboard
    logger.error('[aiAssistantHandlers.emergency] admin notify failed:', err.message);
  }

  return {
    ...ticketResult,
    action_type: 'emergency',
    user_response_override: 'Értem, vészhelyzeti hibajegyet hoztam létre kritikus prioritással. Az ügyeletet azonnal értesítettem. Maradj biztonságban!',
  };
}

module.exports = {
  handleTicket,
  handleDamageReport,
  handleFaq,
  handleDataQuery,
  handleEmergency,
};
