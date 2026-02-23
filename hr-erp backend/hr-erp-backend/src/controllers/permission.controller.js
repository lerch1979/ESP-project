const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { getUserPermissions } = require('../middleware/permission');

/**
 * GET /api/v1/permissions
 * Összes elérhető jogosultság lekérése (modul szerint csoportosítva)
 */
const getAllPermissions = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, slug, module, action, display_name, description
       FROM permissions
       ORDER BY module, action`
    );

    // Group by module
    const grouped = {};
    for (const perm of result.rows) {
      if (!grouped[perm.module]) {
        grouped[perm.module] = [];
      }
      grouped[perm.module].push(perm);
    }

    res.json({
      success: true,
      data: {
        permissions: result.rows,
        grouped,
        count: result.rows.length
      }
    });
  } catch (error) {
    logger.error('Jogosultságok lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a jogosultságok lekérdezése során'
    });
  }
};

/**
 * GET /api/v1/roles
 * Összes szerepkör lekérése jogosultságokkal
 */
const getRoles = async (req, res) => {
  try {
    const rolesResult = await query(
      `SELECT id, name, slug, description, is_system, created_at
       FROM roles
       ORDER BY is_system DESC, name`
    );

    // Get permissions for each role
    const roles = [];
    for (const role of rolesResult.rows) {
      const permsResult = await query(
        `SELECT p.id, p.name, p.slug, p.module, p.action, p.display_name
         FROM permissions p
         JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE rp.role_id = $1
         ORDER BY p.module, p.action`,
        [role.id]
      );

      roles.push({
        ...role,
        permissions: permsResult.rows,
        permissionCount: permsResult.rows.length
      });
    }

    res.json({
      success: true,
      data: {
        roles,
        count: roles.length
      }
    });
  } catch (error) {
    logger.error('Szerepkörök lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a szerepkörök lekérdezése során'
    });
  }
};

/**
 * GET /api/v1/users/:id/permissions
 * Felhasználó effektív jogosultságainak lekérése
 */
const getUserPermissionsEndpoint = async (req, res) => {
  try {
    const { id } = req.params;

    // Get user info with roles
    const userResult = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM users u
       WHERE u.id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található'
      });
    }

    // Get user's roles
    const rolesResult = await query(
      `SELECT r.id, r.name, r.slug, r.description
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [id]
    );

    // Get effective permissions
    const effectivePermissions = await getUserPermissions(id);

    // Get role-based permissions (before overrides)
    const rolePermsResult = await query(
      `SELECT DISTINCT p.slug
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1`,
      [id]
    );

    // Get user-level overrides
    const overridesResult = await query(
      `SELECT p.id, p.slug, p.module, p.display_name, up.granted
       FROM user_permissions up
       JOIN permissions p ON up.permission_id = p.id
       WHERE up.user_id = $1`,
      [id]
    );

    res.json({
      success: true,
      data: {
        user: userResult.rows[0],
        roles: rolesResult.rows,
        effectivePermissions,
        rolePermissions: rolePermsResult.rows.map(r => r.slug),
        overrides: overridesResult.rows
      }
    });
  } catch (error) {
    logger.error('Felhasználó jogosultság lekérési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a jogosultságok lekérdezése során'
    });
  }
};

/**
 * PUT /api/v1/users/:id/permissions
 * Felhasználó jogosultságainak frissítése (egyéni felülírások)
 * Body: { permissions: [{ permissionId: UUID, granted: boolean }] }
 */
const updateUserPermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions: permUpdates } = req.body;

    if (!Array.isArray(permUpdates)) {
      return res.status(400).json({
        success: false,
        message: 'A permissions mező kötelező és tömbnek kell lennie'
      });
    }

    // Verify user exists
    const userResult = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Felhasználó nem található'
      });
    }

    await transaction(async (client) => {
      // Remove all existing user permission overrides
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [id]);

      // Insert new overrides
      for (const perm of permUpdates) {
        if (!perm.permissionId) continue;

        await client.query(
          `INSERT INTO user_permissions (user_id, permission_id, granted, granted_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, permission_id) DO UPDATE SET granted = $3, granted_by = $4, granted_at = CURRENT_TIMESTAMP`,
          [id, perm.permissionId, perm.granted !== false, req.user.id]
        );
      }
    });

    // Return updated permissions
    const effectivePermissions = await getUserPermissions(id);

    logger.info('Felhasználó jogosultságok frissítve', {
      targetUserId: id,
      updatedBy: req.user.id,
      overrideCount: permUpdates.length
    });

    res.json({
      success: true,
      message: 'Jogosultságok sikeresen frissítve',
      data: {
        effectivePermissions
      }
    });
  } catch (error) {
    logger.error('Jogosultság frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a jogosultságok frissítése során'
    });
  }
};

/**
 * POST /api/v1/roles
 * Új szerepkör létrehozása
 * Body: { name, slug, description, permissions: [permissionId] }
 */
const createRole = async (req, res) => {
  try {
    const { name, slug, description, permissions: permissionIds } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: 'A név és slug megadása kötelező'
      });
    }

    // Check uniqueness
    const existing = await query('SELECT id FROM roles WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ezzel a slug-gal már létezik szerepkör'
      });
    }

    let newRole;

    await transaction(async (client) => {
      const roleResult = await client.query(
        `INSERT INTO roles (name, slug, description, is_system)
         VALUES ($1, $2, $3, false)
         RETURNING id, name, slug, description, is_system, created_at`,
        [name, slug, description || null]
      );
      newRole = roleResult.rows[0];

      // Assign permissions if provided
      if (Array.isArray(permissionIds) && permissionIds.length > 0) {
        for (const permId of permissionIds) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [newRole.id, permId]
          );
        }
      }
    });

    // Fetch permissions for response
    const permsResult = await query(
      `SELECT p.id, p.slug, p.display_name, p.module
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1`,
      [newRole.id]
    );

    logger.info('Új szerepkör létrehozva', {
      roleId: newRole.id,
      slug: newRole.slug,
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      message: 'Szerepkör sikeresen létrehozva',
      data: {
        role: {
          ...newRole,
          permissions: permsResult.rows
        }
      }
    });
  } catch (error) {
    logger.error('Szerepkör létrehozási hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a szerepkör létrehozása során'
    });
  }
};

/**
 * PUT /api/v1/roles/:id/permissions
 * Szerepkör jogosultságainak frissítése
 * Body: { permissions: [permissionId] }
 */
const updateRolePermissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions: permissionIds } = req.body;

    if (!Array.isArray(permissionIds)) {
      return res.status(400).json({
        success: false,
        message: 'A permissions mező kötelező és tömbnek kell lennie'
      });
    }

    // Verify role exists
    const roleResult = await query('SELECT id, slug, is_system FROM roles WHERE id = $1', [id]);
    if (roleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Szerepkör nem található'
      });
    }

    const role = roleResult.rows[0];

    // Prevent modification of superadmin role permissions
    if (role.slug === 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'A szuperadmin szerepkör jogosultságai nem módosíthatók'
      });
    }

    await transaction(async (client) => {
      // Remove all existing permissions for this role
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);

      // Insert new permissions
      for (const permId of permissionIds) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [id, permId]
        );
      }
    });

    // Fetch updated permissions
    const permsResult = await query(
      `SELECT p.id, p.slug, p.display_name, p.module
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1
       ORDER BY p.module, p.action`,
      [id]
    );

    logger.info('Szerepkör jogosultságok frissítve', {
      roleId: id,
      roleSlug: role.slug,
      permissionCount: permissionIds.length,
      updatedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Szerepkör jogosultságok sikeresen frissítve',
      data: {
        role: {
          ...role,
          permissions: permsResult.rows
        }
      }
    });
  } catch (error) {
    logger.error('Szerepkör jogosultság frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba a szerepkör jogosultságainak frissítése során'
    });
  }
};

module.exports = {
  getAllPermissions,
  getRoles,
  getUserPermissions: getUserPermissionsEndpoint,
  updateUserPermissions,
  createRole,
  updateRolePermissions
};
