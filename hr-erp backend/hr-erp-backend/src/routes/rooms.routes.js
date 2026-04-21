const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inspection.controller');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Room inspection history — lives here (not on /inspections) because the
// query is keyed by room, not by any single inspection.
router.get('/:id/inspection-history', ctrl.roomHistory);

module.exports = router;
