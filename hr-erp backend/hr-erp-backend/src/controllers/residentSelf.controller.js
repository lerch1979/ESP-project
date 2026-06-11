/**
 * Resident self-service controllers — STRICTLY self-scoped.
 *
 * These power the auth-only /tickets/my, /tickets/my/:id and
 * /accommodations/my endpoints used by the resident (accommodated_employee)
 * mobile app. They are mounted BEFORE the staff /tickets and /accommodations
 * routers so staff route code stays untouched.
 *
 * Every query is filtered to the requesting user:
 *   - tickets: created_by = req.user.id   (their OWN tickets only)
 *   - room:    employees.user_id = req.user.id  (their OWN accommodation only)
 *
 * No permission gate (auth-only), mirroring the notification-center pattern.
 * Row-level scoping here is the ONLY thing standing between a resident and
 * other tenants' data — do not loosen these WHERE clauses.
 */

const { query } = require('../database/connection');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /tickets/my — only tickets the resident created.
const getMyTickets = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         t.id, t.ticket_number, t.title, t.description, t.language,
         t.created_at, t.updated_at, t.due_date, t.resolved_at, t.closed_at,
         ts.name as status_name, ts.slug as status_slug, ts.color as status_color, ts.is_final,
         tc.name as category_name, tc.slug as category_slug, tc.color as category_color, tc.icon as category_icon,
         p.name as priority_name, p.slug as priority_slug, p.level as priority_level, p.color as priority_color
       FROM tickets t
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       LEFT JOIN ticket_categories tc ON t.category_id = tc.id
       LEFT JOIN priorities p ON t.priority_id = p.id
       WHERE t.created_by = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { tickets: result.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a hibajegyek lekérésekor' });
  }
};

// GET /tickets/my/:id — that ticket ONLY if the resident created it; else 404
// (404 not 403 — do not reveal the existence of other tenants' tickets).
const getMyTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    const result = await query(
      `SELECT
         t.*, ts.name as status_name, ts.slug as status_slug, ts.color as status_color,
         tc.name as category_name, tc.slug as category_slug, tc.color as category_color,
         p.name as priority_name, p.slug as priority_slug, p.level as priority_level, p.color as priority_color
       FROM tickets t
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       LEFT JOIN ticket_categories tc ON t.category_id = tc.id
       LEFT JOIN priorities p ON t.priority_id = p.id
       WHERE t.id = $1 AND t.created_by = $2`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    // Actual attachment rows on disk (honest count — partial uploads show real state).
    const att = await query(
      `SELECT id, file_name, mime_type, file_size, created_at
         FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json({ success: true, data: { ticket: { ...result.rows[0], attachments: att.rows } } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a hibajegy lekérésekor' });
  }
};

// GET /accommodations/my — the resident's OWN accommodation (room) only.
const getMyAccommodation = async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, e.room_number as my_room_number,
              e.first_name as my_first_name, e.last_name as my_last_name
       FROM employees e
       JOIN accommodations a ON a.id = e.accommodation_id
       WHERE e.user_id = $1 AND e.end_date IS NULL
       LIMIT 1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nincs hozzád rendelt szállás' });
    }
    res.json({ success: true, data: { accommodation: result.rows[0] } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a szállás lekérésekor' });
  }
};

// Guard for the resident ticket-chat routes: the :ticketId path param MUST be
// a ticket the resident created. 404 (not 403) so other tenants' ticket
// existence isn't revealed. This is the ONLY ownership scope — the reused
// ticketMessages.list/send do NOT self-scope (their _detectSenderRole returns
// a role for any existing ticket), so this guard must run before them.
const requireOwnTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    if (!UUID_RE.test(ticketId)) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    const r = await query('SELECT created_by FROM tickets WHERE id = $1', [ticketId]);
    if (r.rowCount === 0 || r.rows[0].created_by !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a hibajegy ellenőrzésekor' });
  }
};

// Resident's OWN contractor categories (the curated set for their housing
// provider), NOT the global staff taxonomy. Keeps the report picker short and
// fully translated — a resident never sees other contractors'/staff categories.
const getMyCategories = async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, slug, color, icon
         FROM ticket_categories
        WHERE contractor_id = $1 AND is_active = TRUE
        ORDER BY name`,
      [req.user.contractorId],
    );
    res.json({ success: true, data: { categories: r.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a kategóriák lekérésekor' });
  }
};

module.exports = { getMyTickets, getMyTicketById, getMyAccommodation, requireOwnTicket, getMyCategories };
