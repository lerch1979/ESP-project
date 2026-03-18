const housingService = require('../services/housing.service');
const { logger } = require('../utils/logger');

const createInspection = async (req, res) => {
  try {
    const { user_id, inspection_date, room_cleanliness_score, common_area_score,
            bathroom_score, kitchen_score, inspector_notes, corrective_actions_taken,
            follow_up_required, follow_up_date, photo_urls } = req.body;

    if (!user_id || !room_cleanliness_score || !common_area_score || !bathroom_score || !kitchen_score) {
      return res.status(400).json({ success: false, message: 'Minden pontszám kötelező.' });
    }

    const data = {
      user_id,
      contractor_id: req.user.contractorId,
      inspection_date,
      room_cleanliness_score, common_area_score, bathroom_score, kitchen_score,
      inspector_id: req.user.id,
      inspector_notes, corrective_actions_taken,
      follow_up_required, follow_up_date, photo_urls,
    };
    const inspection = await housingService.createInspection(data);
    res.status(201).json({ success: true, data: inspection });
  } catch (error) {
    logger.error('Error creating inspection:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const getMyInspections = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 90, 365);
    const inspections = await housingService.getInspectionsByUser(req.user.id, days);
    res.json({ success: true, data: inspections });
  } catch (error) {
    logger.error('Error fetching inspections:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const getUserInspections = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 90, 365);
    const inspections = await housingService.getInspectionsByUser(req.params.userId, days);
    res.json({ success: true, data: inspections });
  } catch (error) {
    logger.error('Error fetching user inspections:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const getAllInspections = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const contractorId = req.query.contractorId || req.user.contractorId;
    const inspections = await housingService.getInspectionsByContractor(contractorId, startDate, endDate);
    res.json({ success: true, data: inspections });
  } catch (error) {
    logger.error('Error fetching all inspections:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const updateInspection = async (req, res) => {
  try {
    const inspection = await housingService.updateInspection(req.params.id, req.body);
    if (!inspection) return res.status(404).json({ success: false, message: 'Nem található.' });
    res.json({ success: true, data: inspection });
  } catch (error) {
    logger.error('Error updating inspection:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const getCorrelation = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const data = await housingService.getCorrelationAnalytics(contractorId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching correlation:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const getFollowUps = async (req, res) => {
  try {
    const contractorId = req.query.contractorId || req.user.contractorId;
    const data = await housingService.getFollowUpRequired(contractorId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching follow-ups:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const completeFollowUp = async (req, res) => {
  try {
    const inspection = await housingService.completeFollowUp(req.params.id, req.body.notes);
    if (!inspection) return res.status(404).json({ success: false, message: 'Nem található.' });
    res.json({ success: true, data: inspection });
  } catch (error) {
    logger.error('Error completing follow-up:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

// Employee self-report (doesn't require admin)
const submitSelfReport = async (req, res) => {
  try {
    const { room_cleanliness_score, common_area_score, bathroom_score, kitchen_score, inspector_notes, photo_urls } = req.body;

    if (!room_cleanliness_score || !common_area_score || !bathroom_score || !kitchen_score) {
      return res.status(400).json({ success: false, message: 'Minden pontszám kötelező.' });
    }

    const data = {
      user_id: req.user.id,
      contractor_id: req.user.contractorId,
      room_cleanliness_score, common_area_score, bathroom_score, kitchen_score,
      inspector_id: req.user.id,
      inspector_notes,
      photo_urls: photo_urls || [],
    };
    const inspection = await housingService.createInspection(data);
    res.status(201).json({ success: true, data: inspection });
  } catch (error) {
    logger.error('Error submitting self-report:', error);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

module.exports = {
  createInspection, getMyInspections, getUserInspections, getAllInspections,
  updateInspection, getCorrelation, getFollowUps, completeFollowUp, submitSelfReport,
};
