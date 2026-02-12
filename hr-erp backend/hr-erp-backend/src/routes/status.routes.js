const express = require('express');
const router = express.Router();
const statusController = require('../controllers/status.controller');
const { authenticateToken } = require('../middleware/auth');

// Összes státusz lekérése
router.get('/', authenticateToken, statusController.getStatuses);

module.exports = router;
