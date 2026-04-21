const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const ctrl = require('../controllers/inspectionTask.controller');
const photoCtrl = require('../controllers/inspectionPhoto.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Multer config for task completion photos
const taskUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, photoCtrl.TASK_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB per photo
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    cb(allowed.includes(path.extname(file.originalname).toLowerCase()) ? null : new Error('Csak képek'),
       allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

router.use(authenticateToken);

router.get('/',                ctrl.list);
router.get('/:id',             ctrl.getById);
router.patch('/:id',           checkPermission('settings.edit'), ctrl.update);
router.post('/:id/verify',     checkPermission('settings.edit'), ctrl.verify);

// Photo upload: maintenance worker proves completion
router.post('/:id/photos',
  checkPermission('settings.edit'),
  taskUpload.single('file'),
  photoCtrl.uploadTaskPhoto);

module.exports = router;
