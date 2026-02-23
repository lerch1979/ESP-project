const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Minden video route-hoz authentikáció szükséges
router.use(authenticateToken);

/**
 * GET /api/v1/videos/categories
 * Kategóriák listázása (minden felhasználó)
 */
router.get('/categories', checkPermission('videos.view'), videoController.getCategories);

/**
 * GET /api/v1/videos
 * Videók listázása (minden felhasználó)
 * Query: search, category, page, limit
 */
router.get('/', checkPermission('videos.view'), videoController.getVideos);

/**
 * GET /api/v1/videos/:id
 * Egy videó részletei (minden felhasználó)
 */
router.get('/:id', checkPermission('videos.view'), videoController.getVideoById);

/**
 * POST /api/v1/videos
 * Új videó létrehozása (admin)
 */
router.post('/', checkPermission('videos.create'), videoController.createVideo);

/**
 * PUT /api/v1/videos/:id
 * Videó frissítése (admin)
 */
router.put('/:id', checkPermission('videos.edit'), videoController.updateVideo);

/**
 * DELETE /api/v1/videos/:id
 * Videó törlése (admin, soft delete)
 */
router.delete('/:id', checkPermission('videos.delete'), videoController.deleteVideo);

/**
 * POST /api/v1/videos/:id/view
 * Megtekintés rögzítése (minden felhasználó)
 */
router.post('/:id/view', checkPermission('videos.view'), videoController.recordView);

module.exports = router;
