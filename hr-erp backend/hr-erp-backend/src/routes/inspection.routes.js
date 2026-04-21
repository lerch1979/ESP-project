const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const ctrl = require('../controllers/inspection.controller');
const photoCtrl = require('../controllers/inspectionPhoto.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Multer for inspection photos (mobile capture → disk)
const inspectionUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, photoCtrl.INSPECTION_DIR),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    const ok = allowed.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Csak képek'), ok);
  },
});

router.use(authenticateToken);

// Read — any authenticated user (scoped by contractor at query level; owner-portal
// filtering is Day 4 work). For now admin + inspectors can list.
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);

// Write — inspectors + admins. Using settings.edit as a proxy permission
// until the new property_inspector-scoped permissions land.
router.post('/',                     checkPermission('settings.edit'), ctrl.create);
router.patch('/:id',                 checkPermission('settings.edit'), ctrl.update);
router.post('/:id/scores',           checkPermission('settings.edit'), ctrl.addScores);
router.post('/:id/complete',         checkPermission('settings.edit'), ctrl.complete);
router.delete('/:id',                checkPermission('settings.edit'), ctrl.remove);

// Room-level scoring (Day 3 Part A)
router.get('/:id/rooms',                         ctrl.listRooms);
router.post('/:id/rooms/:roomId/score',          checkPermission('settings.edit'), ctrl.scoreRoom);

// Photo upload (inspector captures from mobile)
router.get('/:id/photos',            photoCtrl.listInspectionPhotos);
router.post('/:id/photos',           checkPermission('settings.edit'),
                                     inspectionUpload.single('file'),
                                     photoCtrl.uploadInspectionPhoto);
router.delete('/photos/:id',         checkPermission('settings.edit'), photoCtrl.deleteInspectionPhoto);

module.exports = router;
