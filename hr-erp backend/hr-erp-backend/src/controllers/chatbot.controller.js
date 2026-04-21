const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { isValidUUID } = require('../utils/validation');
const chatbotService = require('../services/chatbot.service');
const translation = require('../services/translation.service');

// ─── Translation helpers ────────────────────────────────────────────────────
//
// Bot-reply pipeline (FAQ/decision-tree/Claude prompts) is Hungarian-centric:
// - On write: translate user text hu-in, translate bot text user-lang-out.
// - On read: original user sees user message original + bot translated_content;
//   admins (admin, superadmin, data_controller) see everything in Hungarian.

const ADMIN_VIEWER_ROLES = ['admin', 'superadmin', 'data_controller'];

function isAdminViewer(req) {
  const roles = req.user?.roles || [];
  return roles.some((r) => ADMIN_VIEWER_ROLES.includes(r));
}

async function safeTranslate(text, fromLang, toLang) {
  // Degraded-mode guard: never let a translation failure break the request.
  try {
    if (!text || typeof text !== 'string' || !text.trim()) return text || '';
    if (!fromLang || !toLang || fromLang === toLang) return text;
    return await translation.translateText(text, fromLang, toLang);
  } catch (err) {
    logger.warn('[chatbot] translation failed, returning original:', err.message);
    return text;
  }
}

async function renderMessagesForViewer(req, rawMessages, conversationOwnerId) {
  // Returns a shallow-cloned list with `content` adjusted to the viewer's
  // language. Admins always see Hungarian; the conversation owner sees their
  // own language. Non-user/non-bot ("system") messages are returned as-is
  // other than translation of their text.
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) return rawMessages || [];

  const viewerIsAdmin = isAdminViewer(req);
  const viewerIsOwner = req.user?.id === conversationOwnerId;

  if (viewerIsAdmin) {
    // Admin view: everything in Hungarian. Bot messages are already 'hu';
    // user messages that were authored in another language get translated.
    return Promise.all(
      rawMessages.map(async (m) => {
        const lang = m.language || 'hu';
        if (lang === 'hu') return m;
        const translated = await safeTranslate(m.content, lang, 'hu');
        return { ...m, content: translated, original_content: m.content };
      })
    );
  }

  if (viewerIsOwner) {
    // Owner view: user messages shown in their original language; bot
    // messages rendered via cached translated_content when available and
    // lazily translated otherwise (covers legacy rows written before wiring).
    const viewerLang = await translation.getUserLanguage(req.user.id);
    return Promise.all(
      rawMessages.map(async (m) => {
        if (m.sender_type === 'bot' || m.sender_type === 'system') {
          const storedLang = m.language || 'hu';
          if (m.translated_content && m.is_translated) {
            return { ...m, content: m.translated_content, original_content: m.content };
          }
          if (storedLang === viewerLang) return m;
          const translated = await safeTranslate(m.content, storedLang, viewerLang);
          return { ...m, content: translated, original_content: m.content };
        }
        // User messages: always show in the language they were authored in.
        return m;
      })
    );
  }

  // Fallback (neither owner nor admin, e.g. cross-contractor lookup denied
  // elsewhere): return raw rows untranslated.
  return rawMessages;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER 1: User endpoints
// ═══════════════════════════════════════════════════════════════════════════

const createConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const contractorId = req.user.contractorId;
    const { title } = req.body;

    const result = await query(
      `INSERT INTO chatbot_conversations (contractor_id, user_id, title)
       VALUES ($1, $2, $3) RETURNING *`,
      [contractorId, userId, title || 'Új beszélgetés']
    );
    const conversation = result.rows[0];

    const userLang = await translation.getUserLanguage(userId);

    // Add welcome message — stored canonical in Hungarian, translated for user
    const welcomeMsg = await chatbotService.getWelcomeMessage(contractorId);
    const welcomeTranslated = userLang === 'hu'
      ? null
      : await safeTranslate(welcomeMsg, 'hu', userLang);
    await query(
      `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, language, translated_content, is_translated)
       VALUES ($1, 'bot', 'text', $2, 'hu', $3, $4)`,
      [conversation.id, welcomeMsg, welcomeTranslated, !!welcomeTranslated]
    );

    // Get FAQ categories for welcome options
    const categories = await chatbotService.getFaqCategories(contractorId);
    if (categories.length > 0) {
      const prompt = 'Válasszon témát:';
      const promptTranslated = userLang === 'hu' ? null : await safeTranslate(prompt, 'hu', userLang);
      await query(
        `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, metadata, language, translated_content, is_translated)
         VALUES ($1, 'bot', 'faq_list', $2, $3, 'hu', $4, $5)`,
        [conversation.id, prompt, JSON.stringify({ categories }), promptTranslated, !!promptTranslated]
      );
    }

    res.status(201).json({ success: true, data: conversation });
  } catch (error) {
    logger.error('Error creating conversation:', error);
    res.status(500).json({ success: false, message: 'Hiba a beszélgetés létrehozása közben' });
  }
};

const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT c.*,
                 (SELECT content FROM chatbot_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                 (SELECT COUNT(*) FROM chatbot_messages WHERE conversation_id = c.id) as message_count
               FROM chatbot_conversations c
               WHERE c.user_id = $1`;
    const params = [userId];
    let idx = 2;

    if (status) {
      sql += ` AND c.status = $${idx}`;
      params.push(status);
      idx++;
    }

    sql += ` ORDER BY c.updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(sql, params);

    const countResult = await query(
      `SELECT COUNT(*) as total FROM chatbot_conversations WHERE user_id = $1${status ? ` AND status = '${status}'` : ''}`,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (error) {
    logger.error('Error getting conversations:', error);
    res.status(500).json({ success: false, message: 'Hiba a beszélgetések lekérdezése közben' });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const convCheck = await query(
      `SELECT id, user_id FROM chatbot_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Beszélgetés nem található' });
    }

    const result = await query(
      `SELECT * FROM chatbot_messages WHERE conversation_id = $1 ORDER BY created_at`,
      [conversationId]
    );

    const rendered = await renderMessagesForViewer(req, result.rows, convCheck.rows[0].user_id);
    res.json({ success: true, data: rendered });
  } catch (error) {
    logger.error('Error getting messages:', error);
    res.status(500).json({ success: false, message: 'Hiba az üzenetek lekérdezése közben' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const contractorId = req.user.contractorId;
    const { content } = req.body;

    // Input validation via sanitizeInput
    const sanitized = chatbotService.sanitizeInput(content);
    if (!sanitized) {
      return res.status(400).json({ success: false, message: 'Az üzenet nem lehet üres' });
    }

    // Verify ownership
    const convCheck = await query(
      `SELECT id, status FROM chatbot_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Beszélgetés nem található' });
    }
    if (convCheck.rows[0].status !== 'active') {
      return res.status(400).json({ success: false, message: 'Ez a beszélgetés már lezárult' });
    }

    // Resolve user's preferred language (defaults to 'hu' if missing/unknown)
    const userLang = await translation.getUserLanguage(userId);

    // Translate user input into Hungarian so the bot pipeline (FAQ/decision
    // tree/Claude prompts, all Hungarian-centric) matches correctly.
    // Keep the original for storage and display.
    const sanitizedHu = userLang === 'hu'
      ? sanitized
      : await safeTranslate(sanitized, userLang, 'hu');

    // Save user message in its ORIGINAL language
    const userMsg = await query(
      `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, language)
       VALUES ($1, 'user', 'text', $2, $3) RETURNING *`,
      [conversationId, sanitized, userLang]
    );

    // Process and get bot response in Hungarian (track response time)
    const startTime = Date.now();
    const botResponse = await chatbotService.processMessage(conversationId, sanitizedHu, userId, contractorId);
    const responseTimeMs = Date.now() - startTime;

    // Store response_time_ms in bot message metadata
    const metadata = { ...botResponse.metadata, response_time_ms: responseTimeMs };

    // Translate bot reply to user's language (cached) for serving + storage
    const botContentTranslated = userLang === 'hu'
      ? null
      : await safeTranslate(botResponse.content, 'hu', userLang);
    const isTranslated = !!botContentTranslated;

    // Save bot response: canonical Hungarian in `content`, user-lang render
    // in `translated_content`. `language` is always the canonical source ('hu').
    const faqId = metadata.kb_id || null;
    const confidenceScore = metadata.confidence_score || null;
    const botMsg = await query(
      `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, metadata, faq_id, confidence_score, language, translated_content, is_translated)
       VALUES ($1, $2, $3, $4, $5, $6, 'hu', $7, $8) RETURNING *`,
      [conversationId, botResponse.message_type, botResponse.content, JSON.stringify(metadata), faqId, confidenceScore, botContentTranslated, isTranslated]
    );

    // Update conversation timestamp and title if first user message
    const msgCount = await query(
      `SELECT COUNT(*) as cnt FROM chatbot_messages WHERE conversation_id = $1 AND sender_type = 'user'`,
      [conversationId]
    );
    if (parseInt(msgCount.rows[0].cnt) <= 1) {
      await query(
        `UPDATE chatbot_conversations SET title = $1 WHERE id = $2`,
        [sanitized.substring(0, 200), conversationId]
      );
    }

    // Return the bot message rendered in the user's language (so the mobile
    // client can display it immediately without a re-fetch).
    const botRow = botMsg.rows[0];
    const botRowForUser = isTranslated
      ? { ...botRow, content: botRow.translated_content, original_content: botRow.content }
      : botRow;

    res.json({
      success: true,
      data: {
        userMessage: userMsg.rows[0],
        botMessage: botRowForUser,
      },
    });
  } catch (error) {
    logger.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Hiba az üzenet küldése közben' });
  }
};

const escalateConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const contractorId = req.user.contractorId;

    // Verify ownership
    const convCheck = await query(
      `SELECT id, status FROM chatbot_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Beszélgetés nem található' });
    }
    if (convCheck.rows[0].status !== 'active') {
      return res.status(400).json({ success: false, message: 'Ez a beszélgetés már eszkalálva lett vagy lezárult' });
    }

    const { ticketId, ticketNumber } = await chatbotService.createEscalationTicket(conversationId, userId, contractorId);

    // Add escalation message (canonical Hungarian + cached user-lang translation)
    const userLang = await translation.getUserLanguage(userId);
    const escalationMsg = await chatbotService.getEscalationMessage(contractorId);
    const escalationTranslated = userLang === 'hu'
      ? null
      : await safeTranslate(escalationMsg, 'hu', userLang);
    await query(
      `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, metadata, language, translated_content, is_translated)
       VALUES ($1, 'system', 'escalation', $2, $3, 'hu', $4, $5)`,
      [conversationId, escalationMsg, JSON.stringify({ ticket_id: ticketId, ticket_number: ticketNumber }), escalationTranslated, !!escalationTranslated]
    );

    res.json({
      success: true,
      message: 'Beszélgetés eszkalálva',
      data: { ticketId, ticketNumber },
    });
  } catch (error) {
    logger.error('Error escalating conversation:', error);
    res.status(500).json({ success: false, message: 'Hiba az eszkaláció közben' });
  }
};

const closeConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;

    const result = await query(
      `UPDATE chatbot_conversations SET status = 'closed', closed_at = CURRENT_TIMESTAMP,
       resolution_type = 'resolved', current_tree_id = NULL, current_node_id = NULL
       WHERE id = $1 AND user_id = $2 AND status = 'active' RETURNING *`,
      [conversationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Aktív beszélgetés nem található' });
    }

    // Add system close message (canonical Hungarian + cached user-lang translation)
    const userLang = await translation.getUserLanguage(userId);
    const closeMsg = 'A beszélgetés lezárva.';
    const closeTranslated = userLang === 'hu'
      ? null
      : await safeTranslate(closeMsg, 'hu', userLang);
    await query(
      `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, language, translated_content, is_translated)
       VALUES ($1, 'system', 'text', $2, 'hu', $3, $4)`,
      [conversationId, closeMsg, closeTranslated, !!closeTranslated]
    );

    res.json({ success: true, message: 'Beszélgetés lezárva', data: result.rows[0] });
  } catch (error) {
    logger.error('Error closing conversation:', error);
    res.status(500).json({ success: false, message: 'Hiba a beszélgetés lezárása közben' });
  }
};

const getUserFaqCategories = async (req, res) => {
  try {
    const contractorId = req.user?.contractorId;
    const categories = await chatbotService.getFaqCategories(contractorId);
    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error('Error getting FAQ categories:', error);
    res.status(500).json({ success: false, message: 'Hiba a GYIK kategóriák lekérdezése közben' });
  }
};

const getUserFaqEntries = async (req, res) => {
  try {
    const contractorId = req.user?.contractorId;
    const { category_id, search } = req.query;
    const entries = await chatbotService.getFaqEntries(contractorId, category_id, search);
    res.json({ success: true, data: entries });
  } catch (error) {
    logger.error('Error getting FAQ entries:', error);
    res.status(500).json({ success: false, message: 'Hiba a GYIK bejegyzések lekérdezése közben' });
  }
};

const selectSuggestion = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { kb_id } = req.body;

    if (!kb_id) {
      return res.status(400).json({ success: false, message: 'kb_id megadása kötelező' });
    }

    // Verify ownership
    const convCheck = await query(
      `SELECT id, status FROM chatbot_conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (convCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Beszélgetés nem található' });
    }
    if (convCheck.rows[0].status !== 'active') {
      return res.status(400).json({ success: false, message: 'Ez a beszélgetés már lezárult' });
    }

    // Fetch KB entry
    const kbResult = await query(
      `SELECT id, question, answer FROM chatbot_knowledge_base WHERE id = $1 AND is_active = true`,
      [kb_id]
    );
    if (kbResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Tudásbázis bejegyzés nem található' });
    }
    const kbEntry = kbResult.rows[0];

    // KB entries are authored in Hungarian. For non-hu users, show the
    // question in their language (so the chat log reads naturally) and the
    // answer in their language. Both are cached via translation_cache.
    const userLang = await translation.getUserLanguage(userId);
    const displayQuestion = userLang === 'hu'
      ? kbEntry.question
      : await safeTranslate(kbEntry.question, 'hu', userLang);
    const answerTranslated = userLang === 'hu'
      ? null
      : await safeTranslate(kbEntry.answer, 'hu', userLang);

    // Save user message (the selected question) in the user's language
    const userMsg = await query(
      `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, language)
       VALUES ($1, 'user', 'text', $2, $3) RETURNING *`,
      [conversationId, displayQuestion, userLang]
    );

    // Save bot message (the answer) — canonical Hungarian + cached translation
    const botMsg = await query(
      `INSERT INTO chatbot_messages (conversation_id, sender_type, message_type, content, metadata, language, translated_content, is_translated)
       VALUES ($1, 'bot', 'text', $2, $3, 'hu', $4, $5) RETURNING *`,
      [
        conversationId,
        kbEntry.answer,
        JSON.stringify({ source: 'knowledge_base', kb_id: kbEntry.id, question: kbEntry.question }),
        answerTranslated,
        !!answerTranslated,
      ]
    );

    // Increment usage_count
    await query(
      `UPDATE chatbot_knowledge_base SET usage_count = usage_count + 1 WHERE id = $1`,
      [kb_id]
    );

    const botRow = botMsg.rows[0];
    const botRowForUser = botRow.is_translated
      ? { ...botRow, content: botRow.translated_content, original_content: botRow.content }
      : botRow;

    res.json({
      success: true,
      data: {
        userMessage: userMsg.rows[0],
        botMessage: botRowForUser,
      },
    });
  } catch (error) {
    logger.error('Error selecting suggestion:', error);
    res.status(500).json({ success: false, message: 'Hiba a javaslat kiválasztása közben' });
  }
};

const submitFeedback = async (req, res) => {
  try {
    const { messageId, helpful } = req.body;
    const userId = req.user.id;

    if (!messageId) {
      return res.status(400).json({ success: false, message: 'messageId megadása kötelező' });
    }
    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ success: false, message: 'helpful (true/false) megadása kötelező' });
    }

    // Verify message belongs to user's conversation
    const msgCheck = await query(
      `SELECT m.id, m.faq_id, m.conversation_id, c.user_id
       FROM chatbot_messages m
       JOIN chatbot_conversations c ON m.conversation_id = c.id
       WHERE m.id = $1`,
      [messageId]
    );
    if (msgCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Üzenet nem található' });
    }
    if (msgCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ success: false, message: 'Nincs jogosultsága' });
    }

    // Update message helpful flag
    await query(
      'UPDATE chatbot_messages SET helpful = $1 WHERE id = $2',
      [helpful, messageId]
    );

    // Update FAQ counters if linked to a FAQ
    const faqId = msgCheck.rows[0].faq_id;
    if (faqId) {
      if (helpful) {
        await query(
          'UPDATE chatbot_knowledge_base SET helpful_count = helpful_count + 1 WHERE id = $1',
          [faqId]
        );
      } else {
        await query(
          'UPDATE chatbot_knowledge_base SET not_helpful_count = not_helpful_count + 1 WHERE id = $1',
          [faqId]
        );
      }
    }

    res.json({
      success: true,
      message: helpful ? 'Köszönjük a pozitív visszajelzést!' : 'Köszönjük a visszajelzést, javítani fogunk.',
      data: { messageId, helpful, faqId },
    });
  } catch (error) {
    logger.error('Error submitting feedback:', error);
    res.status(500).json({ success: false, message: 'Hiba a visszajelzés küldése közben' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TIER 2: Operator endpoints (admin, task_owner)
// ═══════════════════════════════════════════════════════════════════════════

const adminGetConversations = async (req, res) => {
  try {
    const contractorId = req.user.roles.includes('superadmin') ? req.query.contractor_id : req.user.contractorId;
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = [];
    const params = [];
    let idx = 1;

    if (contractorId) {
      conditions.push(`c.contractor_id = $${idx}`);
      params.push(contractorId);
      idx++;
    }
    if (status) {
      conditions.push(`c.status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (search) {
      conditions.push(`(c.title ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT c.*, u.first_name, u.last_name, u.email,
              lm.content as last_message,
              lm.language as last_message_language,
              (SELECT COUNT(*) FROM chatbot_messages WHERE conversation_id = c.id) as message_count
       FROM chatbot_conversations c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT content, language
         FROM chatbot_messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) lm ON true
       ${where}
       ORDER BY c.updated_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM chatbot_conversations c JOIN users u ON c.user_id = u.id ${where}`,
      params
    );

    // Translate last_message previews to Hungarian for admin viewers.
    // Cache-first via translation_cache; truncate to 100 chars before translating
    // so we don't waste Claude tokens on long messages. Bot messages are already
    // 'hu' (no-op). Owner view is not served by this endpoint (admin-only).
    const PREVIEW_LEN = 100;
    const rows = await Promise.all(result.rows.map(async (row) => {
      if (!row.last_message) return row;
      const preview = String(row.last_message).slice(0, PREVIEW_LEN);
      const lang = row.last_message_language || 'hu';
      if (lang === 'hu') {
        return { ...row, last_message_preview: preview };
      }
      // Non-Hungarian last message → translate preview for admin display
      const translated = await safeTranslate(preview, lang, 'hu');
      return { ...row, last_message_preview: translated };
    }));

    res.json({
      success: true,
      data: rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (error) {
    logger.error('Error getting admin conversations:', error);
    res.status(500).json({ success: false, message: 'Hiba a beszélgetések lekérdezése közben' });
  }
};

const adminGetConversationDetail = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const convResult = await query(
      `SELECT c.*, u.first_name, u.last_name, u.email
       FROM chatbot_conversations c
       JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [conversationId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Beszélgetés nem található' });
    }

    const messages = await query(
      `SELECT * FROM chatbot_messages WHERE conversation_id = $1 ORDER BY created_at`,
      [conversationId]
    );

    // Render for the viewer (admin => everything in Hungarian; owner => own
    // language). `language` stays on each row so the UI can badge originals.
    const rendered = await renderMessagesForViewer(
      req,
      messages.rows,
      convResult.rows[0].user_id
    );

    res.json({
      success: true,
      data: {
        conversation: convResult.rows[0],
        messages: rendered,
      },
    });
  } catch (error) {
    logger.error('Error getting conversation detail:', error);
    res.status(500).json({ success: false, message: 'Hiba a beszélgetés részleteinek lekérdezése közben' });
  }
};

// ─── Knowledge Base CRUD ────────────────────────────────────────────────────

const getKnowledgeBase = async (req, res) => {
  try {
    const contractorId = req.user.roles.includes('superadmin') ? (req.query.contractor_id || req.user.contractorId) : req.user.contractorId;
    const { search, category_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let conditions = ['kb.contractor_id = $1'];
    const params = [contractorId];
    let idx = 2;

    if (search) {
      conditions.push(`(kb.question ILIKE $${idx} OR kb.answer ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (category_id) {
      conditions.push(`kb.category_id = $${idx}`);
      params.push(category_id);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await query(
      `SELECT kb.*, fc.name as category_name
       FROM chatbot_knowledge_base kb
       LEFT JOIN chatbot_faq_categories fc ON kb.category_id = fc.id
       ${where}
       ORDER BY kb.priority DESC, kb.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM chatbot_knowledge_base kb ${where}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { total: parseInt(countResult.rows[0].total), page: parseInt(page), limit: parseInt(limit) },
    });
  } catch (error) {
    logger.error('Error getting knowledge base:', error);
    res.status(500).json({ success: false, message: 'Hiba a tudásbázis lekérdezése közben' });
  }
};

const createKnowledgeBaseEntry = async (req, res) => {
  try {
    const contractorId = req.user.contractorId;
    const { question, answer, keywords, category_id, priority } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ success: false, message: 'Kérdés és válasz megadása kötelező' });
    }

    const result = await query(
      `INSERT INTO chatbot_knowledge_base (contractor_id, question, answer, keywords, category_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [contractorId, question, answer, keywords || [], category_id || null, priority || 0]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating KB entry:', error);
    res.status(500).json({ success: false, message: 'Hiba a bejegyzés létrehozása közben' });
  }
};

const updateKnowledgeBaseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, keywords, category_id, priority, is_active } = req.body;

    const result = await query(
      `UPDATE chatbot_knowledge_base
       SET question = COALESCE($1, question),
           answer = COALESCE($2, answer),
           keywords = COALESCE($3, keywords),
           category_id = $4,
           priority = COALESCE($5, priority),
           is_active = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [question, answer, keywords, category_id, priority, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bejegyzés nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating KB entry:', error);
    res.status(500).json({ success: false, message: 'Hiba a bejegyzés frissítése közben' });
  }
};

const bulkActionKnowledgeBase = async (req, res) => {
  try {
    const { action, ids, category_id, is_active } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids tömb megadása kötelező' });
    }
    if (!action) {
      return res.status(400).json({ success: false, message: 'action megadása kötelező' });
    }

    // Validate all IDs are proper UUIDs to prevent injection
    const invalidIds = ids.filter(id => !isValidUUID(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ success: false, message: 'Érvénytelen UUID formátum az ids tömbben' });
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');

    switch (action) {
      case 'delete':
        await query(`DELETE FROM chatbot_knowledge_base WHERE id IN (${placeholders})`, ids);
        break;
      case 'activate':
        await query(`UPDATE chatbot_knowledge_base SET is_active = true WHERE id IN (${placeholders})`, ids);
        break;
      case 'deactivate':
        await query(`UPDATE chatbot_knowledge_base SET is_active = false WHERE id IN (${placeholders})`, ids);
        break;
      case 'change_category':
        if (!category_id) {
          return res.status(400).json({ success: false, message: 'category_id megadása kötelező' });
        }
        await query(
          `UPDATE chatbot_knowledge_base SET category_id = $${ids.length + 1} WHERE id IN (${placeholders})`,
          [...ids, category_id]
        );
        break;
      default:
        return res.status(400).json({ success: false, message: 'Érvénytelen művelet' });
    }

    res.json({ success: true, message: `Tömeges művelet (${action}) végrehajtva: ${ids.length} bejegyzés` });
  } catch (error) {
    logger.error('Error bulk action KB:', error);
    res.status(500).json({ success: false, message: 'Hiba a tömeges művelet közben' });
  }
};

const deleteKnowledgeBaseEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM chatbot_knowledge_base WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Bejegyzés nem található' });
    }

    res.json({ success: true, message: 'Bejegyzés törölve' });
  } catch (error) {
    logger.error('Error deleting KB entry:', error);
    res.status(500).json({ success: false, message: 'Hiba a bejegyzés törlése közben' });
  }
};

// ─── Analytics ──────────────────────────────────────────────────────────────

const getAnalytics = async (req, res) => {
  try {
    const contractorId = req.user.roles.includes('superadmin') ? (req.query.contractor_id || req.user.contractorId) : req.user.contractorId;

    const [
      totalConvs, activeConvs, escalatedConvs, closedConvs,
      totalMessages, topKb, dailyStats,
      avgResponseTime, resolutionStats, unansweredCount, avgDuration,
    ] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM chatbot_conversations WHERE contractor_id = $1`, [contractorId]),
      query(`SELECT COUNT(*) as total FROM chatbot_conversations WHERE contractor_id = $1 AND status = 'active'`, [contractorId]),
      query(`SELECT COUNT(*) as total FROM chatbot_conversations WHERE contractor_id = $1 AND status = 'escalated'`, [contractorId]),
      query(`SELECT COUNT(*) as total FROM chatbot_conversations WHERE contractor_id = $1 AND status = 'closed'`, [contractorId]),
      query(
        `SELECT COUNT(*) as total FROM chatbot_messages m
         JOIN chatbot_conversations c ON m.conversation_id = c.id
         WHERE c.contractor_id = $1`,
        [contractorId]
      ),
      query(
        `SELECT question, usage_count FROM chatbot_knowledge_base
         WHERE contractor_id = $1 AND is_active = true
         ORDER BY usage_count DESC LIMIT 10`,
        [contractorId]
      ),
      query(
        `SELECT DATE(c.created_at) as date, COUNT(*) as count
         FROM chatbot_conversations c
         WHERE c.contractor_id = $1 AND c.created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY DATE(c.created_at) ORDER BY date`,
        [contractorId]
      ),
      query(
        `SELECT AVG((metadata->>'response_time_ms')::numeric) as avg_ms
         FROM chatbot_messages m
         JOIN chatbot_conversations c ON m.conversation_id = c.id
         WHERE c.contractor_id = $1 AND m.sender_type = 'bot' AND m.metadata->>'response_time_ms' IS NOT NULL`,
        [contractorId]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE resolution_type = 'resolved') as resolved,
           COUNT(*) FILTER (WHERE resolution_type = 'escalated') as escalated
         FROM chatbot_conversations WHERE contractor_id = $1`,
        [contractorId]
      ),
      query(
        `SELECT COUNT(*) as total
         FROM chatbot_messages m
         JOIN chatbot_conversations c ON m.conversation_id = c.id
         WHERE c.contractor_id = $1 AND m.sender_type = 'bot' AND m.metadata->>'source' = 'fallback'`,
        [contractorId]
      ),
      query(
        `SELECT AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60) as avg_minutes
         FROM chatbot_conversations
         WHERE contractor_id = $1 AND closed_at IS NOT NULL`,
        [contractorId]
      ),
    ]);

    const resolved = parseInt(resolutionStats.rows[0].resolved) || 0;
    const escalated = parseInt(resolutionStats.rows[0].escalated) || 0;
    const resolutionRate = (resolved + escalated) > 0
      ? Math.round((resolved / (resolved + escalated)) * 100)
      : 0;

    res.json({
      success: true,
      data: {
        totalConversations: parseInt(totalConvs.rows[0].total),
        activeConversations: parseInt(activeConvs.rows[0].total),
        escalatedConversations: parseInt(escalatedConvs.rows[0].total),
        closedConversations: parseInt(closedConvs.rows[0].total),
        totalMessages: parseInt(totalMessages.rows[0].total),
        topKnowledgeBase: topKb.rows,
        dailyStats: dailyStats.rows,
        avgResponseTimeMs: Math.round(parseFloat(avgResponseTime.rows[0].avg_ms) || 0),
        resolutionRate,
        unansweredQueries: parseInt(unansweredCount.rows[0].total),
        avgConversationDurationMinutes: Math.round(parseFloat(avgDuration.rows[0].avg_minutes) || 0),
      },
    });
  } catch (error) {
    logger.error('Error getting analytics:', error);
    res.status(500).json({ success: false, message: 'Hiba az analitika lekérdezése közben' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// TIER 3: Superadmin endpoints
// ═══════════════════════════════════════════════════════════════════════════

// ─── Decision Trees CRUD ────────────────────────────────────────────────────

const getDecisionTrees = async (req, res) => {
  try {
    const contractorId = req.user.roles.includes('superadmin') ? (req.query.contractor_id || req.user.contractorId) : req.user.contractorId;

    const result = await query(
      `SELECT dt.*,
              (SELECT COUNT(*) FROM chatbot_decision_nodes WHERE tree_id = dt.id) as node_count
       FROM chatbot_decision_trees dt
       WHERE dt.contractor_id = $1
       ORDER BY dt.created_at DESC`,
      [contractorId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting decision trees:', error);
    res.status(500).json({ success: false, message: 'Hiba a döntési fák lekérdezése közben' });
  }
};

const getDecisionTree = async (req, res) => {
  try {
    const { id } = req.params;

    const treeResult = await query(`SELECT * FROM chatbot_decision_trees WHERE id = $1`, [id]);
    if (treeResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Döntési fa nem található' });
    }

    const nodes = await query(
      `SELECT * FROM chatbot_decision_nodes WHERE tree_id = $1 ORDER BY sort_order`,
      [id]
    );

    res.json({
      success: true,
      data: { tree: treeResult.rows[0], nodes: nodes.rows },
    });
  } catch (error) {
    logger.error('Error getting decision tree:', error);
    res.status(500).json({ success: false, message: 'Hiba a döntési fa lekérdezése közben' });
  }
};

const createDecisionTree = async (req, res) => {
  try {
    const contractorId = req.user.contractorId;
    const { name, description, trigger_keywords } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Név megadása kötelező' });
    }

    const result = await query(
      `INSERT INTO chatbot_decision_trees (contractor_id, name, description, trigger_keywords)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [contractorId, name, description || '', trigger_keywords || []]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating decision tree:', error);
    res.status(500).json({ success: false, message: 'Hiba a döntési fa létrehozása közben' });
  }
};

const updateDecisionTree = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, trigger_keywords, is_active } = req.body;

    const result = await query(
      `UPDATE chatbot_decision_trees
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           trigger_keywords = COALESCE($3, trigger_keywords),
           is_active = COALESCE($4, is_active)
       WHERE id = $5 RETURNING *`,
      [name, description, trigger_keywords, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Döntési fa nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating decision tree:', error);
    res.status(500).json({ success: false, message: 'Hiba a döntési fa frissítése közben' });
  }
};

const deleteDecisionTree = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM chatbot_decision_trees WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Döntési fa nem található' });
    }

    res.json({ success: true, message: 'Döntési fa törölve' });
  } catch (error) {
    logger.error('Error deleting decision tree:', error);
    res.status(500).json({ success: false, message: 'Hiba a döntési fa törlése közben' });
  }
};

// ─── Decision Nodes CRUD ────────────────────────────────────────────────────

const createDecisionNode = async (req, res) => {
  try {
    const { tree_id, parent_id, node_type, content, sort_order, metadata } = req.body;

    if (!tree_id || !node_type || !content) {
      return res.status(400).json({ success: false, message: 'tree_id, node_type és content megadása kötelező' });
    }

    const result = await query(
      `INSERT INTO chatbot_decision_nodes (tree_id, parent_id, node_type, content, sort_order, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tree_id, parent_id || null, node_type, content, sort_order || 0, JSON.stringify(metadata || {})]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating decision node:', error);
    res.status(500).json({ success: false, message: 'Hiba a csomópont létrehozása közben' });
  }
};

const updateDecisionNode = async (req, res) => {
  try {
    const { id } = req.params;
    const { content, node_type, sort_order, metadata } = req.body;

    const result = await query(
      `UPDATE chatbot_decision_nodes
       SET content = COALESCE($1, content),
           node_type = COALESCE($2, node_type),
           sort_order = COALESCE($3, sort_order),
           metadata = COALESCE($4, metadata)
       WHERE id = $5 RETURNING *`,
      [content, node_type, sort_order, metadata ? JSON.stringify(metadata) : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Csomópont nem található' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating decision node:', error);
    res.status(500).json({ success: false, message: 'Hiba a csomópont frissítése közben' });
  }
};

const deleteDecisionNode = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM chatbot_decision_nodes WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Csomópont nem található' });
    }

    res.json({ success: true, message: 'Csomópont törölve' });
  } catch (error) {
    logger.error('Error deleting decision node:', error);
    res.status(500).json({ success: false, message: 'Hiba a csomópont törlése közben' });
  }
};

// ─── FAQ Categories CRUD ────────────────────────────────────────────────────

const getFaqCategories = async (req, res) => {
  try {
    const isSuperAdmin = req.user.roleNames?.includes('superadmin') || req.user.roles?.includes('superadmin');
    const contractorId = isSuperAdmin ? (req.query.contractor_id || null) : req.user.contractorId;

    const result = await query(
      `SELECT fc.*,
              (SELECT COUNT(*) FROM chatbot_knowledge_base WHERE category_id = fc.id) as entry_count
       FROM chatbot_faq_categories fc
       WHERE ($1::uuid IS NULL OR fc.contractor_id = $1)
       ORDER BY fc.sort_order, fc.name`,
      [contractorId]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error getting FAQ categories:', error);
    res.status(500).json({ success: false, message: 'Hiba a GYIK kategóriák lekérdezése közben' });
  }
};

const createFaqCategory = async (req, res) => {
  try {
    const contractorId = req.user.contractorId;
    const { name, slug, description, icon, color, sort_order } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Név megadása kötelező' });
    }

    const categorySlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    const result = await query(
      `INSERT INTO chatbot_faq_categories (contractor_id, name, slug, description, icon, color, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [contractorId, name, categorySlug, description || '', icon || 'help', color || '#3b82f6', sort_order || 0]
    );

    chatbotService.invalidateFaqCategoryCache(contractorId);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating FAQ category:', error);
    res.status(500).json({ success: false, message: 'Hiba a kategória létrehozása közben' });
  }
};

const updateFaqCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, icon, color, sort_order, is_active } = req.body;

    const result = await query(
      `UPDATE chatbot_faq_categories
       SET name = COALESCE($1, name),
           slug = COALESCE($2, slug),
           description = COALESCE($3, description),
           icon = COALESCE($4, icon),
           color = COALESCE($5, color),
           sort_order = COALESCE($6, sort_order),
           is_active = COALESCE($7, is_active)
       WHERE id = $8 RETURNING *`,
      [name, slug, description, icon, color, sort_order, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategória nem található' });
    }

    chatbotService.invalidateFaqCategoryCache(req.user.contractorId);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating FAQ category:', error);
    res.status(500).json({ success: false, message: 'Hiba a kategória frissítése közben' });
  }
};

const reorderFaqCategories = async (req, res) => {
  try {
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'orderedIds tömb megadása kötelező' });
    }

    await transaction(async (client) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          `UPDATE chatbot_faq_categories SET sort_order = $1 WHERE id = $2`,
          [i, orderedIds[i]]
        );
      }
    });

    chatbotService.invalidateFaqCategoryCache(req.user.contractorId);

    res.json({ success: true, message: 'Sorrend frissítve' });
  } catch (error) {
    logger.error('Error reordering FAQ categories:', error);
    res.status(500).json({ success: false, message: 'Hiba a sorrend frissítése közben' });
  }
};

const deleteFaqCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM chatbot_faq_categories WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategória nem található' });
    }

    chatbotService.invalidateFaqCategoryCache(req.user.contractorId);

    res.json({ success: true, message: 'Kategória törölve' });
  } catch (error) {
    logger.error('Error deleting FAQ category:', error);
    res.status(500).json({ success: false, message: 'Hiba a kategória törlése közben' });
  }
};

// ─── Config ─────────────────────────────────────────────────────────────────

const getConfig = async (req, res) => {
  try {
    const contractorId = req.user.roles.includes('superadmin') ? (req.query.contractor_id || req.user.contractorId) : req.user.contractorId;

    const result = await query(
      `SELECT * FROM chatbot_config WHERE contractor_id = $1`,
      [contractorId]
    );

    if (result.rows.length === 0) {
      // Return defaults
      return res.json({
        success: true,
        data: {
          contractor_id: contractorId,
          welcome_message: 'Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.',
          fallback_message: 'Sajnos nem találtam megfelelő választ. Szeretné, ha továbbítanám kérdését egy munkatársunknak?',
          escalation_message: 'Kérdését továbbítottam munkatársainknak. Hamarosan felvesszük Önnel a kapcsolatot egy hibajegyen keresztül.',
          keyword_threshold: 1,
          is_active: true,
        },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error getting config:', error);
    res.status(500).json({ success: false, message: 'Hiba a konfiguráció lekérdezése közben' });
  }
};

const updateConfig = async (req, res) => {
  try {
    const contractorId = req.user.roles.includes('superadmin') ? (req.body.contractor_id || req.user.contractorId) : req.user.contractorId;
    const { welcome_message, fallback_message, escalation_message, keyword_threshold, is_active } = req.body;

    const result = await query(
      `INSERT INTO chatbot_config (contractor_id, welcome_message, fallback_message, escalation_message, keyword_threshold, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (contractor_id) DO UPDATE SET
         welcome_message = COALESCE($2, chatbot_config.welcome_message),
         fallback_message = COALESCE($3, chatbot_config.fallback_message),
         escalation_message = COALESCE($4, chatbot_config.escalation_message),
         keyword_threshold = COALESCE($5, chatbot_config.keyword_threshold),
         is_active = COALESCE($6, chatbot_config.is_active)
       RETURNING *`,
      [
        contractorId,
        welcome_message || 'Üdvözlöm! Miben segíthetek?',
        fallback_message || 'Sajnos nem találtam választ.',
        escalation_message || 'Kérdését továbbítottam.',
        keyword_threshold || 1,
        is_active !== undefined ? is_active : true,
      ]
    );

    // Invalidate config cache
    chatbotService.invalidateConfigCache(contractorId);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating config:', error);
    res.status(500).json({ success: false, message: 'Hiba a konfiguráció mentése közben' });
  }
};

// ─── Global Analytics (superadmin) ──────────────────────────────────────────

const getGlobalAnalytics = async (req, res) => {
  try {
    const [totalConvs, byStatus, byContractor, dailyGlobal] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM chatbot_conversations`),
      query(`SELECT status, COUNT(*) as count FROM chatbot_conversations GROUP BY status`),
      query(
        `SELECT co.name as contractor_name, COUNT(c.id) as conversation_count
         FROM chatbot_conversations c
         JOIN contractors co ON c.contractor_id = co.id
         GROUP BY co.name ORDER BY conversation_count DESC LIMIT 10`
      ),
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM chatbot_conversations
         WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY DATE(created_at) ORDER BY date`
      ),
    ]);

    res.json({
      success: true,
      data: {
        totalConversations: parseInt(totalConvs.rows[0].total),
        byStatus: byStatus.rows,
        byContractor: byContractor.rows,
        dailyStats: dailyGlobal.rows,
      },
    });
  } catch (error) {
    logger.error('Error getting global analytics:', error);
    res.status(500).json({ success: false, message: 'Hiba a globális analitika lekérdezése közben' });
  }
};

module.exports = {
  // Tier 1
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  escalateConversation,
  closeConversation,
  getUserFaqCategories,
  getUserFaqEntries,
  selectSuggestion,
  submitFeedback,
  // Tier 2
  adminGetConversations,
  adminGetConversationDetail,
  getKnowledgeBase,
  createKnowledgeBaseEntry,
  updateKnowledgeBaseEntry,
  deleteKnowledgeBaseEntry,
  bulkActionKnowledgeBase,
  getAnalytics,
  // Tier 3
  getDecisionTrees,
  getDecisionTree,
  createDecisionTree,
  updateDecisionTree,
  deleteDecisionTree,
  createDecisionNode,
  updateDecisionNode,
  deleteDecisionNode,
  getFaqCategories,
  createFaqCategory,
  updateFaqCategory,
  deleteFaqCategory,
  reorderFaqCategories,
  getConfig,
  updateConfig,
  getGlobalAnalytics,
};
