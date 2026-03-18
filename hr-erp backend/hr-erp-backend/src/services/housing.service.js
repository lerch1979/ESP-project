const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

async function createInspection(data) {
  const result = await query(
    `INSERT INTO housing_cleanliness_inspections
      (user_id, contractor_id, inspection_date, room_cleanliness_score, common_area_score,
       bathroom_score, kitchen_score, inspector_id, inspector_notes, corrective_actions_taken,
       follow_up_required, follow_up_date, photo_urls)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [data.user_id, data.contractor_id, data.inspection_date || new Date(),
     data.room_cleanliness_score, data.common_area_score, data.bathroom_score,
     data.kitchen_score, data.inspector_id, data.inspector_notes,
     data.corrective_actions_taken, data.follow_up_required || false,
     data.follow_up_date, data.photo_urls || []]
  );
  return result.rows[0];
}

async function getInspectionsByUser(userId, days = 90) {
  const result = await query(
    `SELECT * FROM housing_cleanliness_inspections
     WHERE user_id = $1 AND inspection_date >= CURRENT_DATE - CAST($2 AS INTEGER)
     ORDER BY inspection_date DESC`,
    [userId, days]
  );
  return result.rows;
}

async function getInspectionsByContractor(contractorId, startDate, endDate) {
  const result = await query(
    `SELECT i.*, u.first_name, u.last_name, u.email
     FROM housing_cleanliness_inspections i
     JOIN users u ON i.user_id = u.id
     WHERE i.contractor_id = $1
       AND i.inspection_date BETWEEN COALESCE($2, CURRENT_DATE - 90) AND COALESCE($3, CURRENT_DATE)
     ORDER BY i.inspection_date DESC`,
    [contractorId, startDate || null, endDate || null]
  );
  return result.rows;
}

async function updateInspection(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (['room_cleanliness_score', 'common_area_score', 'bathroom_score', 'kitchen_score',
         'inspector_notes', 'corrective_actions_taken', 'follow_up_required', 'follow_up_date',
         'photo_urls'].includes(key)) {
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }
  if (fields.length === 0) return null;

  values.push(id);
  const result = await query(
    `UPDATE housing_cleanliness_inspections SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0];
}

async function getCorrelationAnalytics(contractorId) {
  const result = await query(
    `SELECT * FROM v_housing_wellbeing_correlation WHERE contractor_id = $1`,
    [contractorId]
  );
  return result.rows;
}

async function getFollowUpRequired(contractorId) {
  const result = await query(
    `SELECT i.*, u.first_name, u.last_name
     FROM housing_cleanliness_inspections i
     JOIN users u ON i.user_id = u.id
     WHERE i.contractor_id = $1 AND i.follow_up_required = TRUE AND i.follow_up_completed = FALSE
     ORDER BY i.follow_up_date ASC NULLS LAST, i.inspection_date DESC`,
    [contractorId]
  );
  return result.rows;
}

async function completeFollowUp(id, notes) {
  const result = await query(
    `UPDATE housing_cleanliness_inspections
     SET follow_up_completed = TRUE, follow_up_notes = $2
     WHERE id = $1 RETURNING *`,
    [id, notes]
  );
  return result.rows[0];
}

module.exports = {
  createInspection, getInspectionsByUser, getInspectionsByContractor,
  updateInspection, getCorrelationAnalytics, getFollowUpRequired, completeFollowUp,
};
