const { query } = require('../database/connection');
const { sendBulkEmails, interpolateTemplate } = require('../utils/emailService');

/**
 * GET /templates - List all notification templates
 */
const getTemplates = async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, slug, subject, body_html, event_type, language, is_active FROM notification_templates ORDER BY name'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('getTemplates error:', error);
    res.status(500).json({ success: false, message: 'Hiba a sablonok lekérésekor' });
  }
};

/**
 * GET /filter-options - Get unique values for dynamic filter dropdowns
 */
const getFilterOptions = async (req, res) => {
  try {
    const [
      statusResult,
      workplaceResult,
      accommodationResult,
      positionResult,
      countryResult,
    ] = await Promise.all([
      query(`SELECT id, name FROM employee_status_types ORDER BY name`),
      query(`SELECT DISTINCT workplace FROM employees WHERE workplace IS NOT NULL AND workplace != '' ORDER BY workplace`),
      query(`SELECT id, name FROM accommodations ORDER BY name`),
      query(`SELECT DISTINCT position FROM employees WHERE position IS NOT NULL AND position != '' ORDER BY position`),
      query(`SELECT DISTINCT permanent_address_country FROM employees WHERE permanent_address_country IS NOT NULL AND permanent_address_country != '' ORDER BY permanent_address_country`),
    ]);

    res.json({
      success: true,
      data: {
        statuses: statusResult.rows,
        workplaces: workplaceResult.rows.map((r) => r.workplace),
        accommodations: accommodationResult.rows,
        positions: positionResult.rows.map((r) => r.position),
        countries: countryResult.rows.map((r) => r.permanent_address_country),
      },
    });
  } catch (error) {
    console.error('getFilterOptions error:', error);
    res.status(500).json({ success: false, message: 'Hiba a szűrő opciók lekérésekor' });
  }
};

// Allowed filter fields mapped to their SQL expressions
const FILTER_MAP = {
  status: {
    column: 'est.name',
    operator: '=',
  },
  workplace: {
    column: 'e.workplace',
    operator: '=',
  },
  accommodation: {
    column: 'a.id',
    operator: '=',
  },
  gender: {
    column: 'e.gender',
    operator: '=',
  },
  marital_status: {
    column: 'e.marital_status',
    operator: '=',
  },
  position: {
    column: 'e.position',
    operator: '=',
  },
  country: {
    column: 'e.permanent_address_country',
    operator: '=',
  },
  // Special filters handled with custom logic
  visa_expiry: null,
  contract_end: null,
  birth_year: null,
};

/**
 * Build WHERE clause fragment for a single filter
 * Returns { sql: string, params: any[] } or null
 */
function buildFilterClause(filter, paramIndex) {
  const { field, value } = filter;
  if (!field || value === undefined || value === null || value === '') return null;

  // Special: visa_expiry presets
  if (field === 'visa_expiry') {
    const now = new Date();
    if (value === 'expired') {
      return { sql: `e.visa_expiry < $${paramIndex}`, params: [now.toISOString().slice(0, 10)] };
    }
    if (value === '30days') {
      const d = new Date(now);
      d.setDate(d.getDate() + 30);
      return { sql: `e.visa_expiry <= $${paramIndex} AND e.visa_expiry >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === '60days') {
      const d = new Date(now);
      d.setDate(d.getDate() + 60);
      return { sql: `e.visa_expiry <= $${paramIndex} AND e.visa_expiry >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === 'valid') {
      return { sql: `e.visa_expiry > $${paramIndex}`, params: [now.toISOString().slice(0, 10)] };
    }
    return null;
  }

  // Special: contract_end presets
  if (field === 'contract_end') {
    const now = new Date();
    if (value === 'expired') {
      return { sql: `e.end_date < $${paramIndex}`, params: [now.toISOString().slice(0, 10)] };
    }
    if (value === '30days') {
      const d = new Date(now);
      d.setDate(d.getDate() + 30);
      return { sql: `e.end_date <= $${paramIndex} AND e.end_date >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === '60days') {
      const d = new Date(now);
      d.setDate(d.getDate() + 60);
      return { sql: `e.end_date <= $${paramIndex} AND e.end_date >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === '90days') {
      const d = new Date(now);
      d.setDate(d.getDate() + 90);
      return { sql: `e.end_date <= $${paramIndex} AND e.end_date >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    return null;
  }

  // Special: birth_year range
  if (field === 'birth_year') {
    if (value === 'under_25') {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 25);
      return { sql: `e.birth_date > $${paramIndex}`, params: [cutoff.toISOString().slice(0, 10)] };
    }
    if (value === '25_35') {
      const from = new Date(); from.setFullYear(from.getFullYear() - 35);
      const to = new Date(); to.setFullYear(to.getFullYear() - 25);
      return { sql: `e.birth_date >= $${paramIndex} AND e.birth_date <= $${paramIndex + 1}`, params: [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)] };
    }
    if (value === '35_50') {
      const from = new Date(); from.setFullYear(from.getFullYear() - 50);
      const to = new Date(); to.setFullYear(to.getFullYear() - 35);
      return { sql: `e.birth_date >= $${paramIndex} AND e.birth_date <= $${paramIndex + 1}`, params: [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)] };
    }
    if (value === 'over_50') {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 50);
      return { sql: `e.birth_date < $${paramIndex}`, params: [cutoff.toISOString().slice(0, 10)] };
    }
    return null;
  }

  // Standard equality filters
  const mapping = FILTER_MAP[field];
  if (!mapping) return null;

  return { sql: `${mapping.column} = $${paramIndex}`, params: [value] };
}

/**
 * POST /filter-recipients - Filter employees with dynamic filter array
 */
const filterRecipients = async (req, res) => {
  try {
    const { filters } = req.body;

    let sql = `
      SELECT
        e.id,
        COALESCE(NULLIF(CONCAT(e.last_name, ' ', e.first_name), ' '), CONCAT(u.last_name, ' ', u.first_name)) AS name,
        COALESCE(e.company_email, u.email) AS email,
        e.workplace,
        a.name AS accommodation,
        e.visa_expiry,
        e.end_date AS contract_end
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      LEFT JOIN employee_status_types est ON e.status_id = est.id
      WHERE COALESCE(e.company_email, u.email) IS NOT NULL
    `;
    const params = [];
    let paramIndex = 1;

    // Build dynamic WHERE from filters array
    if (Array.isArray(filters)) {
      for (const filter of filters) {
        const clause = buildFilterClause(filter, paramIndex);
        if (clause) {
          sql += ` AND (${clause.sql})`;
          params.push(...clause.params);
          paramIndex += clause.params.length;
        }
      }
    }

    sql += ' ORDER BY e.last_name, e.first_name';

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('filterRecipients error:', error);
    res.status(500).json({ success: false, message: 'Hiba a címzettek szűrésekor' });
  }
};

/**
 * POST /send-bulk - Send bulk emails to selected recipients
 */
const sendBulk = async (req, res) => {
  try {
    const { recipient_ids, template_slug, subject, body, variables } = req.body;

    if (!recipient_ids || recipient_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Nincs kiválasztott címzett' });
    }

    // Fetch recipients
    const recipientResult = await query(
      `SELECT
        e.id, e.user_id,
        COALESCE(NULLIF(CONCAT(e.last_name, ' ', e.first_name), ' '), CONCAT(u.last_name, ' ', u.first_name)) AS name,
        COALESCE(e.company_email, u.email) AS email,
        e.workplace,
        a.name AS accommodation,
        e.visa_expiry,
        e.end_date AS contract_end
      FROM employees e
      LEFT JOIN users u ON e.user_id = u.id
      LEFT JOIN accommodations a ON e.accommodation_id = a.id
      WHERE e.id = ANY($1)`,
      [recipient_ids]
    );

    const recipients = recipientResult.rows.filter((r) => r.email);

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'Egyik címzettnek sincs email címe' });
    }

    // Resolve template or use direct subject/body
    let emailSubject = subject;
    let emailBody = body;

    if (template_slug) {
      const templateResult = await query(
        'SELECT subject, body_html FROM notification_templates WHERE slug = $1 AND is_active = true LIMIT 1',
        [template_slug]
      );
      if (templateResult.rows.length > 0) {
        const template = templateResult.rows[0];
        emailSubject = template.subject;
        emailBody = template.body_html;
      }
    }

    if (!emailSubject || !emailBody) {
      return res.status(400).json({ success: false, message: 'Tárgy és üzenet szükséges' });
    }

    // If template is 'general', interpolate the subject/body from user input first
    if (template_slug === 'general') {
      emailSubject = interpolateTemplate(emailSubject, { subject, body, ...variables });
      emailBody = interpolateTemplate(emailBody, { subject, body, ...variables });
    }

    // Send bulk emails
    const results = await sendBulkEmails(
      recipients,
      emailSubject,
      emailBody,
      (recipient) => ({
        name: recipient.name || '',
        workplace: recipient.workplace || '',
        accommodation: recipient.accommodation || '',
        visa_expiry: recipient.visa_expiry
          ? new Date(recipient.visa_expiry).toLocaleDateString('hu-HU')
          : '',
        contract_end: recipient.contract_end
          ? new Date(recipient.contract_end).toLocaleDateString('hu-HU')
          : '',
        ...variables,
      })
    );

    // Log each email
    for (const recipient of recipients) {
      const vars = {
        name: recipient.name || '',
        workplace: recipient.workplace || '',
        accommodation: recipient.accommodation || '',
        visa_expiry: recipient.visa_expiry
          ? new Date(recipient.visa_expiry).toLocaleDateString('hu-HU')
          : '',
        contract_end: recipient.contract_end
          ? new Date(recipient.contract_end).toLocaleDateString('hu-HU')
          : '',
        ...variables,
      };
      const personalSubject = interpolateTemplate(emailSubject, vars);
      const personalBody = interpolateTemplate(emailBody, vars);
      const failed = results.errors.find((e) => e.email === recipient.email);

      try {
        await query(
          `INSERT INTO email_logs (to_email, subject, body, status, error_message, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            recipient.email,
            personalSubject,
            personalBody,
            failed ? 'failed' : 'sent',
            failed ? failed.error : null,
            new Date(),
          ]
        );
      } catch (logError) {
        console.error('Email log insert error:', logError);
      }

      // Insert notification for users that have a user_id
      if (recipient.user_id) {
        try {
          await query(
            `INSERT INTO notifications (user_id, type, title, message, sent_at)
             VALUES ($1, 'email', $2, $3, $4)`,
            [recipient.user_id, personalSubject, personalBody, new Date()]
          );
        } catch (notifError) {
          console.error('Notification insert error:', notifError);
        }
      }
    }

    res.json({
      success: true,
      data: {
        sent: results.sent,
        failed: results.failed,
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error('sendBulk error:', error);
    res.status(500).json({ success: false, message: 'Hiba a tömeges email küldésekor' });
  }
};

/**
 * GET /email-logs - List email logs with pagination
 */
const getEmailLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const countResult = await query('SELECT COUNT(*) FROM email_logs');
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      'SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('getEmailLogs error:', error);
    res.status(500).json({ success: false, message: 'Hiba az email naplók lekérésekor' });
  }
};

module.exports = {
  getTemplates,
  getFilterOptions,
  filterRecipients,
  sendBulk,
  getEmailLogs,
};
