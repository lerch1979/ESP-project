const express = require('express');
const router = express.Router();
const { authenticateToken, requireSuperAdmin } = require('../middleware/auth');
const c = require('../controllers/agentSettings.controller');

// CSAK SZUPERADMIN — mindhárom végpont. Ez a kapcsoló azt engedi meg egy gépnek, hogy
// a lakók felé üzenetet küldjön és jegyeket nyisson; ez nem adat-, hanem
// rendszer-szintű döntés. Olvasásra sem engedjük lejjebb: a policy tábla és a
// készültségi adatok együtt megmutatják, mit tenne az agent — ez belső információ.
router.get('/settings', authenticateToken, requireSuperAdmin, c.getSettings);
router.put('/settings', authenticateToken, requireSuperAdmin, c.updateMode);
router.put('/policy/:actionType', authenticateToken, requireSuperAdmin, c.updatePolicy);

module.exports = router;
