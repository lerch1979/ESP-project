const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

class SlaService {

  /**
   * Find matching SLA policy for a ticket.
   * Contractor-specific policies take priority over global ones.
   */
  async findMatchingPolicy(contractorId, categoryId) {
    const result = await query(`
      SELECT * FROM sla_policies
      WHERE is_active = TRUE
        AND (contractor_id IS NULL OR contractor_id = $1)
        AND (apply_to_categories IS NULL OR $2::uuid = ANY(apply_to_categories))
      ORDER BY
        CASE WHEN contractor_id IS NOT NULL THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1
    `, [contractorId, categoryId]);

    return result.rows[0] || null;
  }

  /**
   * Calculate response and resolution deadlines from policy rules.
   */
  calculateDeadlines(policy, prioritySlug, createdAt) {
    const rules = policy.rules || {};
    const priorityRules = rules[prioritySlug] || rules['normal'] || {};

    const responseHours = priorityRules.response_hours;
    const resolutionHours = priorityRules.resolution_hours;

    if (responseHours == null && resolutionHours == null) {
      return null;
    }

    const start = new Date(createdAt);
    let responseDeadline = null;
    let resolutionDeadline = null;

    if (responseHours != null) {
      responseDeadline = policy.business_hours_only
        ? this.addBusinessHours(start, responseHours, policy.business_hours_start, policy.business_hours_end)
        : new Date(start.getTime() + responseHours * 3600000);
    }

    if (resolutionHours != null) {
      resolutionDeadline = policy.business_hours_only
        ? this.addBusinessHours(start, resolutionHours, policy.business_hours_start, policy.business_hours_end)
        : new Date(start.getTime() + resolutionHours * 3600000);
    }

    return { responseDeadline, resolutionDeadline };
  }

  /**
   * Add business hours to a start date.
   * Iterates day-by-day through business windows.
   * All days are treated as business days (no weekend skipping in v1).
   */
  addBusinessHours(startDate, hours, businessStart, businessEnd) {
    const bStart = this.parseTime(businessStart || '08:00');
    const bEnd = this.parseTime(businessEnd || '17:00');
    const businessDayMinutes = (bEnd.h * 60 + bEnd.m) - (bStart.h * 60 + bStart.m);

    if (businessDayMinutes <= 0) {
      // Fallback: treat as calendar hours
      return new Date(startDate.getTime() + hours * 3600000);
    }

    let remainingMinutes = hours * 60;
    let current = new Date(startDate);

    // If current time is before business start, advance to business start
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    const bStartMinutes = bStart.h * 60 + bStart.m;
    const bEndMinutes = bEnd.h * 60 + bEnd.m;

    if (currentMinutes < bStartMinutes) {
      current.setHours(bStart.h, bStart.m, 0, 0);
    } else if (currentMinutes >= bEndMinutes) {
      // After business hours, advance to next day's start
      current.setDate(current.getDate() + 1);
      current.setHours(bStart.h, bStart.m, 0, 0);
    }

    while (remainingMinutes > 0) {
      const curMinutes = current.getHours() * 60 + current.getMinutes();
      const minutesLeftToday = bEndMinutes - curMinutes;

      if (minutesLeftToday <= 0) {
        // Advance to next business day start
        current.setDate(current.getDate() + 1);
        current.setHours(bStart.h, bStart.m, 0, 0);
        continue;
      }

      if (remainingMinutes <= minutesLeftToday) {
        current = new Date(current.getTime() + remainingMinutes * 60000);
        remainingMinutes = 0;
      } else {
        remainingMinutes -= minutesLeftToday;
        // Advance to next business day start
        current.setDate(current.getDate() + 1);
        current.setHours(bStart.h, bStart.m, 0, 0);
      }
    }

    return current;
  }

  /**
   * Parse a time string like "08:00" into { h, m }
   */
  parseTime(timeStr) {
    if (!timeStr) return { h: 8, m: 0 };
    const parts = String(timeStr).split(':');
    return {
      h: parseInt(parts[0], 10) || 0,
      m: parseInt(parts[1], 10) || 0,
    };
  }

  /**
   * Main entry point: find matching policy, calculate deadlines, update ticket.
   * Wrapped in try/catch so failures never block ticket creation.
   */
  async applyToTicket(ticketId, { contractorId, categoryId, prioritySlug, createdAt }) {
    try {
      const policy = await this.findMatchingPolicy(contractorId, categoryId);

      if (!policy) {
        logger.info(`SLA: No matching policy for ticket ${ticketId}`);
        return null;
      }

      const slug = prioritySlug || 'normal';
      const deadlines = this.calculateDeadlines(policy, slug, createdAt);

      if (!deadlines) {
        logger.info(`SLA: No deadline rules for priority "${slug}" in policy "${policy.name}"`);
        return null;
      }

      const result = await query(
        `UPDATE tickets
         SET sla_policy_id = $1,
             sla_response_deadline = $2,
             sla_resolution_deadline = $3
         WHERE id = $4
         RETURNING sla_policy_id, sla_response_deadline, sla_resolution_deadline`,
        [policy.id, deadlines.responseDeadline, deadlines.resolutionDeadline, ticketId]
      );

      logger.info(`SLA: Applied policy "${policy.name}" to ticket ${ticketId}`, {
        responseDeadline: deadlines.responseDeadline,
        resolutionDeadline: deadlines.resolutionDeadline,
      });

      return {
        sla_policy_id: policy.id,
        sla_policy_name: policy.name,
        sla_response_deadline: deadlines.responseDeadline,
        sla_resolution_deadline: deadlines.resolutionDeadline,
      };

    } catch (error) {
      logger.error('SLA: Failed to apply policy to ticket:', error);
      return null;
    }
  }
}

module.exports = new SlaService();
