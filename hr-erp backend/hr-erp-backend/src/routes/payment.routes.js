// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/', checkPermission('finance.view'), paymentController.getAll);
router.get('/:id', checkPermission('finance.view'), paymentController.getById);
router.post('/', checkPermission('finance.edit'), paymentController.create);
router.put('/:id', checkPermission('finance.edit'), paymentController.update);
router.delete('/:id', checkPermission('finance.edit'), paymentController.remove);

module.exports = router;
