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

/**
 * Middleware that sets PostgreSQL session variables for the authenticated user.
 * These are used by RLS policies and audit triggers.
 */
async function setDatabaseUser(req, res, next) {
  if (!req.user) {
    return next();
  }

  let client;
  try {
    client = await pool.connect();

    // Set session variables for RLS and audit
    await client.query(`SET LOCAL app.current_user_id = '${req.user.id}'`);

    if (req.user.contractorId) {
      await client.query(`SET LOCAL app.current_contractor_id = '${req.user.contractorId}'`);
    }

    if (req.user.roles && req.user.roles.length > 0) {
      // Use highest-privilege role
      const role = req.user.roles.includes('superadmin') ? 'superadmin'
        : req.user.roles.includes('data_controller') ? 'data_controller'
        : req.user.roles.includes('admin') ? 'admin'
        : req.user.roles[0];
      await client.query(`SET LOCAL app.current_role = '${role}'`);
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
    // Set session variable that audit_trigger_func() reads
    const { pool } = require('../database/connection');
    const client = await pool.connect();
    try {
      await client.query(`SET LOCAL app.current_user_id = '${req.user.id}'`);
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
