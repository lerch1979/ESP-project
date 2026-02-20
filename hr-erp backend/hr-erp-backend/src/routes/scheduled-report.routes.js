const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  getAll,
  create,
  update,
  remove,
  triggerRun,
  getRunHistory,
  toggleActive,
} = require('../controllers/scheduled-report.controller');

router.get('/', authenticateToken, requireAdmin, getAll);
router.post('/', authenticateToken, requireAdmin, create);
router.put('/:id', authenticateToken, requireAdmin, update);
router.delete('/:id', authenticateToken, requireAdmin, remove);
router.post('/:id/run', authenticateToken, requireAdmin, triggerRun);
router.get('/:id/runs', authenticateToken, requireAdmin, getRunHistory);
router.patch('/:id/toggle', authenticateToken, requireAdmin, toggleActive);

module.exports = router;
