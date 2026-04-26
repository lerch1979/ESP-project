/**
 * AI Assistant — natural-language entry point for mobile users.
 *
 * Pipeline:
 *   1. analyzeMessage()  -> Claude classifies intent + extracts entities,
 *      returns structured JSON (intent, confidence, entities, suggested_action,
 *      user_response).
 *   2. dispatchAction()  -> if confidence >= threshold, run the matching
 *      handler (createTicket / createDamageReport / answerFAQ / queryData /
 *      handleEmergency). Below threshold -> return Claude's plain user_response
 *      and ask for confirmation.
 *   3. The full turn is persisted to ai_assistant_messages.
 *
 * Conservative approach: classic menus stay; this is additive. Failures are
 * always recoverable (the user can use the regular Hibajegyek flow).
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inApp = require('./inAppNotification.service');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

const CONFIDENCE_THRESHOLD = 0.7;

// ─── Rate limiting (per user, per hour + per day) ───────────────────────────
//
// Cheap in-memory token bucket — fine for single-instance dev. For multi-pod
// production, swap for Redis-backed counters.
const RATE_HOUR_MAX = 20;
const RATE_DAY_MAX  = 200;
const _userBuckets = new Map(); // user_id -> { hour: {ts, count}, day: {ts, count} }

function _rateAllowed(userId) {
  const now = Date.now();
  let b = _userBuckets.get(userId);
  if (!b) {
    b = { hour: { ts: now, count: 0 }, day: { ts: now, count: 0 } };
    _userBuckets.set(userId, b);
  }
  if (now - b.hour.ts > 60 * 60 * 1000)        b.hour = { ts: now, count: 0 };
  if (now - b.day.ts  > 24 * 60 * 60 * 1000)   b.day  = { ts: now, count: 0 };
  if (b.hour.count >= RATE_HOUR_MAX) return { ok: false, reason: 'hourly_limit' };
  if (b.day.count  >= RATE_DAY_MAX)  return { ok: false, reason: 'daily_limit' };
  b.hour.count++;
  b.day.count++;
  return { ok: true };
}

// ─── Emergency detection ────────────────────────────────────────────────────
const EMERGENCY_KEYWORDS = [
  // Hungarian
  'tűz', 'tuz', 'füst', 'fust', 'vér', 'ver', 'életveszély', 'eletveszely',
  'mentő', 'mento', 'rendőrség', 'rendorseg', 'segítség', 'segitseg', 'azonnal',
  // English
  'fire', 'smoke', 'blood', 'emergency', 'urgent', 'ambulance', 'police', 'help',
  // Other common languages workers might use
  'fuego', 'humo', 'sangre', 'emergencia', // ES
  'pomoc', 'ogen', 'krew',                  // PL
];

function detectEmergencyKeyword(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return EMERGENCY_KEYWORDS.some(k => t.includes(k));
}

// ─── User profile (for system prompt) ───────────────────────────────────────
async function _loadUserProfile(userId) {
  const result = await query(
    `SELECT
       u.id, u.email, u.first_name, u.last_name, u.preferred_language,
       e.workplace, e.room_number,
       acc.name AS accommodation_name
     FROM users u
     LEFT JOIN employees e ON e.user_id = u.id
     LEFT JOIN accommodations acc ON acc.id = e.accommodation_id
     WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

// ─── Claude call ────────────────────────────────────────────────────────────
function _isAvailable() {
  return !!(ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.length > 10 && !ANTHROPIC_API_KEY.includes('placeholder'));
}

// ─── Category taxonomy ─────────────────────────────────────────────────────
//
// Mirrors migration 102. Kept in code so the prompt stays self-contained and
// we don't need a DB roundtrip per analyze call. If the DB is the source of
// truth for new sub-categories, keep this in sync OR move to a cached load.
const PARENT_CATEGORIES = [
  { slug: 'technical', name: 'Műszaki hiba',        emoji: '🔧' },
  { slug: 'furniture', name: 'Berendezések',        emoji: '🛋️' },
  { slug: 'appliance', name: 'Eszközök',            emoji: '🔌' },
  { slug: 'hygiene',   name: 'Higiénia',            emoji: '🧼' },
  { slug: 'emergency', name: 'Egyéb / Vészhelyzet', emoji: '🚨' },
];

// sub-cat slug -> { parent slug, default specialization, hu name }
const SUB_CATEGORIES = {
  // technical
  tech_electrical:    { parent: 'technical', spec: 'electrical', name: 'Elektromos hálózat' },
  tech_plumbing:      { parent: 'technical', spec: 'plumbing',   name: 'Vízhálózat' },
  tech_heating:       { parent: 'technical', spec: 'heating',    name: 'Fűtés / Hűtés' },
  tech_gas:           { parent: 'technical', spec: 'gas',        name: 'Gáz (vészhelyzet)' },
  tech_other:         { parent: 'technical', spec: 'general',    name: 'Egyéb műszaki' },
  // furniture
  furn_furniture:     { parent: 'furniture', spec: 'furniture',  name: 'Bútorok' },
  furn_doors_windows: { parent: 'furniture', spec: 'furniture',  name: 'Nyílászárók' },
  furn_surfaces:      { parent: 'furniture', spec: 'general',    name: 'Padló / Fal / Mennyezet' },
  // appliance
  appl_large:         { parent: 'appliance', spec: 'general',    name: 'Nagy háztartási' },
  appl_small:         { parent: 'appliance', spec: 'general',    name: 'Kisgépek' },
  appl_electronics:   { parent: 'appliance', spec: 'electrical', name: 'Elektronika' },
  // hygiene
  cleaning:           { parent: 'hygiene',   spec: 'cleaning',   name: 'Takarítás' },
  hyg_pests:          { parent: 'hygiene',   spec: 'cleaning',   name: 'Rovar / Rágcsáló' },
  // emergency / misc
  emrg_emergency:     { parent: 'emergency', spec: 'general',    name: 'Vészhelyzet' },
  emrg_security:      { parent: 'emergency', spec: 'general',    name: 'Biztonsági' },
  accommodation:      { parent: 'emergency', spec: 'general',    name: 'Lakhatási' },
  administration:     { parent: 'emergency', spec: 'general',    name: 'Adminisztráció' },
  workplace:          { parent: 'emergency', spec: 'general',    name: 'Munkahely' },
  medical:            { parent: 'emergency', spec: 'general',    name: 'Egészségügy' },
  moving:             { parent: 'emergency', spec: 'general',    name: 'Költözés' },
  other:              { parent: 'emergency', spec: 'general',    name: 'Egyéb' },
  general:            { parent: 'emergency', spec: 'general',    name: 'Általános' },
};

function _categoryListForPrompt() {
  // Render as a compact, parent-grouped list so Claude can navigate it without
  // exploding the prompt token count.
  const lines = [];
  for (const p of PARENT_CATEGORIES) {
    lines.push(`- ${p.emoji} ${p.slug} — ${p.name}`);
    for (const [slug, meta] of Object.entries(SUB_CATEGORIES)) {
      if (meta.parent === p.slug) {
        lines.push(`    • ${slug} — ${meta.name} (worker: ${meta.spec})`);
      }
    }
  }
  return lines.join('\n');
}

function _buildSystemPrompt(profile) {
  const name = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ')
    : 'Unknown user';
  const lang = profile?.preferred_language || 'hu';

  return `You are a helpful HR assistant for Housing Solutions, an HR-ERP platform.
You help workers report issues, check info, and get help. Many workers speak
Hungarian, English, or Tagalog — respond in the language they used.

User profile:
- Name: ${name}
- Email: ${profile?.email || 'unknown'}
- Accommodation: ${profile?.accommodation_name || 'unknown'}
- Room: ${profile?.room_number || 'unknown'}
- Workplace: ${profile?.workplace || 'unknown'}
- Preferred language: ${lang}

Analyze the user's message and decide:

1. INTENT — one of:
   - "ticket"         report an operational issue (broken faucet, no heating, broken appliance, pest sighting, etc.)
   - "damage_report"  damage to property they want to flag
   - "faq"            general question about rules, schedules, policies, where to find X
   - "data_query"     ask for specific personal data (their next shift, their salary, their room, etc.)
   - "emergency"      urgent / dangerous situation (fire, gas leak, blood, immediate danger)
   - "unknown"        cannot determine — ask for clarification

2. ENTITIES — for ticket / damage_report / emergency, extract ALL of:
   - title:                 short summary in user's language (max 80 chars)
   - description:           detailed restatement in user's language
   - parent_category_slug:  the top-level group, see TAXONOMY below
   - sub_category_slug:     the most specific leaf, see TAXONOMY below — REQUIRED
   - severity:              one of "emergency" | "critical" | "high" | "medium" | "low"
                            • "emergency"   — life/safety threat (gas leak, fire, electrocution risk)
                            • "critical"    — service down, no heat in winter, no water
                            • "high"        — major inconvenience, must be fixed today
                            • "medium"      — annoying, fix this week
                            • "low"         — cosmetic / nice-to-have
   - suggested_worker_type: one of "electrical" | "plumbing" | "heating" | "gas"
                            | "cleaning" | "furniture" | "general"
                            (use the "worker:" hint from the chosen sub-category)
   - estimated_time_hours:  realistic guess for the work, decimal hours (e.g. 0.5, 1, 2, 4)
   - location:              room/area (e.g. "user's bathroom", "kitchen", "hallway")

   GAS RULE: any gas-related issue (gas smell, suspected leak) is ALWAYS
   sub_category_slug="tech_gas" + severity="emergency". Never downgrade.

3. CONFIDENCE — your confidence 0.0–1.0 that the intent is correct.
   Use < 0.7 when the user's message is ambiguous.

TAXONOMY (parent → sub-category → worker spec):
${_categoryListForPrompt()}

Return ONLY JSON, no prose, no markdown fences. Schema:

{
  "intent": "ticket",
  "confidence": 0.95,
  "language_detected": "hu",
  "entities": {
    "title": "Csöpög a csap a fürdőben",
    "description": "A felhasználó jelezte: a fürdőszobai csap csöpög",
    "parent_category_slug": "technical",
    "sub_category_slug": "tech_plumbing",
    "severity": "medium",
    "suggested_worker_type": "plumbing",
    "estimated_time_hours": 0.5,
    "location": "user's bathroom"
  },
  "user_response": "Köszi! Hibajegyet hoztam létre a csöpögő csapra. Vízszerelőt küldünk."
}

For "faq" intent, omit "entities" and put your answer in "user_response".
For "data_query" intent, leave "user_response" empty — the server will fill it.
For "emergency" intent, the server will create a critical-priority ticket and
notify admin; your "user_response" should reassure the user.
For "unknown" intent, ask a clarifying question in user_response.
`;
}

async function _callClaude(systemPrompt, userMessage) {
  if (!_isAvailable()) {
    logger.warn('[aiAssistant] ANTHROPIC_API_KEY not configured — returning fallback');
    return null;
  }
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const start = Date.now();
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const text = response.content[0]?.text || '';
    logger.info('[aiAssistant] Claude call', {
      elapsed_ms: Date.now() - start,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
    });
    return text;
  } catch (err) {
    logger.error('[aiAssistant] Claude error:', {
      message: err.message,
      status: err.status,
      type: err.type,
      model: CLAUDE_MODEL,
    });
    return null;
  }
}

function _parseClaudeJson(text) {
  if (!text) return null;
  // Trim potential ```json fences
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    // Try to extract the first {...} block
    const match = t.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    logger.warn('[aiAssistant] Claude returned non-JSON output');
    return null;
  }
}

/**
 * Analyze a user message and return a structured intent envelope.
 * Returns:
 *   { intent, confidence, entities, user_response, language_detected,
 *     emergency_keyword: bool }
 *
 * On Claude failure: returns a heuristic fallback that flags the message
 * as "unknown" so the caller asks for confirmation.
 */
async function analyzeMessage(userId, message) {
  const profile = await _loadUserProfile(userId);
  const systemPrompt = _buildSystemPrompt(profile);
  const raw = await _callClaude(systemPrompt, message);
  const parsed = _parseClaudeJson(raw);

  const emergency = detectEmergencyKeyword(message);

  if (!parsed) {
    return {
      intent: emergency ? 'emergency' : 'unknown',
      confidence: emergency ? 0.95 : 0.0,
      entities: {},
      user_response: emergency
        ? 'Vészhelyzeti üzenetet észleltem. Azonnal értesítjük az ügyeletet.'
        : 'Nem értettem pontosan, kérlek pontosítsd a kérdést.',
      language_detected: profile?.preferred_language || 'hu',
      emergency_keyword: emergency,
      claude_raw: raw,
    };
  }

  // Force emergency if keyword detected and Claude missed it
  if (emergency && parsed.intent !== 'emergency') {
    parsed.intent = 'emergency';
    parsed.confidence = Math.max(parsed.confidence || 0, 0.9);
  }

  // Normalize entities: the existing aiAssistantHandlers.handleTicket reads
  // `entities.category` to look up ticket_categories.slug. Sub-category slugs
  // ARE the leaf slugs in ticket_categories, so we mirror sub_category_slug
  // into `category` for back-compat. We also fill suggested_worker_type from
  // the taxonomy if Claude omitted it.
  const e = parsed.entities || {};
  const sub = e.sub_category_slug && SUB_CATEGORIES[e.sub_category_slug] ? e.sub_category_slug : null;
  if (sub) {
    e.category = sub;                                 // back-compat
    if (!e.parent_category_slug) e.parent_category_slug = SUB_CATEGORIES[sub].parent;
    if (!e.suggested_worker_type) e.suggested_worker_type = SUB_CATEGORIES[sub].spec;
  }

  return {
    intent: parsed.intent || 'unknown',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    entities: e,
    user_response: parsed.user_response || '',
    language_detected: parsed.language_detected || profile?.preferred_language || 'hu',
    emergency_keyword: emergency,
    claude_raw: raw,
  };
}

module.exports = {
  analyzeMessage,
  detectEmergencyKeyword,
  _loadUserProfile,
  _rateAllowed,
  CONFIDENCE_THRESHOLD,
  PARENT_CATEGORIES,
  SUB_CATEGORIES,
};
