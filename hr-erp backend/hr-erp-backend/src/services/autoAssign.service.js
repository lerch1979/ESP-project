const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');

class AutoAssignService {

  /**
   * Auto-assign a ticket to appropriate user
   * Called after ticket creation when no assignee specified
   */
  async assignTicket(ticketId) {
    try {
      const ticket = await this.getTicket(ticketId);

      if (!ticket) {
        logger.warn(`Auto-assign: Ticket ${ticketId} not found`);
        return null;
      }

      if (ticket.assigned_to) {
        logger.info(`Ticket ${ticketId} already assigned, skipping auto-assign`);
        return ticket;
      }

      // Find matching rule
      const rule = await this.findMatchingRule('ticket', ticket);

      if (!rule) {
        logger.info(`No assignment rule matched for ticket ${ticketId}, using default`);
        return await this.assignToDefault(ticketId, 'ticket', ticket.contractor_id);
      }

      // If rule targets a specific user, assign directly
      if (rule.assign_to_user_id) {
        return await this.performAssignment(ticketId, 'ticket', rule.assign_to_user_id, rule.name);
      }

      // Get candidate users
      const candidates = await this.getCandidateUsers(rule, ticket.contractor_id);

      if (candidates.length === 0) {
        logger.warn(`No candidates found for ticket ${ticketId} with rule: ${rule.name}`);
        return await this.assignToDefault(ticketId, 'ticket', ticket.contractor_id);
      }

      // Apply assignment strategy
      const assignedUser = await this.applyStrategy(
        rule.assign_strategy,
        candidates,
        ticket
      );

      return await this.performAssignment(ticketId, 'ticket', assignedUser.id, rule.name);

    } catch (error) {
      logger.error('Auto-assign ticket error:', error);
      // Don't throw - auto-assign failure shouldn't block ticket creation
      return null;
    }
  }

  /**
   * Auto-assign a task to appropriate user
   * Called after task creation when no assignee specified
   */
  async assignTask(taskId) {
    try {
      const task = await this.getTask(taskId);

      if (!task) {
        logger.warn(`Auto-assign: Task ${taskId} not found`);
        return null;
      }

      if (task.assigned_to) {
        logger.info(`Task ${taskId} already assigned, skipping auto-assign`);
        return task;
      }

      // Find matching rule
      const rule = await this.findMatchingRule('task', task);

      if (!rule) {
        logger.info(`No assignment rule matched for task ${taskId}, using default`);
        return await this.assignToDefault(taskId, 'task', task.contractor_id);
      }

      // If rule targets a specific user, assign directly
      if (rule.assign_to_user_id) {
        return await this.performAssignment(taskId, 'task', rule.assign_to_user_id, rule.name);
      }

      // Get candidate users
      const candidates = await this.getCandidateUsers(rule, task.contractor_id);

      if (candidates.length === 0) {
        logger.warn(`No candidates found for task ${taskId} with rule: ${rule.name}`);
        return await this.assignToDefault(taskId, 'task', task.contractor_id);
      }

      // Apply assignment strategy
      const assignedUser = await this.applyStrategy(
        rule.assign_strategy,
        candidates,
        task
      );

      return await this.performAssignment(taskId, 'task', assignedUser.id, rule.name);

    } catch (error) {
      logger.error('Auto-assign task error:', error);
      return null;
    }
  }

  /**
   * Perform the actual assignment update
   */
  async performAssignment(itemId, type, userId, ruleName) {
    const table = type === 'ticket' ? 'tickets' : 'tasks';

    const result = await query(
      `UPDATE ${table} SET assigned_to = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [userId, itemId]
    );

    const userName = await query(
      "SELECT first_name || ' ' || last_name as name FROM users WHERE id = $1",
      [userId]
    );

    logger.info(`Auto-assign: ${type} ${itemId} assigned to ${userName.rows[0]?.name || userId} via rule: ${ruleName}`);

    // Add history entry for tickets
    if (type === 'ticket') {
      await query(
        `INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
         VALUES ($1, $2, 'auto_assigned', $3)`,
        [itemId, userId, `Automatikusan kiosztva (${ruleName})`]
      ).catch(err => logger.error('Failed to log ticket auto-assign history:', err));
    }

    return result.rows[0];
  }

  /**
   * Find the highest-priority matching assignment rule
   */
  async findMatchingRule(type, item) {
    const result = await query(`
      SELECT * FROM assignment_rules
      WHERE type = $1
        AND is_active = TRUE
        AND (contractor_id IS NULL OR contractor_id = $2)
      ORDER BY priority DESC, created_at ASC
    `, [type, item.contractor_id]);

    for (const rule of result.rows) {
      if (this.matchesConditions(item, rule.conditions)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Check if item matches rule conditions
   * Supports exact match, array-of-values match, and nested property lookup
   */
  matchesConditions(item, conditions) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return false; // Empty conditions never match (safety)
    }

    for (const [key, value] of Object.entries(conditions)) {
      const itemValue = item[key];

      if (Array.isArray(value)) {
        // Condition value is array: item value must be one of them
        if (!value.includes(itemValue)) return false;
      } else {
        // Exact match
        if (itemValue !== value) return false;
      }
    }

    return true;
  }

  /**
   * Get candidate users based on rule criteria
   */
  async getCandidateUsers(rule, contractorId) {
    let whereConditions = ['u.is_active = TRUE'];
    let params = [];
    let paramIndex = 1;

    // Filter by contractor
    if (contractorId) {
      whereConditions.push(`u.contractor_id = $${paramIndex}`);
      params.push(contractorId);
      paramIndex++;
    }

    // Filter by role if specified
    if (rule.assign_to_role) {
      whereConditions.push(`
        EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = u.id AND r.slug = $${paramIndex}
        )
      `);
      params.push(rule.assign_to_role);
      paramIndex++;
    }

    const result = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email
       FROM users u
       WHERE ${whereConditions.join(' AND ')}`,
      params
    );

    return result.rows;
  }

  /**
   * Apply the chosen assignment strategy
   */
  async applyStrategy(strategy, candidates, item) {
    switch (strategy) {
      case 'least_busy':
        return await this.leastBusy(candidates);

      case 'round_robin':
        return await this.roundRobin(candidates);

      case 'skill_match':
        return await this.skillMatch(candidates, item);

      case 'random':
        return candidates[Math.floor(Math.random() * candidates.length)];

      default:
        return candidates[0];
    }
  }

  /**
   * Least busy strategy: assign to user with fewest pending items
   */
  async leastBusy(candidates) {
    const candidateIds = candidates.map(c => c.id);

    const result = await query(`
      SELECT user_id, total_pending_items, last_assignment_at
      FROM user_workload
      WHERE user_id = ANY($1)
      ORDER BY total_pending_items ASC, last_assignment_at ASC NULLS FIRST
      LIMIT 1
    `, [candidateIds]);

    if (result.rows.length === 0) {
      // No workload data yet - return first candidate
      return candidates[0];
    }

    return candidates.find(c => c.id === result.rows[0].user_id) || candidates[0];
  }

  /**
   * Round robin strategy: assign to user who was assigned least recently
   */
  async roundRobin(candidates) {
    const candidateIds = candidates.map(c => c.id);

    const result = await query(`
      SELECT user_id, last_assignment_at
      FROM user_workload
      WHERE user_id = ANY($1)
      ORDER BY last_assignment_at ASC NULLS FIRST
      LIMIT 1
    `, [candidateIds]);

    if (result.rows.length === 0) {
      return candidates[0];
    }

    return candidates.find(c => c.id === result.rows[0].user_id) || candidates[0];
  }

  /**
   * Skill match strategy: assign to most proficient user for required skill
   */
  async skillMatch(candidates, item) {
    const requiredSkill = item.skill_required || item.category_slug || item.category;

    if (!requiredSkill) {
      // No skill to match, fall back to least_busy
      return await this.leastBusy(candidates);
    }

    const candidateIds = candidates.map(c => c.id);

    const result = await query(`
      SELECT us.user_id, us.proficiency
      FROM user_skills us
      WHERE us.user_id = ANY($1)
        AND us.skill ILIKE $2
      ORDER BY us.proficiency DESC
      LIMIT 1
    `, [candidateIds, `%${requiredSkill}%`]);

    if (result.rows.length === 0) {
      // No skill match found, fall back to least_busy
      return await this.leastBusy(candidates);
    }

    return candidates.find(c => c.id === result.rows[0].user_id) || candidates[0];
  }

  /**
   * Fallback: assign to first admin/superadmin in the contractor
   */
  async assignToDefault(itemId, type, contractorId) {
    const admin = await query(`
      SELECT u.id, u.first_name, u.last_name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.slug IN ('admin', 'superadmin')
        AND u.is_active = TRUE
        AND ($1::uuid IS NULL OR u.contractor_id = $1)
      ORDER BY
        CASE r.slug WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 END
      LIMIT 1
    `, [contractorId]);

    if (admin.rows.length === 0) {
      logger.warn(`No admin found for default assignment of ${type} ${itemId}`);
      return null;
    }

    return await this.performAssignment(itemId, type, admin.rows[0].id, 'Alapértelmezett (admin)');
  }

  /**
   * Get ticket with resolved slugs for condition matching
   */
  async getTicket(id) {
    const result = await query(`
      SELECT t.*,
        ts.slug as status_slug,
        tc.slug as category_slug,
        p.slug as priority_slug
      FROM tickets t
      LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
      LEFT JOIN ticket_categories tc ON t.category_id = tc.id
      LEFT JOIN priorities p ON t.priority_id = p.id
      WHERE t.id = $1
    `, [id]);
    return result.rows[0] || null;
  }

  /**
   * Get task for condition matching
   */
  async getTask(id) {
    const result = await query(`
      SELECT t.*,
        p.name as project_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new AutoAssignService();
