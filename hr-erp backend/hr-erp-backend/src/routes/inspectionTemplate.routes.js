const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inspectionTemplate.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

// Categories
router.get('/categories',                 ctrl.listCategories);
router.post('/categories',                checkPermission('settings.edit'), ctrl.createCategory);
router.put('/categories/:id',             checkPermission('settings.edit'), ctrl.updateCategory);
router.delete('/categories/:id',          checkPermission('settings.edit'), ctrl.deleteCategory);

// Checklist items
router.get('/items',                      ctrl.listItems);
router.post('/items',                     checkPermission('settings.edit'), ctrl.createItem);
router.put('/items/:id',                  checkPermission('settings.edit'), ctrl.updateItem);
router.delete('/items/:id',               checkPermission('settings.edit'), ctrl.deleteItem);

module.exports = router;
