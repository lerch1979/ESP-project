const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const chatbot = require('../controllers/chatbot.controller');

// All chatbot routes require authentication
router.use(authenticateToken);

// ═══════════════════════════════════════════════════════════════════════════
// TIER 1: User endpoints (any authenticated user)
// ═══════════════════════════════════════════════════════════════════════════

// Conversations
router.post('/conversations', chatbot.createConversation);
router.get('/conversations', chatbot.getConversations);
router.get('/conversations/:conversationId/messages', chatbot.getMessages);
router.post('/conversations/:conversationId/messages', chatbot.sendMessage);
router.post('/conversations/:conversationId/escalate', chatbot.escalateConversation);
router.post('/conversations/:conversationId/close', chatbot.closeConversation);

// FAQ browsing
router.get('/faq/categories', chatbot.getUserFaqCategories);
router.get('/faq/entries', chatbot.getUserFaqEntries);

// ═══════════════════════════════════════════════════════════════════════════
// TIER 2: Operator endpoints
// ═══════════════════════════════════════════════════════════════════════════

router.get('/admin/conversations', requireRole(['admin', 'task_owner', 'superadmin', 'data_controller']), chatbot.adminGetConversations);
router.get('/admin/conversations/:conversationId', requireRole(['admin', 'task_owner', 'superadmin', 'data_controller']), chatbot.adminGetConversationDetail);
router.get('/admin/analytics', requireRole(['admin', 'task_owner', 'superadmin', 'data_controller']), chatbot.getAnalytics);

// Knowledge Base (admin+)
router.get('/admin/knowledge-base', requireAdmin, chatbot.getKnowledgeBase);
router.post('/admin/knowledge-base', requireAdmin, chatbot.createKnowledgeBaseEntry);
router.put('/admin/knowledge-base/:id', requireAdmin, chatbot.updateKnowledgeBaseEntry);
router.delete('/admin/knowledge-base/:id', requireAdmin, chatbot.deleteKnowledgeBaseEntry);

// ═══════════════════════════════════════════════════════════════════════════
// TIER 3: Superadmin endpoints
// ═══════════════════════════════════════════════════════════════════════════

// Decision Trees
router.get('/admin/decision-trees', requireAdmin, chatbot.getDecisionTrees);
router.get('/admin/decision-trees/:id', requireAdmin, chatbot.getDecisionTree);
router.post('/admin/decision-trees', requireAdmin, chatbot.createDecisionTree);
router.put('/admin/decision-trees/:id', requireAdmin, chatbot.updateDecisionTree);
router.delete('/admin/decision-trees/:id', requireAdmin, chatbot.deleteDecisionTree);

// Decision Nodes
router.post('/admin/decision-nodes', requireAdmin, chatbot.createDecisionNode);
router.put('/admin/decision-nodes/:id', requireAdmin, chatbot.updateDecisionNode);
router.delete('/admin/decision-nodes/:id', requireAdmin, chatbot.deleteDecisionNode);

// FAQ Categories
router.get('/admin/faq-categories', requireAdmin, chatbot.getFaqCategories);
router.post('/admin/faq-categories', requireAdmin, chatbot.createFaqCategory);
router.put('/admin/faq-categories/:id', requireAdmin, chatbot.updateFaqCategory);
router.delete('/admin/faq-categories/:id', requireAdmin, chatbot.deleteFaqCategory);

// Config (superadmin only)
router.get('/admin/config', requireSuperAdmin, chatbot.getConfig);
router.put('/admin/config', requireSuperAdmin, chatbot.updateConfig);

// Global Analytics (superadmin only)
router.get('/admin/analytics/global', requireSuperAdmin, chatbot.getGlobalAnalytics);

module.exports = router;
