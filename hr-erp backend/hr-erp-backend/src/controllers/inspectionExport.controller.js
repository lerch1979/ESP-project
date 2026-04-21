/**
 * Inspection Export Controller — streams xlsx workbooks for the 5 reports
 * introduced in Part D. Keeps the original export.controller.js untouched.
 */
const svc = require('../services/excel.service');
const { logger } = require('../utils/logger');

function parseFilters(q) {
  return {
    from:             q.from || null,
    to:               q.to || null,
    accommodationId:  q.accommodation_id || q.accommodationId || null,
    inspectorId:      q.inspector_id     || q.inspectorId     || null,
    assigneeId:       q.assignee_id      || q.assigneeId      || null,
    status:           q.status           || null,
    type:             q.type             || null,
    priority:         q.priority         || null,
  };
}

async function stream(res, type, filters, baseName) {
  try {
    const buffer = await svc.exportWorkbook(type, filters);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}-${today}.xlsx"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    if (err.message?.startsWith('UNKNOWN_EXPORT_TYPE')) {
      return res.status(400).json({ success: false, message: 'Ismeretlen export típus' });
    }
    logger.error(`[inspectionExport.${type}]`, err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Export generálási hiba' });
    }
  }
}

module.exports = {
  inspections:          (req, res) => stream(res, 'inspections',           parseFilters(req.query), 'ellenorzesek'),
  propertyPerformance:  (req, res) => stream(res, 'property-performance',  parseFilters(req.query), 'szallashely-teljesitmeny'),
  compensations:        (req, res) => stream(res, 'compensations',         parseFilters(req.query), 'karteritesek-birsagok'),
  inspectorPerformance: (req, res) => stream(res, 'inspector-performance', parseFilters(req.query), 'ellenor-teljesitmeny'),
  maintenanceTasks:     (req, res) => stream(res, 'maintenance-tasks',     parseFilters(req.query), 'karbantartasi-feladatok'),
};
