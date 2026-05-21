const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/',     checkPermission('settings.view'), expenseController.getAll);
// /check-duplicates must come before /:id so :id doesn't capture the literal
router.post('/check-duplicates', checkPermission('settings.view'), expenseController.checkDuplicates);
router.get('/:id',  checkPermission('settings.view'), expenseController.getById);
router.post('/',    checkPermission('settings.edit'), expenseController.create);
router.put('/:id',  checkPermission('settings.edit'), expenseController.update);
router.delete('/:id', checkPermission('settings.edit'), expenseController.remove);

module.exports = router;
