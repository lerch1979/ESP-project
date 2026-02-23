const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const {
  getAll,
  create,
  update,
  remove,
  triggerRun,
  getRunHistory,
  toggleActive,
} = require('../controllers/scheduled-report.controller');

router.get('/', authenticateToken, checkPermission('reports.schedule'), getAll);
router.post('/', authenticateToken, checkPermission('reports.schedule'), create);
router.put('/:id', authenticateToken, checkPermission('reports.schedule'), update);
router.delete('/:id', authenticateToken, checkPermission('reports.schedule'), remove);
router.post('/:id/run', authenticateToken, checkPermission('reports.schedule'), triggerRun);
router.get('/:id/runs', authenticateToken, checkPermission('reports.schedule'), getRunHistory);
router.patch('/:id/toggle', authenticateToken, checkPermission('reports.schedule'), toggleActive);

module.exports = router;
