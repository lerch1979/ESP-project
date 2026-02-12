const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * JWT token ellenőrzés middleware
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Nincs authentikációs token megadva'
      });
    }

    // Token ellenőrzése
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Felhasználó lekérése az adatbázisból
    const userResult = await query(
      `SELECT u.*, t.name as tenant_name, t.slug as tenant_slug
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1 AND u.is_active = true`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Érvénytelen token vagy inaktív felhasználó'
      });
    }

    const user = userResult.rows[0];

    // Felhasználó szerepköreinek lekérése
    const rolesResult = await query(
      `SELECT r.slug, r.name 
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
      [user.id, user.tenant_id]
    );

    user.roles = rolesResult.rows.map(r => r.slug);
    user.roleNames = rolesResult.rows.map(r => r.name);

    // Request objektumhoz hozzáadjuk a usert
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
      roles: user.roles,
      roleNames: user.roleNames
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Érvénytelen token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token lejárt'
      });
    }

    logger.error('Authentikációs hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Authentikációs hiba történt'
    });
  }
};

/**
 * Szerepkör ellenőrzés middleware
 * @param {Array} allowedRoles - Engedélyezett szerepkörök tömbje
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentikáció szükséges'
      });
    }

    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'Nincs jogosultságod ehhez a művelethez',
        requiredRoles: allowedRoles,
        userRoles: req.user.roles
      });
    }

    next();
  };
};

/**
 * Szuperadmin ellenőrzés
 */
const requireSuperAdmin = requireRole(['superadmin']);

/**
 * Admin vagy magasabb jogosultság ellenőrzés
 */
const requireAdmin = requireRole(['superadmin', 'data_controller', 'admin']);

/**
 * Tenant ID ellenőrzés middleware
 * Biztosítja, hogy a felhasználó csak a saját tenant adataihoz férjen hozzá
 */
const checkTenantAccess = (req, res, next) => {
  // Szuperadmin mindent láthat
  if (req.user.roles.includes('superadmin')) {
    return next();
  }

  // Ha van tenant_id a query-ben vagy body-ban, ellenőrizzük
  const requestedTenantId = req.query.tenant_id || req.body.tenant_id || req.params.tenant_id;

  if (requestedTenantId && requestedTenantId !== req.user.tenantId) {
    return res.status(403).json({
      success: false,
      message: 'Nincs jogosultságod más tenant adataihoz'
    });
  }

  next();
};

module.exports = {
  authenticateToken,
  requireRole,
  requireSuperAdmin,
  requireAdmin,
  checkTenantAccess
};
