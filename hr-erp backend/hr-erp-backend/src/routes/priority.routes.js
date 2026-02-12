const express = require('express');
const router = express.Router();
const priorityController = require('../controllers/priority.controller');
const { authenticateToken } = require('../middleware/auth');

// Összes prioritás lekérése
router.get('/', authenticateToken, priorityController.getPriorities);

module.exports = router;
