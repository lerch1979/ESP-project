/**
 * Set Database User Context Middleware
 *
 * Sets PostgreSQL session variables on each request so that:
 *  - RLS policies can filter rows by contractor/user/role
 *  - Audit triggers can track who made changes
 *
 * Must run AFTER authenticateToken middleware.
 */

const { pool } = require('../database/connection');
const { logger } = require('../utils/logger');

// UUID v4 regex — only allow valid UUIDs (prevents SQL injection)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Allowed role slugs (whitelist)
const ALLOWED_ROLES = ['superadmin', 'data_controller', 'admin', 'manager', 'task_owner', 'user'];

function sanitizeUUID(value) {
  if (!value || !UUID_RE.test(String(value))) return null;
  return String(value);
}

function sanitizeRole(role) {
  if (!role || !ALLOWED_ROLES.includes(String(role))) return null;
  return String(role);
}

/**
 * Middleware that sets PostgreSQL session variables for the authenticated user.
 * These are used by RLS policies and audit triggers.
 * SECURITY: All inputs validated against whitelist/regex before use in SET LOCAL.
 */
async function setDatabaseUser(req, res, next) {
  if (!req.user) {
    return next();
  }

  let client;
  try {
    client = await pool.connect();

    // SECURITY: Validate UUID before using in SET LOCAL (prevents SQL injection)
    const userId = sanitizeUUID(req.user.id);
    if (userId) {
      await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
    }

    const contractorId = sanitizeUUID(req.user.contractorId);
    if (contractorId) {
      await client.query(`SET LOCAL app.current_contractor_id = '${contractorId}'`);
    }

    if (req.user.roles && req.user.roles.length > 0) {
      const role = req.user.roles.includes('superadmin') ? 'superadmin'
        : req.user.roles.includes('data_controller') ? 'data_controller'
        : req.user.roles.includes('admin') ? 'admin'
        : req.user.roles[0];
      // SECURITY: Whitelist validation (only known role slugs allowed)
      const safeRole = sanitizeRole(role);
      if (safeRole) {
        await client.query(`SET LOCAL app.current_role = '${safeRole}'`);
      }
    }

    // Store client on request for downstream queries to use
    req.dbClient = client;
    req.dbClientReleased = false;

    // Release client when response finishes
    const releaseClient = () => {
      if (!req.dbClientReleased && client) {
        req.dbClientReleased = true;
        client.release();
      }
    };

    res.on('finish', releaseClient);
    res.on('close', releaseClient);

    next();
  } catch (error) {
    if (client) client.release();
    logger.error('[setDatabaseUser] Failed to set session vars:', { error: error.message });
    next();
  }
}

/**
 * Lightweight version that only sets the audit user_id (no RLS).
 * Use this when RLS is not needed but audit tracking is.
 */
async function setAuditUser(req, res, next) {
  if (!req.user) {
    return next();
  }

  try {
    const { pool } = require('../database/connection');
    const client = await pool.connect();
    try {
      const userId = sanitizeUUID(req.user.id);
      if (userId) {
        await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
      }
    } finally {
      client.release();
    }
  } catch (error) {
    // Non-critical — don't block the request
    logger.warn('[setAuditUser] Failed:', { error: error.message });
  }

  next();
}

module.exports = {
  setDatabaseUser,
  setAuditUser,
};
