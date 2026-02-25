const express = require('express');
const router = express.Router();
const projectController = require('../controllers/project.controller');
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// All routes require authentication
router.use(authenticateToken);

// ============================================
// Project Routes
// ============================================

/**
 * GET /api/v1/projects/dashboard
 * Projekt áttekintő statisztikák
 * NOTE: Must be before /:id to avoid matching "dashboard" as an id
 */
router.get('/dashboard', checkPermission('projects.view'), projectController.getDashboard);

/**
 * GET /api/v1/projects
 * Összes projekt listázása
 */
router.get('/', checkPermission('projects.view'), projectController.getAll);

/**
 * POST /api/v1/projects
 * Új projekt létrehozása
 */
router.post('/', checkPermission('projects.create'), projectController.create);

/**
 * GET /api/v1/projects/:id
 * Egyedi projekt lekérdezése
 */
router.get('/:id', checkPermission('projects.view'), projectController.getById);

/**
 * PUT /api/v1/projects/:id
 * Projekt szerkesztése
 */
router.put('/:id', checkPermission('projects.edit'), projectController.update);

/**
 * DELETE /api/v1/projects/:id
 * Projekt törlése (soft delete)
 */
router.delete('/:id', checkPermission('projects.delete'), projectController.remove);

/**
 * GET /api/v1/projects/:id/timeline
 * Gantt chart adat
 */
router.get('/:id/timeline', checkPermission('projects.view'), projectController.getTimeline);

/**
 * GET /api/v1/projects/:id/budget-summary
 * Költségvetés összesítő
 */
router.get('/:id/budget-summary', checkPermission('projects.view'), projectController.getBudgetSummary);

/**
 * POST /api/v1/projects/:id/team
 * Csapattag hozzárendelése
 */
router.post('/:id/team', checkPermission('projects.edit'), projectController.assignTeamMember);

/**
 * DELETE /api/v1/projects/:id/team/:userId
 * Csapattag eltávolítása
 */
router.delete('/:id/team/:userId', checkPermission('projects.edit'), projectController.removeTeamMember);

module.exports = router;
