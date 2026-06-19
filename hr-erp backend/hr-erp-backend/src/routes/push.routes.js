const express = require('express');
const router = express.Router();
const pushTokens = require('../controllers/pushTokens.controller');
const { authenticateToken } = require('../middleware/auth');

// Device push-token registration — auth-only, self-scoped (uses req.user.id).
// Mounted at ${API_PREFIX}/push.
router.post('/tokens', authenticateToken, pushTokens.registerToken);
router.delete('/tokens', authenticateToken, pushTokens.deleteToken);

module.exports = router;
