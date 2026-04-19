const express = require('express');
const router = express.Router();
const translation = require('../services/translation.service');
const { authenticateToken } = require('../middleware/auth');

const SUPPORTED_LANGS = ['hu', 'en', 'tl', 'uk', 'de'];
const MAX_TEXT_LEN = 5000;

router.use(authenticateToken);

// GET /api/v1/translation/stats — translation usage (last N days)
router.get('/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await translation.getStats(days);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
});

// POST /api/v1/translation/test — translate a test string (kept for back-compat)
// POST /api/v1/translate — same payload, cleaner path
const translateHandler = async (req, res) => {
  try {
    const { text, from, fromLang, to, toLang } = req.body;
    const src = fromLang || from || 'hu';
    const dst = toLang || to;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, message: 'text kötelező' });
    }
    if (text.length > MAX_TEXT_LEN) {
      return res.status(400).json({ success: false, message: `text túl hosszú (max ${MAX_TEXT_LEN} karakter)` });
    }
    if (!dst) {
      return res.status(400).json({ success: false, message: 'toLang kötelező' });
    }
    if (!SUPPORTED_LANGS.includes(src) || !SUPPORTED_LANGS.includes(dst)) {
      return res.status(400).json({ success: false, message: `Támogatott nyelvek: ${SUPPORTED_LANGS.join(', ')}` });
    }

    const translated = await translation.translateText(text, src, dst);
    res.json({ success: true, data: { original: text, translated, from: src, to: dst } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

router.post('/test', translateHandler);

module.exports = router;
module.exports.translateHandler = translateHandler;
