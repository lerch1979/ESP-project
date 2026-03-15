# Chatbot API Documentation

## Overview

The HR-ERP chatbot provides automated FAQ-based support for employees. It uses PostgreSQL full-text search with trigram similarity matching for Hungarian language support.

**Base URL:** `/api/v1/chatbot`

## Authentication

All endpoints (except FAQ browsing) require JWT authentication via `Authorization: Bearer <token>` header.

## Rate Limiting

Chat messages are rate-limited to **10 messages/minute per user**.

---

## Public Endpoints (No Auth)

### GET /faq/categories
Get FAQ categories for browsing.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Szabadság & Távollét",
      "slug": "szabadsag",
      "description": "Szabadság igénylés, betegszabadság, távollét",
      "icon": "calendar",
      "color": "#10b981",
      "sort_order": 1
    }
  ]
}
```

### GET /faq/entries
Get FAQ entries, optionally filtered by category.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `category_id` | UUID | Filter by category |
| `search` | string | Search in question/answer text |

---

## User Endpoints (Auth Required)

### POST /conversations
Start a new chat conversation.

**Request Body:**
```json
{
  "title": "Optional custom title"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "conv-uuid",
    "user_id": "user-uuid",
    "status": "active",
    "title": "Új beszélgetés",
    "created_at": "2026-03-15T12:00:00Z"
  }
}
```

### GET /conversations
List user's conversations.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter: `active`, `escalated`, `closed` |
| `page` | int | Page number (default: 1) |
| `limit` | int | Items per page (default: 20) |

### GET /conversations/:conversationId/messages
Get all messages in a conversation.

### POST /conversations/:conversationId/messages
Send a message to the chatbot. Rate limited: 10/min.

**Request Body:**
```json
{
  "content": "Hogyan kérhetek szabadságot?"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userMessage": {
      "id": "msg-uuid",
      "sender_type": "user",
      "content": "Hogyan kérhetek szabadságot?",
      "created_at": "2026-03-15T12:00:00Z"
    },
    "botMessage": {
      "id": "msg-uuid",
      "sender_type": "bot",
      "message_type": "text",
      "content": "A szabadságot a mobilalkalmazásban tudod igényelni...",
      "faq_id": "faq-uuid",
      "confidence_score": 2.5,
      "metadata": {
        "source": "knowledge_base",
        "kb_id": "faq-uuid",
        "response_time_ms": 45
      }
    }
  }
}
```

**Bot Response Types:**
| message_type | Description |
|---|---|
| `text` | Direct FAQ answer or fallback message |
| `options` | Decision tree options to choose from |
| `suggestions` | "Did you mean?" similar questions |
| `faq_list` | Category list for browsing |
| `escalation` | Ticket creation notification |

### POST /conversations/:conversationId/suggestions
Select a suggested FAQ from a "Did you mean?" response.

**Request Body:**
```json
{
  "kb_id": "faq-uuid"
}
```

### POST /conversations/:conversationId/escalate
Escalate conversation to a support ticket.

**Response:**
```json
{
  "success": true,
  "message": "Beszélgetés eszkalálva",
  "data": {
    "ticketId": "ticket-uuid",
    "ticketNumber": "#1001"
  }
}
```

### POST /conversations/:conversationId/close
Close an active conversation as resolved.

### POST /feedback
Submit feedback on a bot message (helpful/not helpful).

**Request Body:**
```json
{
  "messageId": "msg-uuid",
  "helpful": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Köszönjük a pozitív visszajelzést!",
  "data": {
    "messageId": "msg-uuid",
    "helpful": true,
    "faqId": "faq-uuid"
  }
}
```

---

## Admin Endpoints (admin/task_owner role)

### GET /admin/conversations
List all conversations with user details.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status |
| `search` | string | Search by title or user name |
| `page` | int | Page number |
| `limit` | int | Items per page |

### GET /admin/conversations/:conversationId
Get conversation detail with all messages and user info.

### GET /admin/analytics
Get chatbot analytics for the contractor.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalConversations": 100,
    "activeConversations": 10,
    "escalatedConversations": 5,
    "closedConversations": 85,
    "totalMessages": 500,
    "topKnowledgeBase": [...],
    "dailyStats": [...],
    "avgResponseTimeMs": 150,
    "resolutionRate": 82,
    "unansweredQueries": 20,
    "avgConversationDurationMinutes": 5
  }
}
```

### Knowledge Base CRUD

| Method | Path | Description |
|---|---|---|
| GET | `/admin/knowledge-base` | List FAQ entries with search/filter |
| POST | `/admin/knowledge-base` | Create new FAQ entry |
| PUT | `/admin/knowledge-base/:id` | Update FAQ entry |
| DELETE | `/admin/knowledge-base/:id` | Delete FAQ entry |
| POST | `/admin/knowledge-base/bulk-action` | Bulk operations |

**Create/Update FAQ Body:**
```json
{
  "question": "Hogyan kérhetek szabadságot?",
  "answer": "A szabadságot az alkalmazásban...",
  "keywords": ["szabadság", "igénylés", "leave"],
  "category_id": "cat-uuid",
  "priority": 10
}
```

**Bulk Action Body:**
```json
{
  "action": "activate|deactivate|delete|change_category",
  "ids": ["uuid1", "uuid2"],
  "category_id": "cat-uuid"
}
```

---

## Superadmin Endpoints

### Decision Trees CRUD

| Method | Path | Description |
|---|---|---|
| GET | `/admin/decision-trees` | List decision trees |
| GET | `/admin/decision-trees/:id` | Get tree with nodes |
| POST | `/admin/decision-trees` | Create tree |
| PUT | `/admin/decision-trees/:id` | Update tree |
| DELETE | `/admin/decision-trees/:id` | Delete tree |

### Decision Nodes CRUD

| Method | Path | Description |
|---|---|---|
| POST | `/admin/decision-nodes` | Create node |
| PUT | `/admin/decision-nodes/:id` | Update node |
| DELETE | `/admin/decision-nodes/:id` | Delete node |

### FAQ Categories CRUD

| Method | Path | Description |
|---|---|---|
| GET | `/admin/faq-categories` | List categories with counts |
| POST | `/admin/faq-categories` | Create category |
| PUT | `/admin/faq-categories/:id` | Update category |
| DELETE | `/admin/faq-categories/:id` | Delete category |
| PUT | `/admin/faq-categories/reorder` | Reorder categories |

### Config

| Method | Path | Description |
|---|---|---|
| GET | `/admin/config` | Get chatbot config |
| PUT | `/admin/config` | Update chatbot config |

### Global Analytics

| Method | Path | Description |
|---|---|---|
| GET | `/admin/analytics/global` | Cross-contractor analytics |

---

## Search Algorithm

1. **Full-text search** (PostgreSQL `tsvector`): Weighted search on question (A), keywords (A), answer (B)
2. **Trigram similarity** (`pg_trgm`): Fuzzy matching for typo tolerance
3. **Keyword overlap**: Array intersection with prefix matching
4. **Combined scoring**: `fts_score * 2 + trgm_score + priority * 0.1`

The search supports:
- Hungarian accented characters (á, é, í, ó, ö, ő, ú, ü, ű)
- Prefix matching (partial words)
- Typo tolerance via trigram similarity
- Context-aware follow-up detection

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Hungarian error description"
}
```

| Status | Meaning |
|---|---|
| 400 | Invalid input |
| 401 | Not authenticated |
| 403 | Not authorized |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Server error |
