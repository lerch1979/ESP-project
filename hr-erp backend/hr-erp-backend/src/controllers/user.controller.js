const bcrypt = require('bcryptjs');
const pool = require('../database/connection');
const { logger } = require('../utils/logger');

// Felhasználók lekérdezése (role szűrővel)
const getUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 50 } = req.query;
    const contractorId = req.user?.contractorId;

    let query = `
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.contractor_id,
        u.is_active,
        u.last_login,
        u.created_at,
        c.name as contractor_name,
        COALESCE(
          json_agg(
            json_build_object('id', r.id, 'name', r.name, 'slug', r.slug)
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as roles
      FROM users u
      LEFT JOIN contractors c ON u.contractor_id = c.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Contractor szűrés (ha nem superadmin)
    if (contractorId && !req.user.roles.includes('superadmin')) {
      query += ` AND u.contractor_id = $${paramIndex}`;
      params.push(contractorId);
      paramIndex++;
    }

    // Szerepkör szerinti szűrés
    if (role) {
      query += ` AND EXISTS (
        SELECT 1 FROM user_roles ur2
        JOIN roles r2 ON ur2.role_id = r2.id
        WHERE ur2.user_id = u.id AND r2.slug = $${paramIndex}
      )`;
      params.push(role);
      paramIndex++;
    }

    // Keresés
    if (search) {
      query += ` AND (u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` GROUP BY u.id, c.name ORDER BY u.first_name, u.last_name`;

    // Lapozás
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: {
        users: result.rows,
        count: result.rows.length,
        page: parseInt(page),
        limit: parseInt(limit)
      },
    });
  } catch (error) {
    logger.error('Felhasználók lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a felhasználók lekérdezése során',
    });
  }
};

// Felhasználó részletek
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.contractor_id,
        u.is_active,
        u.last_login,
        u.created_at,
        c.name as contractor_name
       FROM users u
       LEFT JOIN contractors c ON u.contractor_id = c.id
       WHERE u.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található',
      });
    }

    // Get user roles
    const rolesResult = await pool.query(
      `SELECT r.id, r.name, r.slug, r.description
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [id]
    );

    const user = {
      ...result.rows[0],
      roles: rolesResult.rows
    };

    res.json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    logger.error('Felhasználó lekérdezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a felhasználó lekérdezése során',
    });
  }
};

// Felhasználó létrehozása
const createUser = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, contractorId, roleId } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Email, jelszó, vezetéknév és keresztnév megadása kötelező'
      });
    }

    // Check email uniqueness
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ezzel az email címmel már létezik felhasználó'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Determine contractor_id
    const effectiveContractorId = contractorId || req.user.contractorId;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, contractor_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, email, first_name, last_name, phone, contractor_id, is_active, created_at`,
      [email.toLowerCase(), passwordHash, firstName, lastName, phone || null, effectiveContractorId]
    );

    const newUser = userResult.rows[0];

    // Assign role if provided
    if (roleId) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id, contractor_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [newUser.id, roleId, effectiveContractorId]
      );
    }

    // Get assigned roles for response
    const rolesResult = await pool.query(
      `SELECT r.id, r.name, r.slug
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [newUser.id]
    );

    logger.info('Új felhasználó létrehozva', {
      userId: newUser.id,
      email: newUser.email,
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Felhasználó sikeresen létrehozva',
      data: {
        user: {
          ...newUser,
          roles: rolesResult.rows
        }
      }
    });
  } catch (error) {
    logger.error('Felhasználó létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a felhasználó létrehozása során'
    });
  }
};

// Felhasználó frissítése
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, email, isActive, roleId } = req.body;

    // Check user exists
    const existing = await pool.query('SELECT id, contractor_id FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található'
      });
    }

    const user = existing.rows[0];

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex}`);
      params.push(firstName);
      paramIndex++;
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex}`);
      params.push(lastName);
      paramIndex++;
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex}`);
      params.push(phone);
      paramIndex++;
    }
    if (email !== undefined) {
      updates.push(`email = $${paramIndex}`);
      params.push(email.toLowerCase());
      paramIndex++;
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(isActive);
      paramIndex++;
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(id);
      await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        params
      );
    }

    // Update role if provided
    if (roleId) {
      // Remove existing roles for this contractor
      await pool.query(
        'DELETE FROM user_roles WHERE user_id = $1 AND contractor_id = $2',
        [id, user.contractor_id]
      );
      // Assign new role
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id, contractor_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, roleId, user.contractor_id]
      );
    }

    // Fetch updated user
    const updatedResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.contractor_id,
              u.is_active, u.last_login, u.created_at, c.name as contractor_name
       FROM users u
       LEFT JOIN contractors c ON u.contractor_id = c.id
       WHERE u.id = $1`,
      [id]
    );

    const rolesResult = await pool.query(
      `SELECT r.id, r.name, r.slug
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [id]
    );

    logger.info('Felhasználó frissítve', {
      userId: id,
      updatedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Felhasználó sikeresen frissítve',
      data: {
        user: {
          ...updatedResult.rows[0],
          roles: rolesResult.rows
        }
      }
    });
  } catch (error) {
    logger.error('Felhasználó frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a felhasználó frissítése során'
    });
  }
};

// Felhasználó törlése (deaktiválás)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Saját magadat nem törölheted'
      });
    }

    const result = await pool.query(
      `UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, email, first_name, last_name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található'
      });
    }

    logger.info('Felhasználó deaktiválva', {
      userId: id,
      deletedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Felhasználó sikeresen deaktiválva',
      data: { user: result.rows[0] }
    });
  } catch (error) {
    logger.error('Felhasználó törlési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a felhasználó törlése során'
    });
  }
};

// Felhasználó szerepkör frissítése
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({
        success: false,
        message: 'A roleId megadása kötelező'
      });
    }

    // Check user exists
    const userResult = await pool.query('SELECT id, contractor_id FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található'
      });
    }

    // Check role exists
    const roleResult = await pool.query('SELECT id, name, slug FROM roles WHERE id = $1', [roleId]);
    if (roleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szerepkör nem található'
      });
    }

    const user = userResult.rows[0];

    // Remove existing roles and assign new one
    await pool.query(
      'DELETE FROM user_roles WHERE user_id = $1 AND contractor_id = $2',
      [id, user.contractor_id]
    );

    await pool.query(
      `INSERT INTO user_roles (user_id, role_id, contractor_id)
       VALUES ($1, $2, $3)`,
      [id, roleId, user.contractor_id]
    );

    logger.info('Felhasználó szerepkör frissítve', {
      userId: id,
      newRole: roleResult.rows[0].slug,
      updatedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Szerepkör sikeresen frissítve',
      data: {
        role: roleResult.rows[0]
      }
    });
  } catch (error) {
    logger.error('Szerepkör frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a szerepkör frissítése során'
    });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserRole,
};
