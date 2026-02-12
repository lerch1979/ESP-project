const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/category.controller');
const { authenticateToken } = require('../middleware/auth');

// Összes kategória lekérése
router.get('/', authenticateToken, categoryController.getCategories);

module.exports = router;
