const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/aiAssistant.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Authenticated user routes — every active user can chat.
router.post('/chat',                  ctrl.chat);
router.get('/history',                ctrl.history);
router.post('/feedback/:messageId',   ctrl.feedback);

module.exports = router;
