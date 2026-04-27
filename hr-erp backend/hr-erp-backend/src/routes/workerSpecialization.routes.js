const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/workerSpecialization.controller');
const { authenticateToken } = require('../middleware/auth');

// All routes require auth. Granular permission checks live one layer up
// (UI gating) — the data is admin-facing reference data.
router.use(authenticateToken);

router.get('/types', ctrl.listTypes);
router.get('/',      ctrl.list);
router.post('/',     ctrl.create);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
