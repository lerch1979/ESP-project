const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/workerSpecialization.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require auth.
router.use(authenticateToken);

// Reads stay open to any authenticated staff member (this is reference data the
// assignment UI needs everywhere).
router.get('/types', ctrl.listTypes);
router.get('/',      ctrl.list);

// WRITES are gated (DEEP_AUDIT #13 — FUNCTEST PERM-19). These were authenticateToken-only,
// so an ordinary resident login could create, modify and delete worker specializations;
// verified live (a resident POST returned 201 and the row was created). Specializations
// describe an employee, so they ride on the employees.edit permission.
router.post('/',     checkPermission('employees.edit'), ctrl.create);
router.patch('/:id', checkPermission('employees.edit'), ctrl.update);
router.delete('/:id', checkPermission('employees.edit'), ctrl.remove);

module.exports = router;
