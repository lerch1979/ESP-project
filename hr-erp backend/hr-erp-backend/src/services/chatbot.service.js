const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { TTLCache } = require('../utils/cache');

// ─── Cache instances ─────────────────────────────────────────────────────────

const configCache = new TTLCache(5 * 60 * 1000);
const faqCategoryCache = new TTLCache(5 * 60 * 1000);

// ─── Hungarian accent normalization ─────────────────────────────────────────

const ACCENT_MAP = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ö': 'o', 'ő': 'o',
  'ú': 'u', 'ü': 'u', 'ű': 'u',
  'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ö': 'o', 'Ő': 'o',
  'Ú': 'u', 'Ü': 'u', 'Ű': 'u',
};

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, (ch) => ACCENT_MAP[ch] || ch)
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function extractWords(text) {
  return normalizeText(text).split(/\s+/).filter(w => w.length > 1);
}

// ─── Input sanitization ─────────────────────────────────────────────────────

function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return null;
  // Strip HTML tags
  let cleaned = text.replace(/<[^>]*>/g, '');
  // Trim whitespace
  cleaned = cleaned.trim();
  // Enforce 2000 char max
  if (cleaned.length > 2000) {
    cleaned = cleaned.substring(0, 2000);
  }
  if (cleaned.length === 0) return null;
  return cleaned;
}

// ─── Config with caching ────────────────────────────────────────────────────

async function getContractorConfig(contractorId) {
  const cacheKey = `config_${contractorId}`;
  const cached = configCache.get(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT * FROM chatbot_config WHERE contractor_id = $1 AND is_active = true`,
    [contractorId]
  );

  const config = result.rows[0] || null;
  if (config) {
    configCache.set(cacheKey, config);
  }
  return config;
}

async function getWelcomeMessage(contractorId) {
  const config = await getContractorConfig(contractorId);
  return config?.welcome_message ||
    'Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.';
}

async function getFallbackMessage(contractorId) {
  const config = await getContractorConfig(contractorId);
  return config?.fallback_message ||
    'Sajnos nem találtam megfelelő választ. Szeretné, ha továbbítanám kérdését egy munkatársunknak?';
}

async function getEscalationMessage(contractorId) {
  const config = await getContractorConfig(contractorId);
  return config?.escalation_message ||
    'Kérdését továbbítottam munkatársainknak. Hamarosan felvesszük Önnel a kapcsolatot egy hibajegyen keresztül.';
}

async function getKeywordThreshold(contractorId) {
  const config = await getContractorConfig(contractorId);
  return config?.keyword_threshold || 1;
}

function invalidateConfigCache(contractorId) {
  configCache.delete(`config_${contractorId}`);
}

// ─── Knowledge Base matching (FTS + trigram) ────────────────────────────────

async function matchKnowledgeBase(text, contractorId, contextKeywords) {
  const userWords = extractWords(text);
  if (userWords.length === 0) return null;

  const threshold = await getKeywordThreshold(contractorId);

  // Build combined words from user input + optional context keywords
  let allWords = [...userWords];
  if (contextKeywords && contextKeywords.length > 0) {
    allWords = [...new Set([...allWords, ...contextKeywords])];
  }

  // Build tsquery with prefix matching: word1:* | word2:* | ...
  const tsqueryTerms = allWords.map(w => `${w}:*`).join(' | ');

  const result = await query(
    `SELECT id, question, answer, keywords, priority,
            ts_rank(search_vector, to_tsquery('simple', $2)) * 2 AS fts_score,
            similarity(LOWER(question), $3) AS trgm_score,
            (ts_rank(search_vector, to_tsquery('simple', $2)) * 2 + similarity(LOWER(question), $3) + COALESCE(priority, 0) * 0.1) AS combined_score
     FROM chatbot_knowledge_base
     WHERE contractor_id = $1 AND is_active = true
       AND (search_vector @@ to_tsquery('simple', $2) OR similarity(LOWER(question), $3) > 0.15)
     ORDER BY combined_score DESC
     LIMIT 1`,
    [contractorId, tsqueryTerms, normalizeText(text)]
  );

  const bestMatch = result.rows[0];
  if (bestMatch && bestMatch.combined_score >= threshold * 0.8) {
    // Increment usage count
    await query(
      `UPDATE chatbot_knowledge_base SET usage_count = usage_count + 1 WHERE id = $1`,
      [bestMatch.id]
    );
    return bestMatch;
  }

  return null;
}

// ─── Suggestions ("Did you mean?") ──────────────────────────────────────────

async function getSuggestions(text, contractorId) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const result = await query(
    `SELECT id, question, answer,
            similarity(LOWER(question), $2) AS score
     FROM chatbot_knowledge_base
     WHERE contractor_id = $1 AND is_active = true
       AND similarity(LOWER(question), $2) > 0.2
     ORDER BY score DESC
     LIMIT 3`,
    [contractorId, normalized]
  );

  return result.rows;
}

// ─── Conversation context ───────────────────────────────────────────────────

const FOLLOW_UP_PATTERNS = [
  /^(és|es)\??$/i,
  /^mi van vele\??$/i,
  /^hogyan\??$/i,
  /^miért\??$/i,
  /^mikor\??$/i,
  /^mennyi\??$/i,
  /^igen$/i,
  /^nem$/i,
  /^pontosan\??$/i,
  /^részletesebben\??$/i,
  /^mi az\??$/i,
];

async function getConversationContext(conversationId) {
  const result = await query(
    `SELECT sender_type, content FROM chatbot_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [conversationId]
  );

  const messages = result.rows;
  const userMessages = messages.filter(m => m.sender_type === 'user');

  // Extract keywords from recent user messages
  const contextKeywords = [];
  for (const msg of userMessages.slice(0, 3)) {
    const words = extractWords(msg.content);
    contextKeywords.push(...words);
  }
  const uniqueKeywords = [...new Set(contextKeywords)];

  // Detect follow-up patterns in the most recent user message
  const latestUserMsg = userMessages[0]?.content || '';
  const trimmed = latestUserMsg.trim();
  const isFollowUp = trimmed.length < 20 && FOLLOW_UP_PATTERNS.some(p => p.test(trimmed));

  return { contextKeywords: uniqueKeywords, isFollowUp };
}

// ─── Decision tree matching ─────────────────────────────────────────────────

async function matchDecisionTree(text, contractorId) {
  const userWords = extractWords(text);
  if (userWords.length === 0) return null;

  const result = await query(
    `SELECT id, name, trigger_keywords
     FROM chatbot_decision_trees
     WHERE contractor_id = $1 AND is_active = true`,
    [contractorId]
  );

  for (const tree of result.rows) {
    const treeKeywords = (tree.trigger_keywords || []).map(k => normalizeText(k));
    for (const word of userWords) {
      for (const keyword of treeKeywords) {
        if (keyword === word || keyword.includes(word) || word.includes(keyword)) {
          return tree;
        }
      }
    }
  }

  return null;
}

// ─── Tree navigation ────────────────────────────────────────────────────────

async function getRootNode(treeId) {
  const result = await query(
    `SELECT * FROM chatbot_decision_nodes
     WHERE tree_id = $1 AND node_type = 'root'
     ORDER BY sort_order LIMIT 1`,
    [treeId]
  );
  return result.rows[0] || null;
}

async function getChildNodes(parentId) {
  const result = await query(
    `SELECT * FROM chatbot_decision_nodes
     WHERE parent_id = $1
     ORDER BY sort_order`,
    [parentId]
  );
  return result.rows;
}

async function getNodeById(nodeId) {
  const result = await query(
    `SELECT * FROM chatbot_decision_nodes WHERE id = $1`,
    [nodeId]
  );
  return result.rows[0] || null;
}

async function navigateTree(conversationId, selectedNodeId) {
  const node = await getNodeById(selectedNodeId);
  if (!node) return null;

  const children = await getChildNodes(selectedNodeId);

  if (node.node_type === 'answer' || children.length === 0) {
    // Terminal node — clear tree state
    await query(
      `UPDATE chatbot_conversations SET current_tree_id = NULL, current_node_id = NULL WHERE id = $1`,
      [conversationId]
    );
    return { type: 'answer', content: node.content, options: [] };
  }

  // Update current position
  await query(
    `UPDATE chatbot_conversations SET current_node_id = $1 WHERE id = $2`,
    [selectedNodeId, conversationId]
  );

  // If children are options, return them
  const options = children.filter(c => c.node_type === 'option' || c.node_type === 'question' || c.node_type === 'answer');

  if (options.length > 0) {
    return {
      type: 'question',
      content: node.content,
      options: options.map(o => ({ id: o.id, label: o.content, node_type: o.node_type })),
    };
  }

  return { type: 'answer', content: node.content, options: [] };
}

async function startTree(conversationId, treeId) {
  const root = await getRootNode(treeId);
  if (!root) return null;

  // Update conversation tree state
  await query(
    `UPDATE chatbot_conversations SET current_tree_id = $1, current_node_id = $2 WHERE id = $3`,
    [treeId, root.id, conversationId]
  );

  // Increment usage
  await query(
    `UPDATE chatbot_decision_trees SET usage_count = usage_count + 1 WHERE id = $1`,
    [treeId]
  );

  const children = await getChildNodes(root.id);

  return {
    type: 'question',
    content: root.content,
    options: children.map(c => ({ id: c.id, label: c.content, node_type: c.node_type })),
  };
}

// ─── FAQ browsing (with caching) ────────────────────────────────────────────

async function getFaqCategories(contractorId) {
  const cacheKey = `faq_categories_${contractorId}`;
  const cached = faqCategoryCache.get(cacheKey);
  if (cached) return cached;

  const result = await query(
    `SELECT id, name, slug, description, icon, color, sort_order
     FROM chatbot_faq_categories
     WHERE contractor_id = $1 AND is_active = true
     ORDER BY sort_order, name`,
    [contractorId]
  );

  faqCategoryCache.set(cacheKey, result.rows);
  return result.rows;
}

function invalidateFaqCategoryCache(contractorId) {
  faqCategoryCache.delete(`faq_categories_${contractorId}`);
}

async function getFaqEntries(contractorId, categoryId, search) {
  let sql = `SELECT kb.id, kb.question, kb.answer, kb.keywords, fc.name as category_name
             FROM chatbot_knowledge_base kb
             LEFT JOIN chatbot_faq_categories fc ON kb.category_id = fc.id
             WHERE kb.contractor_id = $1 AND kb.is_active = true`;
  const params = [contractorId];
  let idx = 2;

  if (categoryId) {
    sql += ` AND kb.category_id = $${idx}`;
    params.push(categoryId);
    idx++;
  }

  if (search) {
    sql += ` AND (kb.question ILIKE $${idx} OR kb.answer ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  sql += ' ORDER BY kb.priority DESC, kb.question';

  const result = await query(sql, params);
  return result.rows;
}

// ─── Escalation ─────────────────────────────────────────────────────────────

async function createEscalationTicket(conversationId, userId, contractorId) {
  return await transaction(async (client) => {
    // Get conversation with messages
    const convResult = await client.query(
      `SELECT * FROM chatbot_conversations WHERE id = $1`,
      [conversationId]
    );
    const conversation = convResult.rows[0];
    if (!conversation) throw new Error('Conversation not found');

    const messagesResult = await client.query(
      `SELECT sender_type, content, created_at FROM chatbot_messages
       WHERE conversation_id = $1 ORDER BY created_at`,
      [conversationId]
    );

    // Build transcript
    const transcript = messagesResult.rows.map(m => {
      const sender = m.sender_type === 'user' ? 'Felhasználó' : m.sender_type === 'bot' ? 'Bot' : 'Rendszer';
      return `[${sender}]: ${m.content}`;
    }).join('\n');

    // Find default status (new)
    const statusResult = await client.query(
      `SELECT id FROM ticket_statuses WHERE slug = 'new' LIMIT 1`
    );
    const statusId = statusResult.rows[0]?.id;

    // Find default priority (normal)
    const priorityResult = await client.query(
      `SELECT id FROM priorities WHERE slug = 'normal' LIMIT 1`
    );
    const priorityId = priorityResult.rows[0]?.id;

    // Find general category
    const categoryResult = await client.query(
      `SELECT id FROM ticket_categories WHERE contractor_id = $1 ORDER BY created_at LIMIT 1`,
      [contractorId]
    );
    const categoryId = categoryResult.rows[0]?.id;

    // Generate ticket number using sequence (race-condition-safe)
    const seqResult = await client.query(`SELECT nextval('ticket_number_seq') AS num`);
    const ticketNumber = `#${seqResult.rows[0].num}`;

    // Create ticket
    const ticketResult = await client.query(
      `INSERT INTO tickets (contractor_id, ticket_number, title, description, category_id, status_id, priority_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        contractorId,
        ticketNumber,
        `Chatbot eszkaláció: ${conversation.title}`,
        `Automatikusan létrehozott hibajegy a chatbot beszélgetésből.\n\n--- Beszélgetés átirat ---\n${transcript}`,
        categoryId,
        statusId,
        priorityId,
        userId,
      ]
    );
    const ticketId = ticketResult.rows[0].id;

    // Add ticket history
    await client.query(
      `INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
       VALUES ($1, $2, 'created', $3)`,
      [ticketId, userId, ticketNumber]
    );

    // Update conversation with resolution_type = 'escalated'
    await client.query(
      `UPDATE chatbot_conversations SET status = 'escalated', escalation_ticket_id = $1, resolution_type = 'escalated', current_tree_id = NULL, current_node_id = NULL WHERE id = $2`,
      [ticketId, conversationId]
    );

    return { ticketId, ticketNumber };
  });
}

// ─── Main message processing ────────────────────────────────────────────────

async function processMessage(conversationId, userText, userId, contractorId) {
  // 1. Input validation via sanitizeInput
  const cleanText = sanitizeInput(userText);
  if (!cleanText) {
    return {
      content: 'Az üzenet nem dolgozható fel.',
      message_type: 'text',
      metadata: {},
    };
  }

  // 2. Check if we're in a decision tree
  const convResult = await query(
    `SELECT current_tree_id, current_node_id, status FROM chatbot_conversations WHERE id = $1`,
    [conversationId]
  );
  const conversation = convResult.rows[0];
  if (!conversation) throw new Error('Conversation not found');
  if (conversation.status !== 'active') {
    return {
      content: 'Ez a beszélgetés már lezárult.',
      message_type: 'text',
      metadata: {},
    };
  }

  // 3. If in a tree, try to navigate (user may have typed the option text or selected an option ID)
  if (conversation.current_tree_id && conversation.current_node_id) {
    // Check if userText is a node ID (UUID format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(cleanText)) {
      const treeResult = await navigateTree(conversationId, cleanText);
      if (treeResult) {
        if (treeResult.type === 'answer') {
          return {
            content: treeResult.content,
            message_type: 'text',
            metadata: { source: 'decision_tree' },
          };
        }
        return {
          content: treeResult.content,
          message_type: 'options',
          metadata: { options: treeResult.options, source: 'decision_tree' },
        };
      }
    }

    // Try matching option text
    const children = await getChildNodes(conversation.current_node_id);
    const normalizedInput = normalizeText(cleanText);
    const matchedChild = children.find(c => normalizeText(c.content) === normalizedInput);
    if (matchedChild) {
      const treeResult = await navigateTree(conversationId, matchedChild.id);
      if (treeResult) {
        if (treeResult.type === 'answer') {
          return {
            content: treeResult.content,
            message_type: 'text',
            metadata: { source: 'decision_tree' },
          };
        }
        return {
          content: treeResult.content,
          message_type: 'options',
          metadata: { options: treeResult.options, source: 'decision_tree' },
        };
      }
    }

    // Exit tree if input doesn't match
    await query(
      `UPDATE chatbot_conversations SET current_tree_id = NULL, current_node_id = NULL WHERE id = $1`,
      [conversationId]
    );
  }

  // 4. Get conversation context for follow-up detection
  const { contextKeywords, isFollowUp } = await getConversationContext(conversationId);

  // 5. KB matching with FTS + trigram (pass context keywords for follow-ups)
  const kbMatch = await matchKnowledgeBase(
    cleanText,
    contractorId,
    isFollowUp ? contextKeywords : undefined
  );
  if (kbMatch) {
    return {
      content: kbMatch.answer,
      message_type: 'text',
      metadata: { source: 'knowledge_base', kb_id: kbMatch.id, question: kbMatch.question },
    };
  }

  // 6. Try decision tree trigger matching
  const treeMatch = await matchDecisionTree(cleanText, contractorId);
  if (treeMatch) {
    const treeResult = await startTree(conversationId, treeMatch.id);
    if (treeResult) {
      return {
        content: treeResult.content,
        message_type: 'options',
        metadata: { options: treeResult.options, source: 'decision_tree', tree_id: treeMatch.id },
      };
    }
  }

  // 7. "Did you mean?" suggestions
  const suggestions = await getSuggestions(cleanText, contractorId);
  if (suggestions.length > 0) {
    return {
      content: 'Erre gondolt esetleg?',
      message_type: 'suggestions',
      metadata: {
        source: 'suggestions',
        suggestions: suggestions.map(s => ({
          kb_id: s.id,
          question: s.question,
          score: s.score,
        })),
      },
    };
  }

  // 8. Fallback
  const fallbackMsg = await getFallbackMessage(contractorId);
  return {
    content: fallbackMsg,
    message_type: 'text',
    metadata: { source: 'fallback' },
  };
}

// ─── Search FAQ ─────────────────────────────────────────────────────────────

async function searchFaq(contractorId, searchText) {
  if (!searchText || searchText.trim().length < 2) return [];

  const result = await query(
    `SELECT kb.id, kb.question, kb.answer, fc.name as category_name, fc.icon, fc.color
     FROM chatbot_knowledge_base kb
     LEFT JOIN chatbot_faq_categories fc ON kb.category_id = fc.id
     WHERE kb.contractor_id = $1 AND kb.is_active = true
       AND (kb.question ILIKE $2 OR kb.answer ILIKE $2)
     ORDER BY kb.priority DESC, kb.question
     LIMIT 20`,
    [contractorId, `%${searchText}%`]
  );
  return result.rows;
}

module.exports = {
  getWelcomeMessage,
  getFallbackMessage,
  getEscalationMessage,
  matchKnowledgeBase,
  matchDecisionTree,
  navigateTree,
  startTree,
  getRootNode,
  getChildNodes,
  getNodeById,
  getFaqCategories,
  getFaqEntries,
  searchFaq,
  createEscalationTicket,
  processMessage,
  normalizeText,
  extractWords,
  sanitizeInput,
  getSuggestions,
  getConversationContext,
  invalidateConfigCache,
  invalidateFaqCategoryCache,
};
