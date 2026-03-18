const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/gamification.controller');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// Get my gamification stats (points, badges, streak)
router.get('/my-stats', ctrl.getMyStats);

// Get leaderboard (privacy-safe: minimum 5 actions)
router.get('/leaderboard', ctrl.getLeaderboard);

// Get all available badges
router.get('/badges/available', ctrl.getAvailableBadges);

// Get points history (daily breakdown)
router.get('/points-history', ctrl.getPointsHistory);

module.exports = router;
