const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/**
 * Felhasználó bejelentkezés
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validáció
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email és jelszó megadása kötelező'
      });
    }

    // Felhasználó keresése
    const userResult = await query(
      `SELECT u.*, t.name as tenant_name, t.slug as tenant_slug, t.is_active as tenant_active
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Hibás email vagy jelszó'
      });
    }

    const user = userResult.rows[0];

    // Ellenőrzések
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'A fiók inaktív'
      });
    }

    if (!user.tenant_active) {
      return res.status(401).json({
        success: false,
        message: 'A cég fiók inaktív'
      });
    }

    // Jelszó ellenőrzés
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Hibás email vagy jelszó'
      });
    }

    // Szerepkörök lekérése
    const rolesResult = await query(
      `SELECT r.slug, r.name 
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
      [user.id, user.tenant_id]
    );

    const roles = rolesResult.rows.map(r => r.slug);
    const roleNames = rolesResult.rows.map(r => r.name);

    // JWT token generálás
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        roles: roles
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );

    // Refresh token
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    // Utolsó bejelentkezés frissítése
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    logger.info('Sikeres bejelentkezés', { 
      userId: user.id, 
      email: user.email,
      tenant: user.tenant_name
    });

    res.json({
      success: true,
      message: 'Sikeres bejelentkezés',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          tenant: {
            id: user.tenant_id,
            name: user.tenant_name,
            slug: user.tenant_slug
          },
          roles: roleNames
        }
      }
    });

  } catch (error) {
    logger.error('Bejelentkezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Bejelentkezési hiba történt'
    });
  }
};

/**
 * Token frissítés
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token szükséges'
      });
    }

    // Token ellenőrzés
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Új access token generálás
    const userResult = await query(
      'SELECT id, email, tenant_id FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Érvénytelen refresh token'
      });
    }

    const user = userResult.rows[0];

    // Szerepkörök lekérése
    const rolesResult = await query(
      'SELECT r.slug FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1',
      [user.id]
    );

    const newToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        tenantId: user.tenant_id,
        roles: rolesResult.rows.map(r => r.slug)
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );

    res.json({
      success: true,
      data: { token: newToken }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token lejárt, kérjük jelentkezz be újra'
      });
    }

    logger.error('Token frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Token frissítési hiba'
    });
  }
};

/**
 * Jelenlegi felhasználó adatai
 */
const me = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  } catch (error) {
    logger.error('Me endpoint hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba történt'
    });
  }
};

/**
 * Kijelentkezés (token invalidálás később implementálható Redis-szel)
 */
const logout = async (req, res) => {
  try {
    // Jelenleg csak sikeres választ küldünk
    // Későbbi továbbfejlesztés: token blacklist Redis-ben
    
    logger.info('Kijelentkezés', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Sikeres kijelentkezés'
    });
  } catch (error) {
    logger.error('Kijelentkezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Kijelentkezési hiba'
    });
  }
};

module.exports = {
  login,
  refreshToken,
  me,
  logout
};
