const express = require('express');
const router = express.Router();
const autoTranslate = require('../services/autoTranslate.service');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// GET /api/v1/translation/stats — admin only
router.get('/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await autoTranslate.getStats(days);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

// POST /api/v1/translation/test — translate a test string
router.post('/test', async (req, res) => {
  try {
    const { text, from = 'hu', to = 'en' } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'text kötelező' });
    const translated = await autoTranslate.translateText(text, from, to);
    res.json({ success: true, data: { original: text, translated, from, to } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

module.exports = router;
