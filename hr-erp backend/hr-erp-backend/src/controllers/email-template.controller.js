const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * GET /email-templates
 * Lista az összes email sablonról (szűrés, keresés, lapozás)
 */
const getEmailTemplates = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      template_type,
      is_active,
      sort_by = 'created_at',
      sort_order = 'DESC',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Contractor filter: system templates (NULL) + contractor-specific
    if (req.user.roles.includes('superadmin')) {
      // Superadmin sees all
    } else {
      conditions.push(`(et.contractor_id IS NULL OR et.contractor_id = $${paramIndex})`);
      params.push(req.user.contractorId);
      paramIndex++;
    }

    if (search) {
      conditions.push(`(et.name ILIKE $${paramIndex} OR et.slug ILIKE $${paramIndex} OR et.subject ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (template_type) {
      conditions.push(`et.template_type = $${paramIndex}`);
      params.push(template_type);
      paramIndex++;
    }

    if (is_active !== undefined) {
      conditions.push(`et.is_active = $${paramIndex}`);
      params.push(is_active === 'true');
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort
    const allowedSorts = ['name', 'slug', 'template_type', 'created_at', 'updated_at', 'is_active'];
    const safeSort = allowedSorts.includes(sort_by) ? sort_by : 'created_at';
    const safeOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const countResult = await query(
      `SELECT COUNT(*) as total FROM email_templates et ${whereClause}`,
      params
    );

    const result = await query(
      `SELECT et.*,
              u.first_name || ' ' || u.last_name AS created_by_name,
              c.name AS contractor_name
       FROM email_templates et
       LEFT JOIN users u ON u.id = et.created_by
       LEFT JOIN contractors c ON c.id = et.contractor_id
       ${whereClause}
       ORDER BY et.${safeSort} ${safeOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), offset]
    );

    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      data: {
        templates: result.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Email sablon listázási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablonok lekérdezésekor',
    });
  }
};

/**
 * GET /email-templates/:id
 * Egy email sablon részletei
 */
const getEmailTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT et.*,
              u.first_name || ' ' || u.last_name AS created_by_name,
              c.name AS contractor_name
       FROM email_templates et
       LEFT JOIN users u ON u.id = et.created_by
       LEFT JOIN contractors c ON c.id = et.contractor_id
       WHERE et.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email sablon nem található',
      });
    }

    res.json({
      success: true,
      data: { template: result.rows[0] },
    });
  } catch (error) {
    logger.error('Email sablon lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon lekérdezésekor',
    });
  }
};

/**
 * GET /email-templates/slug/:slug
 * Email sablon lekérése slug alapján
 */
const getEmailTemplateBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const result = await query(
      `SELECT et.*,
              u.first_name || ' ' || u.last_name AS created_by_name
       FROM email_templates et
       LEFT JOIN users u ON u.id = et.created_by
       WHERE et.slug = $1 AND et.is_active = true`,
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email sablon nem található',
      });
    }

    res.json({
      success: true,
      data: { template: result.rows[0] },
    });
  } catch (error) {
    logger.error('Email sablon lekérdezési hiba (slug):', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon lekérdezésekor',
    });
  }
};

/**
 * POST /email-templates
 * Új email sablon létrehozása
 */
const createEmailTemplate = async (req, res) => {
  try {
    const { name, slug, subject, body, template_type, variables, is_active, contractor_id } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A sablon neve kötelező',
      });
    }
    if (!slug || !slug.trim()) {
      return res.status(400).json({
        success: false,
        message: 'A sablon slug kötelező',
      });
    }
    if (!subject || !subject.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Az email tárgy kötelező',
      });
    }
    if (!body || !body.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Az email törzs kötelező',
      });
    }

    // Check slug uniqueness
    const existing = await query(
      'SELECT id FROM email_templates WHERE slug = $1',
      [slug.trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ez a slug már foglalt',
      });
    }

    // Validate slug format
    if (!/^[a-z0-9_-]+$/.test(slug.trim())) {
      return res.status(400).json({
        success: false,
        message: 'A slug csak kisbetűket, számokat, kötőjelet és aláhúzást tartalmazhat',
      });
    }

    const effectiveContractorId = req.user.roles.includes('superadmin')
      ? (contractor_id || null)
      : req.user.contractorId;

    const result = await query(
      `INSERT INTO email_templates (name, slug, subject, body, template_type, variables, is_active, contractor_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        name.trim(),
        slug.trim(),
        subject.trim(),
        body.trim(),
        template_type || 'custom',
        JSON.stringify(variables || []),
        is_active !== undefined ? is_active : true,
        effectiveContractorId,
        req.user.id,
      ]
    );

    logger.info('Email sablon létrehozva', {
      templateId: result.rows[0].id,
      slug: slug.trim(),
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Email sablon sikeresen létrehozva',
      data: { template: result.rows[0] },
    });
  } catch (error) {
    logger.error('Email sablon létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon létrehozásakor',
    });
  }
};

/**
 * PUT /email-templates/:id
 * Email sablon módosítása
 */
const updateEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, subject, body, template_type, variables, is_active } = req.body;

    // Check if exists
    const existing = await query('SELECT * FROM email_templates WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email sablon nem található',
      });
    }

    // Build dynamic update
    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      params.push(name.trim());
      paramIndex++;
    }
    if (slug !== undefined) {
      // Check slug uniqueness (exclude current)
      if (!/^[a-z0-9_-]+$/.test(slug.trim())) {
        return res.status(400).json({
          success: false,
          message: 'A slug csak kisbetűket, számokat, kötőjelet és aláhúzást tartalmazhat',
        });
      }
      const slugCheck = await query(
        'SELECT id FROM email_templates WHERE slug = $1 AND id != $2',
        [slug.trim(), id]
      );
      if (slugCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Ez a slug már foglalt',
        });
      }
      fields.push(`slug = $${paramIndex}`);
      params.push(slug.trim());
      paramIndex++;
    }
    if (subject !== undefined) {
      fields.push(`subject = $${paramIndex}`);
      params.push(subject.trim());
      paramIndex++;
    }
    if (body !== undefined) {
      fields.push(`body = $${paramIndex}`);
      params.push(body.trim());
      paramIndex++;
    }
    if (template_type !== undefined) {
      fields.push(`template_type = $${paramIndex}`);
      params.push(template_type);
      paramIndex++;
    }
    if (variables !== undefined) {
      fields.push(`variables = $${paramIndex}`);
      params.push(JSON.stringify(variables));
      paramIndex++;
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${paramIndex}`);
      params.push(is_active);
      paramIndex++;
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nincs módosítandó mező',
      });
    }

    params.push(id);
    const result = await query(
      `UPDATE email_templates SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    logger.info('Email sablon módosítva', {
      templateId: id,
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: 'Email sablon sikeresen módosítva',
      data: { template: result.rows[0] },
    });
  } catch (error) {
    logger.error('Email sablon módosítási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon módosításakor',
    });
  }
};

/**
 * DELETE /email-templates/:id
 * Email sablon törlése (soft delete - is_active = false)
 */
const deleteEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id, name, slug FROM email_templates WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email sablon nem található',
      });
    }

    await query(
      'UPDATE email_templates SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info('Email sablon deaktiválva', {
      templateId: id,
      slug: existing.rows[0].slug,
      userId: req.user.id,
    });

    res.json({
      success: true,
      message: 'Email sablon sikeresen törölve',
    });
  } catch (error) {
    logger.error('Email sablon törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon törlésekor',
    });
  }
};

/**
 * POST /email-templates/:id/preview
 * Email sablon előnézet - változók behelyettesítése
 */
const previewEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;

    const result = await query('SELECT * FROM email_templates WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email sablon nem található',
      });
    }

    const template = result.rows[0];
    let renderedSubject = template.subject;
    let renderedBody = template.body;

    // Replace variables
    if (variables && typeof variables === 'object') {
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        renderedSubject = renderedSubject.replace(regex, value);
        renderedBody = renderedBody.replace(regex, value);
      }
    }

    // Find unreplaced variables
    const unresolved = [];
    const varRegex = /\{\{(\w+)\}\}/g;
    let match;
    while ((match = varRegex.exec(renderedBody)) !== null) {
      if (!unresolved.includes(match[1])) {
        unresolved.push(match[1]);
      }
    }
    while ((match = varRegex.exec(renderedSubject)) !== null) {
      if (!unresolved.includes(match[1])) {
        unresolved.push(match[1]);
      }
    }

    res.json({
      success: true,
      data: {
        subject: renderedSubject,
        body: renderedBody,
        unresolved_variables: unresolved,
      },
    });
  } catch (error) {
    logger.error('Email sablon előnézeti hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon előnézeténél',
    });
  }
};

/**
 * POST /email-templates/:id/render
 * Email sablon renderelés (programmatic - returns rendered template)
 */
const renderEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;

    const result = await query(
      'SELECT * FROM email_templates WHERE id = $1 AND is_active = true',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aktív email sablon nem található',
      });
    }

    const template = result.rows[0];
    let renderedSubject = template.subject;
    let renderedBody = template.body;

    if (variables && typeof variables === 'object') {
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        renderedSubject = renderedSubject.replace(regex, value);
        renderedBody = renderedBody.replace(regex, value);
      }
    }

    res.json({
      success: true,
      data: {
        template_id: template.id,
        template_slug: template.slug,
        subject: renderedSubject,
        body: renderedBody,
      },
    });
  } catch (error) {
    logger.error('Email sablon renderelési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon renderelésénél',
    });
  }
};

/**
 * POST /email-templates/:id/duplicate
 * Email sablon duplikálása
 */
const duplicateEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;

    const existing = await query('SELECT * FROM email_templates WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Email sablon nem található',
      });
    }

    const original = existing.rows[0];
    const newName = name || `${original.name} (másolat)`;
    const newSlug = slug || `${original.slug}_copy_${Date.now()}`;

    // Validate new slug
    if (!/^[a-z0-9_-]+$/.test(newSlug)) {
      return res.status(400).json({
        success: false,
        message: 'A slug csak kisbetűket, számokat, kötőjelet és aláhúzást tartalmazhat',
      });
    }

    const slugCheck = await query('SELECT id FROM email_templates WHERE slug = $1', [newSlug]);
    if (slugCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ez a slug már foglalt',
      });
    }

    const effectiveContractorId = req.user.roles.includes('superadmin')
      ? original.contractor_id
      : req.user.contractorId;

    const result = await query(
      `INSERT INTO email_templates (name, slug, subject, body, template_type, variables, is_active, contractor_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        newName,
        newSlug,
        original.subject,
        original.body,
        original.template_type,
        JSON.stringify(original.variables),
        true,
        effectiveContractorId,
        req.user.id,
      ]
    );

    logger.info('Email sablon duplikálva', {
      originalId: id,
      newId: result.rows[0].id,
      userId: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Email sablon sikeresen duplikálva',
      data: { template: result.rows[0] },
    });
  } catch (error) {
    logger.error('Email sablon duplikálási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba az email sablon duplikálásakor',
    });
  }
};

/**
 * GET /email-templates/types
 * Elérhető sablon típusok listája
 */
const getTemplateTypes = async (req, res) => {
  try {
    const result = await query(
      `SELECT DISTINCT template_type, COUNT(*) as count
       FROM email_templates
       WHERE is_active = true
       GROUP BY template_type
       ORDER BY template_type`
    );

    const allTypes = [
      { value: 'welcome', label: 'Üdvözlő' },
      { value: 'ticket_created', label: 'Hibajegy létrehozva' },
      { value: 'ticket_status_changed', label: 'Hibajegy státusz változás' },
      { value: 'password_reset', label: 'Jelszó visszaállítás' },
      { value: 'accommodation_assigned', label: 'Szállás hozzárendelés' },
      { value: 'document_uploaded', label: 'Dokumentum feltöltés' },
      { value: 'employment_terminated', label: 'Munkaviszony megszűnés' },
      { value: 'leave_approved', label: 'Szabadság jóváhagyás' },
      { value: 'custom', label: 'Egyéni' },
    ];

    // Merge counts
    const countMap = {};
    result.rows.forEach(r => { countMap[r.template_type] = parseInt(r.count); });

    const types = allTypes.map(t => ({
      ...t,
      count: countMap[t.value] || 0,
    }));

    res.json({
      success: true,
      data: { types },
    });
  } catch (error) {
    logger.error('Sablon típus lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a sablon típusok lekérdezésekor',
    });
  }
};

module.exports = {
  getEmailTemplates,
  getEmailTemplateById,
  getEmailTemplateBySlug,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  previewEmailTemplate,
  renderEmailTemplate,
  duplicateEmailTemplate,
  getTemplateTypes,
};
