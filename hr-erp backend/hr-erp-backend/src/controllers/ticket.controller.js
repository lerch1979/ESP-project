const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { parseFiltersParam, buildFilterWhere } = require('../utils/filterBuilder');
const autoAssignService = require('../services/autoAssign.service');
const slaService = require('../services/sla.service');
const translation = require('../services/translation.service');
const { isValidUUID, sanitizeString, parsePagination, sanitizeSearch } = require('../utils/validation');

async function translateForViewer(req, rowOrRows, fields = ['title', 'description']) {
  try {
    const viewerLang = await translation.getUserLanguage(req.user.id);
    if (Array.isArray(rowOrRows)) {
      return await translation.translateArray(rowOrRows, 'language', viewerLang, fields);
    }
    return await translation.translateObject(rowOrRows, 'language', viewerLang, fields);
  } catch (err) {
    logger.warn('[ticket] translation failed, returning untranslated:', err.message);
    return rowOrRows;
  }
}

const TICKET_FILTER_FIELD_MAP = {
  status: 'ts.slug',
  category: 'tc.slug',
  priority: 'p.slug',
  contractor: 't.contractor_id',
};

/**
 * Ticketek listázása (szűrőkkel)
 */
const getTickets = async (req, res) => {
  try {
    const { status, category, priority, assigned_to } = req.query;
    const { page, limit, offset } = parsePagination(req.query, { page: 1, limit: 20, maxLimit: 200 });
    const search = sanitizeSearch(req.query.search);

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Contractor szűrés (szuperadmin kivételével mindenki csak a sajátját látja)
    if (!req.user.roles.includes('superadmin')) {
      whereConditions.push(`t.contractor_id = $${paramIndex}`);
      params.push(req.user.contractorId);
      paramIndex++;
    }

    // Külső alvállalkozó csak a rá kijelölt ticketeket látja
    if (req.user.roles.includes('contractor')) {
      whereConditions.push(`t.assigned_to = $${paramIndex}`);
      params.push(req.user.id);
      paramIndex++;
    }

    // Státusz szűrő
    if (status) {
      whereConditions.push(`ts.slug = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    // Kategória szűrő
    if (category) {
      whereConditions.push(`tc.slug = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    // Prioritás szűrő
    if (priority) {
      whereConditions.push(`p.slug = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    // Felelős szűrő
    if (assigned_to) {
      whereConditions.push(`t.assigned_to = $${paramIndex}`);
      params.push(assigned_to);
      paramIndex++;
    }

    // Keresés
    if (search) {
      whereConditions.push(`(t.title ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Dynamic multi-filter support
    const filters = parseFiltersParam(req.query.filters);
    let dateFilter = '';
    const dateParams = [];
    if (filters.length > 0) {
      const fr = buildFilterWhere(filters, TICKET_FILTER_FIELD_MAP, { startParamIndex: paramIndex });
      if (fr.sql) {
        whereConditions.push(fr.sql.replace(/^ AND /, ''));
        params.push(...fr.params);
        paramIndex = fr.nextParamIndex;
      }
      if (fr.dateRangeInfo) {
        dateFilter = ` AND t.created_at >= $${paramIndex} AND t.created_at <= $${paramIndex + 1}::date + INTERVAL '1 day'`;
        dateParams.push(fr.dateRangeInfo.from, fr.dateRangeInfo.to);
        paramIndex += 2;
      }
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}${dateFilter}`
      : dateFilter ? `WHERE 1=1${dateFilter}` : '';

    const allParams = [...params, ...dateParams];

    // Összes ticket száma (with JOINs for filter columns)
    const countResult = await query(
      `SELECT COUNT(*) as total FROM tickets t
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       LEFT JOIN ticket_categories tc ON t.category_id = tc.id
       LEFT JOIN priorities p ON t.priority_id = p.id
       ${whereClause}`,
      allParams
    );

    // Ticketek lekérése
    const ticketsQuery = `
      SELECT 
        t.id,
        t.ticket_number,
        t.title,
        t.description,
        t.language,
        t.created_at,
        t.updated_at,
        t.due_date,
        t.resolved_at,
        t.closed_at,
        ts.name as status_name,
        ts.slug as status_slug,
        ts.color as status_color,
        tc.name as category_name,
        tc.slug as category_slug,
        tc.color as category_color,
        p.name as priority_name,
        p.slug as priority_slug,
        p.level as priority_level,
        p.color as priority_color,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        creator.email as created_by_email,
        assignee.first_name || ' ' || assignee.last_name as assigned_to_name,
        assignee.email as assigned_to_email,
        t.sla_response_deadline,
        t.sla_resolution_deadline,
        t.first_response_at,
        t.sla_policy_id
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN priorities p ON t.priority_id = p.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    allParams.push(limit, offset);
    const ticketsResult = await query(ticketsQuery, allParams);
    const translatedTickets = await translateForViewer(req, ticketsResult.rows);

    res.json({
      success: true,
      data: {
        tickets: translatedTickets,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(countResult.rows[0].total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Ticketek lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Ticketek lekérési hiba'
    });
  }
};

/**
 * Egy ticket részletei
 */
const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }

    const ticketQuery = `
      SELECT 
        t.*,
        ts.name as status_name,
        ts.slug as status_slug,
        ts.color as status_color,
        tc.name as category_name,
        tc.slug as category_slug,
        tc.color as category_color,
        p.name as priority_name,
        p.slug as priority_slug,
        p.level as priority_level,
        creator.first_name || ' ' || creator.last_name as created_by_name,
        assignee.first_name || ' ' || assignee.last_name as assigned_to_name,
        tn.name as contractor_name,
        sp.name as sla_policy_name
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN priorities p ON t.priority_id = p.id
      LEFT JOIN users creator ON t.created_by = creator.id
      LEFT JOIN users assignee ON t.assigned_to = assignee.id
      LEFT JOIN contractors tn ON t.contractor_id = tn.id
      LEFT JOIN sla_policies sp ON t.sla_policy_id = sp.id
      WHERE t.id = $1
    `;

    const ticketResult = await query(ticketQuery, [id]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket nem található'
      });
    }

    const ticket = ticketResult.rows[0];

    // Contractor hozzáférés ellenőrzés
    if (!req.user.roles.includes('superadmin') && ticket.contractor_id !== req.user.contractorId) {
      return res.status(403).json({
        success: false,
        message: 'Nincs jogosultságod ehhez a tickethez'
      });
    }

    // Külső alvállalkozó csak a rá kijelölt ticketet láthatja
    if (req.user.roles.includes('contractor') && ticket.assigned_to !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Nincs jogosultságod ehhez a tickethez'
      });
    }

    // Megjegyzések lekérése
    const commentsQuery = `
      SELECT 
        tc.*,
        u.first_name || ' ' || u.last_name as author_name,
        u.email as author_email
      FROM ticket_comments tc
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.ticket_id = $1
      ORDER BY tc.created_at ASC
    `;

    const commentsResult = await query(commentsQuery, [id]);

    // Csatolmányok lekérése
    const attachmentsQuery = `
      SELECT 
        ta.*,
        u.first_name || ' ' || u.last_name as uploaded_by_name
      FROM ticket_attachments ta
      LEFT JOIN users u ON ta.uploaded_by = u.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at DESC
    `;

    const attachmentsResult = await query(attachmentsQuery, [id]);

    // Történet lekérése
    const historyQuery = `
      SELECT 
        th.*,
        u.first_name || ' ' || u.last_name as user_name
      FROM ticket_history th
      LEFT JOIN users u ON th.user_id = u.id
      WHERE th.ticket_id = $1
      ORDER BY th.created_at ASC
      LIMIT 50
    `;

    const historyResult = await query(historyQuery, [id]);

    const translatedTicket = await translateForViewer(req, ticket);
    const viewerLang = translatedTicket._targetLang || (await translation.getUserLanguage(req.user.id));
    const translatedComments = await translation.translateArray(
      commentsResult.rows.map((c) => ({ ...c, language: c.language || ticket.language || 'hu' })),
      'language',
      viewerLang,
      ['comment']
    );

    res.json({
      success: true,
      data: {
        ticket: {
          ...translatedTicket,
          comments: translatedComments,
          attachments: attachmentsResult.rows,
          history: historyResult.rows
        }
      }
    });

  } catch (error) {
    logger.error('Ticket lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Ticket lekérési hiba'
    });
  }
};

/**
 * Új ticket létrehozása
 */
const createTicket = async (req, res) => {
  try {
    const { title, description, category_id, priority_id, assigned_to } = req.body;

    // Validáció
    if (!title || (typeof title === 'string' && !title.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Cím megadása kötelező'
      });
    }

    let ticketData = await transaction(async (client) => {
      // Ticket szám generálás (egyszerű: következő ID)
      const ticketNumberResult = await client.query(
        'SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 2) AS INTEGER)), 0) + 1 as next_number FROM tickets'
      );
      const ticketNumber = `#${ticketNumberResult.rows[0].next_number}`;

      // Alapértelmezett státusz lekérése (új)
      const statusResult = await client.query(
        "SELECT id FROM ticket_statuses WHERE slug = 'new' LIMIT 1"
      );

      // Capture creator's preferred language so admins can be shown a translation later
      const creatorLangResult = await client.query(
        'SELECT preferred_language FROM users WHERE id = $1',
        [req.user.id]
      );
      const creatorLang = creatorLangResult.rows[0]?.preferred_language || 'hu';

      // Ticket létrehozása
      const insertQuery = `
        INSERT INTO tickets (
          contractor_id, ticket_number, title, description, language,
          category_id, status_id, priority_id, created_by, assigned_to
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        req.user.contractorId,
        ticketNumber,
        title,
        description || null,
        creatorLang,
        category_id || null,
        statusResult.rows[0].id,
        priority_id || null,
        req.user.id,
        assigned_to || null
      ]);

      const ticketId = result.rows[0].id;

      // Történet bejegyzés
      await client.query(
        `INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
         VALUES ($1, $2, 'created', $3)`,
        [ticketId, req.user.id, title]
      );

      // Look up priority slug inside the transaction
      const priorityResult = priority_id
        ? await client.query('SELECT slug FROM priorities WHERE id = $1', [priority_id])
        : null;

      logger.info('Új ticket létrehozva', {
        ticketId,
        ticketNumber,
        userId: req.user.id,
        contractorId: req.user.contractorId
      });

      return {
        ticket: result.rows[0],
        prioritySlug: priorityResult?.rows[0]?.slug || 'normal',
      };
    });

    // Post-transaction: auto-assign and SLA (these use pool queries, must run after COMMIT)
    const { ticket: createdTicket, prioritySlug } = ticketData;

    if (!assigned_to) {
      const autoAssigned = await autoAssignService.assignTicket(createdTicket.id);
      if (autoAssigned) {
        ticketData = { ...ticketData, ticket: autoAssigned };
      }
    }

    // Apply SLA deadlines
    const slaData = await slaService.applyToTicket(createdTicket.id, {
      contractorId: req.user.contractorId,
      categoryId: category_id || null,
      prioritySlug,
      createdAt: createdTicket.created_at,
    });

    let responseTicket = ticketData.ticket;
    if (slaData) {
      responseTicket = { ...responseTicket, ...slaData };
    }

    res.status(201).json({
      success: true,
      message: 'Ticket sikeresen létrehozva',
      data: { ticket: responseTicket }
    });

  } catch (error) {
    logger.error('Ticket létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Ticket létrehozási hiba'
    });
  }
};

/**
 * Ticket státusz frissítése
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }
    const { status_id, comment } = req.body;

    if (!status_id) {
      return res.status(400).json({
        success: false,
        message: 'Státusz ID kötelező'
      });
    }

    await transaction(async (client) => {
      // Jelenlegi ticket lekérése
      const currentResult = await client.query(
        'SELECT status_id, contractor_id, assigned_to, first_response_at FROM tickets WHERE id = $1',
        [id]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Ticket nem található');
      }

      const currentTicket = currentResult.rows[0];

      // Jogosultság ellenőrzés
      if (!req.user.roles.includes('superadmin') && 
          !req.user.roles.includes('admin') &&
          currentTicket.assigned_to !== req.user.id) {
        throw new Error('Nincs jogosultságod a státusz módosításához');
      }

      const oldStatusResult = await client.query(
        'SELECT name, slug FROM ticket_statuses WHERE id = $1',
        [currentTicket.status_id]
      );

      const newStatusResult = await client.query(
        'SELECT name, is_final FROM ticket_statuses WHERE id = $1',
        [status_id]
      );

      // Státusz frissítése
      const updateFields = ['status_id = $1'];
      const updateParams = [status_id, id];

      // First response tracking: when status changes FROM 'new'
      if (oldStatusResult.rows[0].slug === 'new' && !currentTicket.first_response_at) {
        updateFields.push('first_response_at = CURRENT_TIMESTAMP');
      }

      // Ha végső státusz (lezárva), akkor záró időpontot is beállítjuk
      if (newStatusResult.rows[0].is_final) {
        updateFields.push('closed_at = CURRENT_TIMESTAMP');
        updateFields.push('resolved_at = CURRENT_TIMESTAMP');
      }

      await client.query(
        `UPDATE tickets SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${updateParams.length}`,
        updateParams
      );

      // Történet bejegyzés
      await client.query(
        `INSERT INTO ticket_history (ticket_id, user_id, action, field_name, old_value, new_value)
         VALUES ($1, $2, 'status_changed', 'status', $3, $4)`,
        [id, req.user.id, oldStatusResult.rows[0].name, newStatusResult.rows[0].name]
      );

      // Ha van megjegyzés, azt is hozzáadjuk
      if (comment) {
        await client.query(
          `INSERT INTO ticket_comments (ticket_id, user_id, comment)
           VALUES ($1, $2, $3)`,
          [id, req.user.id, comment]
        );
      }

      logger.info('Ticket státusz frissítve', {
        ticketId: id,
        oldStatus: oldStatusResult.rows[0].name,
        newStatus: newStatusResult.rows[0].name,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Státusz sikeresen frissítve'
      });
    });

  } catch (error) {
    logger.error('Státusz frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Státusz frissítési hiba'
    });
  }
};

/**
 * Megjegyzés hozzáadása tickethez
 */
const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen azonosító formátum' });
    }
    const { comment, is_internal = false } = req.body;

    if (!comment) {
      return res.status(400).json({
        success: false,
        message: 'Megjegyzés szövege kötelező'
      });
    }

    // Ticket ellenőrzés és jogosultság
    const ticketCheck = await query(
      `SELECT t.contractor_id, t.assigned_to, t.first_response_at, ts.slug as status_slug
       FROM tickets t
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       WHERE t.id = $1`,
      [id]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket nem található'
      });
    }

    const ticket = ticketCheck.rows[0];

    // Jogosultság ellenőrzés
    if (!req.user.roles.includes('superadmin') && ticket.contractor_id !== req.user.contractorId) {
      return res.status(403).json({
        success: false,
        message: 'Nincs jogosultságod ehhez a tickethez'
      });
    }

    // Megjegyzés hozzáadása
    const result = await query(
      `INSERT INTO ticket_comments (ticket_id, user_id, comment, is_internal)
       VALUES ($1, $2, $3, $4)
       RETURNING *, 
         (SELECT first_name || ' ' || last_name FROM users WHERE id = $2) as author_name`,
      [id, req.user.id, comment, is_internal]
    );

    // First response tracking: first comment on a 'new' ticket counts as response
    if (ticket.status_slug === 'new' && !ticket.first_response_at) {
      await query(
        'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP, first_response_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
    } else {
      await query(
        'UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
    }

    logger.info('Megjegyzés hozzáadva', {
      ticketId: id,
      userId: req.user.id,
      isInternal: is_internal
    });

    res.status(201).json({
      success: true,
      message: 'Megjegyzés sikeresen hozzáadva',
      data: { comment: result.rows[0] }
    });

  } catch (error) {
    logger.error('Megjegyzés hozzáadási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Megjegyzés hozzáadási hiba'
    });
  }
};

module.exports = {
  getTickets,
  getTicketById,
  createTicket,
  updateTicketStatus,
  addComment
};
