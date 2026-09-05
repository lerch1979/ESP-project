const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/gamification.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// Phase 0 Gate A #3. The reads here ARE tenant-scoped (getLeaderboard passes
// req.user.contractorId), so this was never a cross-tenant leak — but with no permission
// gate at all, every authenticated account reaches the staff leaderboard, including the
// resident, megbízó and alvállalkozó roles we are about to create. Gamification is a
// staff dashboard widget, so it answers to the staff dashboard permission.
const staffOnly = checkPermission('dashboard.view');

// Get my gamification stats (points, badges, streak)
router.get('/my-stats', staffOnly, ctrl.getMyStats);

// Get leaderboard (privacy-safe: minimum 5 actions)
router.get('/leaderboard', staffOnly, ctrl.getLeaderboard);

// Get all available badges
router.get('/badges/available', staffOnly, ctrl.getAvailableBadges);

// Get points history (daily breakdown)
router.get('/points-history', staffOnly, ctrl.getPointsHistory);

module.exports = router;
