const { query } = require('../database/connection');
const { logger } = require('./logger');

/**
 * Log an activity to the activity_logs table
 */
async function logActivity({ userId, entityType, entityId, action, changes, metadata, ipAddress }) {
  try {
    await query(
      `INSERT INTO activity_logs (user_id, entity_type, entity_id, action, changes, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId || null,
        entityType,
        entityId,
        action,
        changes ? JSON.stringify(changes) : null,
        metadata ? JSON.stringify(metadata) : null,
        ipAddress || null,
      ]
    );
  } catch (error) {
    logger.error('Activity log insert error:', error);
  }
}

/**
 * Compare two objects on specified fields, return { field: { old, new } } for changed fields only.
 */
function diffObjects(oldObj, newObj, fields) {
  const changes = {};
  for (const field of fields) {
    const oldVal = oldObj[field] !== undefined ? oldObj[field] : null;
    const newVal = newObj[field] !== undefined ? newObj[field] : null;
    // Skip if both null/undefined
    if (oldVal === null && newVal === null) continue;
    if (oldVal === undefined && newVal === undefined) continue;
    // Normalize for comparison
    const oldStr = oldVal === null || oldVal === undefined ? null : String(oldVal);
    const newStr = newVal === null || newVal === undefined ? null : String(newVal);
    if (oldStr !== newStr) {
      changes[field] = { old: oldVal, new: newVal };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

module.exports = { logActivity, diffObjects };
