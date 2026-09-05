// Gated on finance.* rather than settings.*: money and configuration are different
// audiences. A szállásfelelős configures rooms and must never see a rate (mig 154).
const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

router.use(authenticateToken);

router.get('/',     checkPermission('finance.view'), expenseController.getAll);
// /check-duplicates must come before /:id so :id doesn't capture the literal
router.post('/check-duplicates', checkPermission('finance.view'), expenseController.checkDuplicates);
router.get('/:id',  checkPermission('finance.view'), expenseController.getById);
router.post('/',    checkPermission('finance.edit'), expenseController.create);
router.put('/:id',  checkPermission('finance.edit'), expenseController.update);
router.delete('/:id', checkPermission('finance.edit'), expenseController.remove);

// File attachments (multipart upload via the controller's own multer mw)
router.post('/:id/files',
  checkPermission('finance.edit'),
  expenseController.uploadWithErrorHandling,
  expenseController.uploadFile,
);
router.get('/:id/files/:file_id',
  checkPermission('finance.view'),
  expenseController.downloadFile,
);
router.delete('/:id/files/:file_id',
  checkPermission('finance.edit'),
  expenseController.deleteFile,
);

module.exports = router;
