const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/', checkPermission('settings.view'), paymentController.getAll);
router.get('/:id', checkPermission('settings.view'), paymentController.getById);
router.post('/', checkPermission('settings.edit'), paymentController.create);
router.put('/:id', checkPermission('settings.edit'), paymentController.update);
router.delete('/:id', checkPermission('settings.edit'), paymentController.remove);

module.exports = router;
