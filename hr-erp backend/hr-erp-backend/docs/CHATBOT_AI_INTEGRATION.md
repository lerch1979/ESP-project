# Chatbot AI Integration (Claude API)

## Overview

The chatbot uses a **tiered matching strategy** that combines fast keyword matching with Claude AI for semantic understanding. The system gracefully degrades when the API key is not configured or when Claude is unavailable.

## Architecture

```
User Question
     │
     ▼
┌─ Keyword Match (fast, free) ─────────────────────────┐
│  scoreEntry() → exact/prefix keyword + question words │
│  Score >= 30 → Return answer (optionally AI-enhanced) │
│  Score >= 15 → Low-confidence match (held for later)  │
└───────────────────────────────────────────────────────┘
     │ No high-confidence keyword match
     ▼
┌─ AI Semantic Search (Claude API) ─────────────────────┐
│  Send question + all FAQs → Claude picks best match   │
│  Confidence >= 50 → Use AI match + enhance response   │
│  Confidence 30-50 → Show with "Was this helpful?"     │
│  Confidence < 30  → Skip                              │
└───────────────────────────────────────────────────────┘
     │ No semantic match
     ▼
┌─ Low-confidence keyword match (score 15-29) ──────────┐
│  Show with low_confidence flag                        │
└───────────────────────────────────────────────────────┘
     │ No match at all
     ▼
┌─ AI Contextual Response ──────────────────────────────┐
│  Claude generates a response using conversation       │
│  history — but won't invent specific HR data          │
│  Confidence >= 40 → Use AI response                   │
│  Confidence < 40  → Skip                              │
└───────────────────────────────────────────────────────┘
     │ AI can't help
     ▼
┌─ Suggestions / Fallback ──────────────────────────────┐
│  Trigram similarity → "Did you mean?"                 │
│  Final fallback → Offer ticket escalation             │
└───────────────────────────────────────────────────────┘
```

## Configuration

Environment variables in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | (none) | Claude API key. If empty/placeholder, AI features are disabled |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | Model to use |
| `CLAUDE_MAX_TOKENS` | `1024` | Max output tokens per request |

## How Semantic Search Works

1. All active FAQs are loaded from the database
2. FAQ questions are formatted as a numbered list
3. Claude receives the user question + FAQ list with a system prompt in Hungarian
4. Claude returns JSON: `{"match": <1-based index or 0>, "confidence": <0-100>}`
5. The response is parsed and cached (5 min TTL) for repeated questions

### System Prompt (Hungarian)

Claude acts as an HR assistant and evaluates which FAQ best matches the user's question, considering synonyms and Hungarian morphology (ragozás). It returns `match: 0` if no FAQ is a good fit.

## Response Enhancement

When a FAQ match is found (keyword or AI), Claude can optionally enhance the response:

- Rephrases the raw FAQ answer more naturally
- Adapts tone (formal/informal) based on context
- Preserves all factual information
- Adds 1-2 related question suggestions

Enhancement is triggered when:
- API is available AND
- Keyword match score is between 30-80 (high-confidence matches don't need enhancement)
- OR AI semantic match found with confidence >= 50

## Multi-turn Conversation Context

The system maintains conversation context:

- Last 10 messages are retrieved per conversation
- History is passed to Claude for response enhancement and contextual responses
- Migration 053 added `conversation_context` JSONB column for future use
- Follow-up detection (short messages like "és?", "hogyan?") triggers context-aware matching

## Fallback Strategy

| Priority | Method | Cost | Speed |
|----------|--------|------|-------|
| 1 | Exact question match | Free | <1ms |
| 2 | Keyword scoring (scoreEntry) | Free | <5ms |
| 3 | AI semantic match | ~500 tokens | ~1s |
| 4 | Low-confidence keyword match | Free | <5ms |
| 5 | Decision tree triggers | Free | <10ms |
| 6 | AI contextual response | ~800 tokens | ~1.5s |
| 7 | Trigram suggestions | Free | <10ms |
| 8 | Fallback + escalation offer | Free | <1ms |

## Cost Estimation

Per chatbot interaction (assuming ~30% hit AI path):

| Scenario | Input tokens | Output tokens | Cost (Sonnet) |
|----------|-------------|---------------|---------------|
| Semantic match | ~400 | ~20 | ~$0.001 |
| Response enhancement | ~600 | ~200 | ~$0.003 |
| Contextual response | ~500 | ~100 | ~$0.002 |
| Average per message | - | - | ~$0.001 |

Estimated monthly cost at 1000 messages/day: **~$30/month**

## Rate Limiting

- Internal rate limit: 50 requests/minute (token bucket)
- Cached responses bypass the API (5 min TTL)
- If rate limit exceeded, falls back to keyword matching silently

## Monitoring & Logging

All AI interactions are logged via Winston:

```
[info] [Claude] API call {model, elapsed_ms, input_tokens, output_tokens, stop_reason}
[info] [Claude] Semantic match {question, matchIndex, confidence, matchedFaq}
[info] [Chatbot] AI semantic match {question, matchedFaq, confidence}
[error] [Claude] API error {error, status, elapsed_ms}
[warn] [Claude] Rate limit exceeded, skipping AI call
```

### AI Usage Analytics

Migration 053 added a `chatbot_ai_stats` view:

```sql
SELECT * FROM chatbot_ai_stats;
-- Returns: date, ai_responses, keyword_responses, ai_enhanced_responses, ai_usage_pct
```

## Files

| File | Description |
|------|-------------|
| `src/services/claude.service.js` | Claude API client, semantic match, enhancement |
| `src/services/chatbot.service.js` | Main chatbot logic with AI integration |
| `migrations/053_chatbot_ai_context.sql` | DB schema for AI context tracking |
| `tests/claude.service.test.js` | Claude service unit tests (30 tests) |
| `tests/chatbot.semantic.test.js` | AI integration tests (21 tests) |

## Testing

```bash
# Run AI-specific tests
npx jest tests/claude.service.test.js tests/chatbot.semantic.test.js

# Run all chatbot tests
npx jest tests/chatbot --no-coverage
```

All AI features are tested with mocked Claude API responses. The system is designed so that all tests pass regardless of whether an API key is configured.
