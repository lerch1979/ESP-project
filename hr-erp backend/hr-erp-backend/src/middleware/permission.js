const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Felhasználó effektív jogosultságainak lekérése
 * Logika: szerepkör jogosultságok + egyéni felülírások
 * - role_permissions adja az alap jogokat
 * - user_permissions granted=true hozzáad extra jogokat
 * - user_permissions granted=false elvesz jogokat
 */
const getUserPermissions = async (userId) => {
  try {
    const result = await query(
      `SELECT DISTINCT slug FROM (
        -- Role-based permissions
        SELECT p.slug
        FROM permissions p
        JOIN role_permissions rp ON rp.permission_id = p.id
        JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = $1

        UNION

        -- User-level granted permissions (overrides)
        SELECT p.slug
        FROM permissions p
        JOIN user_permissions up ON up.permission_id = p.id
        WHERE up.user_id = $1 AND up.granted = true
      ) AS all_granted

      -- Except explicitly revoked permissions
      EXCEPT

      SELECT p.slug
      FROM permissions p
      JOIN user_permissions up ON up.permission_id = p.id
      WHERE up.user_id = $1 AND up.granted = false`,
      [userId]
    );

    return result.rows.map(r => r.slug);
  } catch (error) {
    logger.error('Jogosultság lekérési hiba:', error);
    return [];
  }
};

/**
 * Jogosultság ellenőrzés middleware
 * @param {string} requiredPermission - Szükséges jogosultság slug (pl. 'employees.view')
 */
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentikáció szükséges'
        });
      }

      // Superadmin has all permissions
      if (req.user.roles && req.user.roles.includes('superadmin')) {
        return next();
      }

      // Load permissions if not already loaded in this request
      if (!req.user.permissions) {
        req.user.permissions = await getUserPermissions(req.user.id);
      }

      if (req.user.permissions.includes(requiredPermission)) {
        return next();
      }

      logger.warn('Jogosultság megtagadva', {
        userId: req.user.id,
        requiredPermission,
        userPermissions: req.user.permissions
      });

      return res.status(403).json({
        success: false,
        message: 'Nincs jogosultságod ehhez a művelethez',
        requiredPermission
      });
    } catch (error) {
      logger.error('Jogosultság ellenőrzési hiba:', error);
      return res.status(500).json({
        success: false,
        message: 'Jogosultság ellenőrzési hiba'
      });
    }
  };
};

/**
 * Több jogosultság bármelyikének ellenőrzése (OR logika)
 * @param {string[]} permissions - Jogosultságok tömbje
 */
const checkAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentikáció szükséges'
        });
      }

      if (req.user.roles && req.user.roles.includes('superadmin')) {
        return next();
      }

      if (!req.user.permissions) {
        req.user.permissions = await getUserPermissions(req.user.id);
      }

      const hasAny = permissions.some(p => req.user.permissions.includes(p));

      if (hasAny) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: 'Nincs jogosultságod ehhez a művelethez',
        requiredPermissions: permissions
      });
    } catch (error) {
      logger.error('Jogosultság ellenőrzési hiba:', error);
      return res.status(500).json({
        success: false,
        message: 'Jogosultság ellenőrzési hiba'
      });
    }
  };
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  getUserPermissions
};
