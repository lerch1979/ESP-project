const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getPreferences, updatePreferences } = require('../controllers/preferences.controller');

router.get('/', authenticateToken, getPreferences);
router.put('/', authenticateToken, updatePreferences);

module.exports = router;
