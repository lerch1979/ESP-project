/**
 * Admin routes for resident video communication (mig 143).
 *
 * Gated on the existing videos.* permissions — this is the video module's send side, not a
 * new permission domain. Sending to residents and reading who watched are treated as
 * EDIT-level, because a send is an outbound action and the compliance list carries
 * per-resident names.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const c = require('../controllers/videoSequence.controller');

router.use(authenticateToken);

// Audience — preview before you commit; "whoever it concerns", never blanket by accident.
router.get('/audience/options', checkPermission('videos.view'), c.audienceOptions);
router.post('/audience/preview', checkPermission('videos.view'), c.audiencePreview);

// Mode B — ad-hoc send
router.post('/send', checkPermission('videos.edit'), c.sendNow);

// Modes A1/A2 — sequences, created from the admin without code changes
router.get('/sequences', checkPermission('videos.view'), c.listSequences);
router.get('/sequences/:id', checkPermission('videos.view'), c.getSequence);
router.post('/sequences', checkPermission('videos.create'), c.createSequence);
router.put('/sequences/:id', checkPermission('videos.edit'), c.updateSequence);
router.delete('/sequences/:id', checkPermission('videos.delete'), c.deleteSequence);
router.post('/sequences/:id/steps', checkPermission('videos.edit'), c.addStep);
router.delete('/sequences/:id/steps/:stepId', checkPermission('videos.edit'), c.deleteStep);
router.post('/sequences/run', checkPermission('videos.edit'), c.runSequences);

// Delivery record + watch evidence
router.get('/announcements', checkPermission('videos.view'), c.listAnnouncements);
router.get('/announcements/:id/compliance', checkPermission('videos.view'), c.announcementCompliance);

// Runtime config: per-day cap + mandatory re-nag window
router.get('/config', checkPermission('videos.view'), c.getConfig);
router.put('/config', checkPermission('videos.edit'), c.updateConfig);

module.exports = router;
