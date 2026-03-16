/**
 * Claude AI Service — Semantic search & NLU for chatbot
 *
 * Provides:
 *   - semanticMatch(): Find best FAQ for a user question using Claude
 *   - enhanceResponse(): Polish a raw FAQ answer for the user
 *   - generateContextualResponse(): Answer using conversation history
 *
 * Fallback: All methods return null on failure so callers can
 *           fall back to keyword-based matching.
 */

const { logger } = require('../utils/logger');
const { TTLCache } = require('../utils/cache');

// ─── Configuration ──────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const CLAUDE_MAX_TOKENS = parseInt(process.env.CLAUDE_MAX_TOKENS) || 1024;

// Rate limiting: token bucket (50 req/min)
const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
let rateLimitTokens = RATE_LIMIT_MAX;
let rateLimitLastRefill = Date.now();

// Cache for semantic matches (5 min TTL)
const semanticCache = new TTLCache(5 * 60 * 1000);

// ─── Helpers ────────────────────────────────────────────────────────────────

function isAvailable() {
  return !!(ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.length > 10 && !ANTHROPIC_API_KEY.includes('placeholder'));
}

function checkRateLimit() {
  const now = Date.now();
  const elapsed = now - rateLimitLastRefill;
  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    rateLimitTokens = RATE_LIMIT_MAX;
    rateLimitLastRefill = now;
  }
  if (rateLimitTokens <= 0) return false;
  rateLimitTokens--;
  return true;
}

function getClient() {
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

async function callClaude(systemPrompt, userMessage, maxTokens) {
  if (!isAvailable()) return null;
  if (!checkRateLimit()) {
    logger.warn('[Claude] Rate limit exceeded, skipping AI call');
    return null;
  }

  const startTime = Date.now();
  try {
    const client = getClient();
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens || CLAUDE_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0]?.text || '';
    const elapsed = Date.now() - startTime;
    const usage = response.usage || {};

    logger.info('[Claude] API call', {
      model: CLAUDE_MODEL,
      elapsed_ms: elapsed,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      stop_reason: response.stop_reason,
    });

    return text;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error('[Claude] API error', {
      error: err.message,
      status: err.status,
      elapsed_ms: elapsed,
    });
    return null;
  }
}

// ─── Semantic FAQ Matching ──────────────────────────────────────────────────

const SEMANTIC_MATCH_SYSTEM = `Ön egy magyar nyelvű HR rendszer chatbot asszisztense. A feladata: a felhasználó kérdéséhez megtalálni a legjobban illeszkedő GYIK (FAQ) bejegyzést.

Szabályok:
- Válaszoljon KIZÁRÓLAG egy JSON objektummal, semmi mással.
- Ha van jól illeszkedő GYIK, adja vissza: {"match": <szám>, "confidence": <0-100>}
- Ha NINCS jól illeszkedő GYIK, adja vissza: {"match": 0, "confidence": 0}
- A confidence értéke 0-100 között legyen (100 = tökéletes egyezés).
- Figyeljen a szinonimákra és a magyar nyelv ragozására.
- Ne találjon egyezést erőltetetten — jobb ha 0-t ad vissza, mint egy rossz találatot.`;

/**
 * Use Claude to find the best matching FAQ for a user question.
 *
 * @param {string} userMessage - The user's question
 * @param {Array} faqs - Array of {id, question, answer, keywords} objects
 * @returns {Object|null} - {faqIndex, confidence} or null on failure
 */
async function semanticMatch(userMessage, faqs) {
  if (!isAvailable() || !faqs || faqs.length === 0) return null;

  // Check cache
  const cacheKey = `sem_${userMessage.toLowerCase().trim().substring(0, 100)}`;
  const cached = semanticCache.get(cacheKey);
  if (cached) {
    logger.debug('[Claude] Semantic cache hit', { cacheKey });
    return cached;
  }

  // Build FAQ list for the prompt
  const faqList = faqs.map((f, i) => `${i + 1}. ${f.question}`).join('\n');

  const userPrompt = `Felhasználó kérdése: "${userMessage}"

GYIK lista:
${faqList}

Melyik GYIK illik legjobban? Válaszoljon JSON-nel: {"match": <szám vagy 0>, "confidence": <0-100>}`;

  const response = await callClaude(SEMANTIC_MATCH_SYSTEM, userPrompt, 100);
  if (!response) return null;

  try {
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const matchIndex = parseInt(parsed.match);
    const confidence = Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0));

    if (isNaN(matchIndex) || matchIndex < 0 || matchIndex > faqs.length) return null;

    const result = { faqIndex: matchIndex, confidence };
    semanticCache.set(cacheKey, result);

    logger.info('[Claude] Semantic match', {
      question: userMessage.substring(0, 80),
      matchIndex,
      confidence,
      matchedFaq: matchIndex > 0 ? faqs[matchIndex - 1]?.question?.substring(0, 60) : 'none',
    });

    return result;
  } catch (err) {
    logger.warn('[Claude] Failed to parse semantic match response', {
      response: response.substring(0, 200),
      error: err.message,
    });
    return null;
  }
}

// ─── Enhanced Response Generation ───────────────────────────────────────────

const ENHANCE_SYSTEM = `Ön egy segítőkész magyar nyelvű HR asszisztens. A feladata: a megadott FAQ választ természetesebben, személyesebben fogalmazza újra a felhasználó kérdésének kontextusában.

Szabályok:
- Tartsa meg az eredeti válasz ÖSSZES lényegi információját.
- Ne találjon ki új információt.
- Legyen barátságos és professzionális.
- Használjon tegező vagy önöző formát a kontextusnak megfelelően (alapértelmezetten önöző).
- Maximum 3-4 mondat.
- Ha a válasz lépéseket tartalmaz, tartsa meg a lépéseket.
- Adjon hozzá 1-2 kapcsolódó javaslatot "Kapcsolódó kérdések:" formátumban.`;

/**
 * Enhance a raw FAQ answer using Claude.
 *
 * @param {string} userQuestion - What the user asked
 * @param {string} faqAnswer - The raw FAQ answer
 * @param {Array} conversationHistory - Recent messages [{role, content}]
 * @returns {Object|null} - {enhancedAnswer, suggestions} or null
 */
async function enhanceResponse(userQuestion, faqAnswer, conversationHistory) {
  if (!isAvailable()) return null;

  const historyText = (conversationHistory || [])
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'Felhasználó' : 'Bot'}: ${m.content.substring(0, 200)}`)
    .join('\n');

  const userPrompt = `${historyText ? `Korábbi beszélgetés:\n${historyText}\n\n` : ''}Felhasználó kérdése: "${userQuestion}"

Eredeti FAQ válasz:
${faqAnswer}

Fogalmazza újra természetesebben, és javasoljon kapcsolódó kérdéseket.`;

  const response = await callClaude(ENHANCE_SYSTEM, userPrompt, 512);
  if (!response) return null;

  // Split response: main answer and suggestions
  const parts = response.split(/kapcsol[oó]d[oó] k[eé]rd[eé]sek:?/i);
  const enhancedAnswer = (parts[0] || response).trim();
  const suggestionsRaw = parts[1] || '';

  const suggestions = suggestionsRaw
    .split('\n')
    .map(s => s.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(s => s.length > 5 && s.length < 200)
    .slice(0, 3);

  return { enhancedAnswer, suggestions };
}

// ─── Contextual Response (no FAQ match) ─────────────────────────────────────

const CONTEXTUAL_SYSTEM = `Ön egy magyar nyelvű HR rendszer chatbot asszisztense. Segítsen a felhasználónak a kérdésével.

Szabályok:
- Válaszoljon KIZÁRÓLAG JSON-nel: {"answer": "...", "confidence": <0-100>, "suggestions": ["...", "..."]}
- Ha nem tud segíteni, állítsa a confidence értéket 0-ra és javasolja az eszkalációt.
- NE találjon ki konkrét szabályzatokat, összegeket vagy dátumokat.
- Ha a kérdés az adott HR rendszerre specifikus, mondja, hogy nem rendelkezik ezzel az információval.
- Legyen barátságos, rövid (2-3 mondat max).
- A suggestions mezőben javasoljon 1-2 kapcsolódó kérdést amit a felhasználó feltesz.`;

/**
 * Generate a contextual response when no FAQ matches.
 *
 * @param {string} userMessage - The user's question
 * @param {Array} conversationHistory - Recent messages [{role, content}]
 * @returns {Object|null} - {answer, confidence, suggestions} or null
 */
async function generateContextualResponse(userMessage, conversationHistory) {
  if (!isAvailable()) return null;

  const historyText = (conversationHistory || [])
    .slice(-6)
    .map(m => `${m.role === 'user' ? 'Felhasználó' : 'Bot'}: ${m.content.substring(0, 200)}`)
    .join('\n');

  const userPrompt = `${historyText ? `Korábbi beszélgetés:\n${historyText}\n\n` : ''}Felhasználó kérdése: "${userMessage}"`;

  const response = await callClaude(CONTEXTUAL_SYSTEM, userPrompt, 300);
  if (!response) return null;

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      answer: parsed.answer || null,
      confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [],
    };
  } catch (err) {
    logger.warn('[Claude] Failed to parse contextual response', {
      response: response.substring(0, 200),
      error: err.message,
    });
    return null;
  }
}

// ─── Cache management ───────────────────────────────────────────────────────

function invalidateSemanticCache() {
  semanticCache.clear();
}

function getStats() {
  return {
    available: isAvailable(),
    model: CLAUDE_MODEL,
    rateLimitRemaining: rateLimitTokens,
    rateLimitMax: RATE_LIMIT_MAX,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  isAvailable,
  semanticMatch,
  enhanceResponse,
  generateContextualResponse,
  invalidateSemanticCache,
  getStats,
  // Exposed for testing
  _checkRateLimit: checkRateLimit,
  _callClaude: callClaude,
};
