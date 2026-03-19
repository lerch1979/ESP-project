const damageService = require('../services/damageReport.service');
const pdfService = require('../services/damageReportPdf.service');
const { logger } = require('../utils/logger');

// ─── Create ─────────────────────────────────────────────────────────

const createFromTicket = async (req, res) => {
  try {
    const { ticket_id } = req.body;
    if (!ticket_id) return res.status(400).json({ success: false, message: 'ticket_id kötelező' });

    const report = await damageService.createFromTicket(ticket_id, req.user.id, req.user.contractorId);
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    logger.error('Error creating damage report from ticket:', error);
    res.status(500).json({ success: false, message: error.message || 'Hiba történt' });
  }
};

const createManual = async (req, res) => {
  try {
    const { employee_id, incident_date, description } = req.body;
    if (!employee_id || !incident_date || !description) {
      return res.status(400).json({ success: false, message: 'employee_id, incident_date, description kötelező' });
    }

    const data = { ...req.body, contractor_id: req.user.contractorId };
    const report = await damageService.createManual(data, req.user.id);
    res.status(201).json({ success: true, data: report });
  } catch (error) {
    logger.error('Error creating manual damage report:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Read ───────────────────────────────────────────────────────────

const listReports = async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      employee_id: req.query.employee_id,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      search: req.query.search,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
    };
    const reports = await damageService.listReports(req.user.contractorId, filters);
    res.json({ success: true, data: reports });
  } catch (error) {
    logger.error('Error listing damage reports:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const getReport = async (req, res) => {
  try {
    const report = await damageService.getById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Jegyzőkönyv nem található' });
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Error getting damage report:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Update ─────────────────────────────────────────────────────────

const updateReport = async (req, res) => {
  try {
    const report = await damageService.updateReport(req.params.id, req.body);
    if (!report) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Error updating damage report:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const deleteReport = async (req, res) => {
  try {
    const deleted = await damageService.deleteReport(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Nem található' });
    res.json({ success: true, message: 'Jegyzőkönyv törölve' });
  } catch (error) {
    logger.error('Error deleting damage report:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Damage Items ───────────────────────────────────────────────────

const addDamageItem = async (req, res) => {
  try {
    const { name, cost } = req.body;
    if (!name || cost === undefined) return res.status(400).json({ success: false, message: 'name, cost kötelező' });

    const result = await damageService.addDamageItem(req.params.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    logger.error('Error adding damage item:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const removeDamageItem = async (req, res) => {
  try {
    const result = await damageService.removeDamageItem(req.params.id, req.params.itemId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error removing damage item:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── PDF Export ──────────────────────────────────────────────────────

const downloadPDF = async (req, res) => {
  try {
    const report = await damageService.getById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Nem található' });

    const pdfBuffer = await pdfService.generatePDF(report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${report.report_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error generating PDF:', error);
    res.status(500).json({ success: false, message: 'PDF generálási hiba' });
  }
};

// ─── Acknowledge ────────────────────────────────────────────────────

const acknowledgeReport = async (req, res) => {
  try {
    const { signature_data } = req.body;
    if (!signature_data) return res.status(400).json({ success: false, message: 'Aláírás szükséges' });

    const report = await damageService.acknowledgeReport(req.params.id, signature_data);
    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Error acknowledging damage report:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Payment Status ─────────────────────────────────────────────────

const getPaymentStatus = async (req, res) => {
  try {
    const status = await damageService.getPaymentStatus(req.params.id);
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Error getting payment status:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// ─── Payment Plan Calculator ────────────────────────────────────────

const calculatePaymentPlan = async (req, res) => {
  try {
    const { total_cost, monthly_salary, fault_percentage } = req.body;
    if (!total_cost || !monthly_salary) {
      return res.status(400).json({ success: false, message: 'total_cost, monthly_salary kötelező' });
    }
    const plan = damageService.calculatePaymentPlan(
      parseFloat(total_cost), parseFloat(monthly_salary), parseInt(fault_percentage) || 100
    );
    res.json({ success: true, data: { plan, totalMonths: plan.length } });
  } catch (error) {
    logger.error('Error calculating payment plan:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  createFromTicket, createManual, listReports, getReport,
  updateReport, deleteReport, addDamageItem, removeDamageItem,
  downloadPDF, acknowledgeReport, getPaymentStatus, calculatePaymentPlan,
};
