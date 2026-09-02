const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inspection.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Room inspection history — lives here (not on /inspections) because the
// query is keyed by room, not by any single inspection.
//
// DEEP_AUDIT finding 11: this was `authenticateToken`-only with `WHERE room_id=$1`,
// so any logged-in account (a resident, and later any limited external user) could
// read any accommodation's inspection history by guessing/knowing a room UUID.
// `accommodations.view` matches what reading a property's data requires elsewhere;
// the controller additionally scopes to the owning contractor.
router.get('/:id/inspection-history', checkPermission('accommodations.view'), ctrl.roomHistory);

module.exports = router;
