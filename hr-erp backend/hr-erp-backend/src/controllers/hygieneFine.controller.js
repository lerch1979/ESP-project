/**
 * Room-hygiene house-rule fine — HTTP layer (config toggle + manual run).
 * Independent of the deduction executor. Creates fines only (no deduction).
 */
const { logger } = require('../utils/logger');
const svc = require('../services/hygieneFine.service');

// GET /hygiene-fine/config
const getConfig = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getConfig() });
  } catch (error) {
    logger.error('Hygiene-fine getConfig error:', error);
    res.status(500).json({ success: false, message: 'Konfiguráció lekérési hiba' });
  }
};

// PUT /hygiene-fine/config — { enabled, consecutive_fails, fail_hygiene_max, fine_amount, fine_type_code }
const updateConfig = async (req, res) => {
  try {
    const { enabled, consecutive_fails, fail_hygiene_max, fine_amount, fine_type_code } = req.body || {};
    if (consecutive_fails != null && (!Number.isInteger(Number(consecutive_fails)) || Number(consecutive_fails) < 1)) {
      return res.status(400).json({ success: false, message: 'Az egymást követő bukások száma legalább 1 kell legyen.' });
    }
    if (fine_amount != null && Number(fine_amount) < 0) {
      return res.status(400).json({ success: false, message: 'A bírság összege nem lehet negatív.' });
    }
    const data = await svc.updateConfig(
      { enabled, consecutive_fails, fail_hygiene_max, fine_amount, fine_type_code }, req.user?.id || null);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Hygiene-fine updateConfig error:', error);
    res.status(500).json({ success: false, message: 'Konfiguráció mentési hiba' });
  }
};

// POST /hygiene-fine/run — run the scan now (respects the enabled toggle).
const runNow = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.runHygieneFines({ userId: req.user?.id || null }) });
  } catch (error) {
    logger.error('Hygiene-fine runNow error:', error);
    res.status(500).json({ success: false, message: 'Házirend-bírság futtatási hiba' });
  }
};

module.exports = { getConfig, updateConfig, runNow };
