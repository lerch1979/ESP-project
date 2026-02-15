/**
 * Shared filter builder utility
 * Extracted from report.controller.js — used by reports + list controllers
 */

function buildFilterClause(filter, paramIndex) {
  const { field, value } = filter;
  if (!field || value === undefined || value === null || value === '') return null;

  // Special: visa_expiry presets
  if (field === 'visa_expiry') {
    const now = new Date();
    if (value === 'expired') {
      return { sql: `e.visa_expiry < $${paramIndex}`, params: [now.toISOString().slice(0, 10)] };
    }
    if (value === '30days') {
      const d = new Date(now); d.setDate(d.getDate() + 30);
      return { sql: `e.visa_expiry <= $${paramIndex} AND e.visa_expiry >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === '60days') {
      const d = new Date(now); d.setDate(d.getDate() + 60);
      return { sql: `e.visa_expiry <= $${paramIndex} AND e.visa_expiry >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === 'valid') {
      return { sql: `e.visa_expiry > $${paramIndex}`, params: [now.toISOString().slice(0, 10)] };
    }
    return null;
  }

  // Special: contract_end presets
  if (field === 'contract_end') {
    const now = new Date();
    if (value === 'expired') {
      return { sql: `e.end_date < $${paramIndex}`, params: [now.toISOString().slice(0, 10)] };
    }
    if (value === '30days') {
      const d = new Date(now); d.setDate(d.getDate() + 30);
      return { sql: `e.end_date <= $${paramIndex} AND e.end_date >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === '60days') {
      const d = new Date(now); d.setDate(d.getDate() + 60);
      return { sql: `e.end_date <= $${paramIndex} AND e.end_date >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    if (value === '90days') {
      const d = new Date(now); d.setDate(d.getDate() + 90);
      return { sql: `e.end_date <= $${paramIndex} AND e.end_date >= $${paramIndex + 1}`, params: [d.toISOString().slice(0, 10), now.toISOString().slice(0, 10)] };
    }
    return null;
  }

  // Special: birth_year range
  if (field === 'birth_year') {
    if (value === 'under_25') {
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 25);
      return { sql: `e.birth_date > $${paramIndex}`, params: [cutoff.toISOString().slice(0, 10)] };
    }
    if (value === '25_35') {
      const from = new Date(); from.setFullYear(from.getFullYear() - 35);
      const to = new Date(); to.setFullYear(to.getFullYear() - 25);
      return { sql: `e.birth_date >= $${paramIndex} AND e.birth_date <= $${paramIndex + 1}`, params: [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)] };
    }
    if (value === '35_50') {
      const from = new Date(); from.setFullYear(from.getFullYear() - 50);
      const to = new Date(); to.setFullYear(to.getFullYear() - 35);
      return { sql: `e.birth_date >= $${paramIndex} AND e.birth_date <= $${paramIndex + 1}`, params: [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)] };
    }
    if (value === 'over_50') {
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 50);
      return { sql: `e.birth_date < $${paramIndex}`, params: [cutoff.toISOString().slice(0, 10)] };
    }
    return null;
  }

  // Special: date_range presets (for tickets / contractors)
  if (field === 'date_range') {
    return buildDateRangeClause(value, paramIndex);
  }

  return null; // handled by fieldMap below
}

function buildDateRangeClause(value, paramIndex) {
  const now = new Date();
  let from, to;
  if (value === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (value === 'last_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (value === '3months') {
    from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (value === '6months') {
    from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (value === 'this_year') {
    from = new Date(now.getFullYear(), 0, 1);
    to = new Date(now.getFullYear(), 11, 31);
  } else {
    return null;
  }
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    paramIndex,
  };
}

/**
 * Build WHERE clause from filters array + fieldMap
 * fieldMap: { fieldKey: 'sql_column' } — for standard equality
 * Special fields (visa_expiry, contract_end, birth_year, date_range) handled via buildFilterClause
 */
function buildFilterWhere(filters, fieldMap, opts = {}) {
  const parts = [];
  const params = [];
  let paramIdx = opts.startParamIndex || 1;
  let dateRangeInfo = null;

  if (!Array.isArray(filters)) return { sql: '', params: [], dateRangeInfo: null, nextParamIndex: paramIdx };

  for (const filter of filters) {
    const { field, value } = filter;
    if (!field || value === undefined || value === null || value === '') continue;

    // Check special fields first
    if (['visa_expiry', 'contract_end', 'birth_year'].includes(field)) {
      const clause = buildFilterClause(filter, paramIdx);
      if (clause) {
        parts.push(`(${clause.sql})`);
        params.push(...clause.params);
        paramIdx += clause.params.length;
      }
      continue;
    }

    // date_range — extract info, let caller decide where to apply
    if (field === 'date_range') {
      const dr = buildDateRangeClause(value, paramIdx);
      if (dr) {
        dateRangeInfo = dr;
        // Don't add to parts here — caller applies it
      }
      continue;
    }

    // Standard equality from fieldMap
    const column = fieldMap[field];
    if (column) {
      parts.push(`${column} = $${paramIdx}`);
      params.push(value);
      paramIdx += 1;
    }
  }

  return {
    sql: parts.length > 0 ? ' AND ' + parts.join(' AND ') : '',
    params,
    dateRangeInfo,
    nextParamIndex: paramIdx,
  };
}

/**
 * Safely parse a ?filters= JSON query param. Returns [] on failure.
 */
function parseFiltersParam(jsonString) {
  if (!jsonString) return [];
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  buildFilterClause,
  buildDateRangeClause,
  buildFilterWhere,
  parseFiltersParam,
};
