const express = require('express');
const router = express.Router();
const videoController = require('../controllers/video.controller');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Minden video route-hoz authentikáció szükséges
router.use(authenticateToken);

/**
 * GET /api/v1/videos/categories
 * Kategóriák listázása (minden felhasználó)
 */
router.get('/categories', videoController.getCategories);

/**
 * GET /api/v1/videos
 * Videók listázása (minden felhasználó)
 * Query: search, category, page, limit
 */
router.get('/', videoController.getVideos);

/**
 * GET /api/v1/videos/:id
 * Egy videó részletei (minden felhasználó)
 */
router.get('/:id', videoController.getVideoById);

/**
 * POST /api/v1/videos
 * Új videó létrehozása (admin)
 */
router.post('/', requireAdmin, videoController.createVideo);

/**
 * PUT /api/v1/videos/:id
 * Videó frissítése (admin)
 */
router.put('/:id', requireAdmin, videoController.updateVideo);

/**
 * DELETE /api/v1/videos/:id
 * Videó törlése (admin, soft delete)
 */
router.delete('/:id', requireAdmin, videoController.deleteVideo);

/**
 * POST /api/v1/videos/:id/view
 * Megtekintés rögzítése (minden felhasználó)
 */
router.post('/:id/view', videoController.recordView);

module.exports = router;
