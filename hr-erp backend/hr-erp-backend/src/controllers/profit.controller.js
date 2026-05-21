const profitService = require('../services/profit.service');
const { logger } = require('../utils/logger');

/**
 * GET /api/v1/profit/by-accommodation?month=YYYY-MM
 *   &accommodation_id=<uuid>           (optional)
 *   &include_categories=true|false     (default: true)
 */
const byAccommodation = async (req, res) => {
  try {
    const includeCategoriesRaw = req.query.include_categories;
    const include_categories =
      includeCategoriesRaw === undefined ? true : includeCategoriesRaw !== 'false';

    const result = await profitService.getByAccommodation({
      month: req.query.month,
      accommodation_id: req.query.accommodation_id,
      include_categories,
    });

    if (result.error) {
      return res.status(result.status).json({ success: false, message: result.error });
    }

    res.json({ success: true, data: result.data });
  } catch (error) {
    logger.error('Profit lekérdezési hiba:', error);
    res.status(500).json({ success: false, message: 'Profit lekérdezési hiba' });
  }
};

module.exports = { byAccommodation };
