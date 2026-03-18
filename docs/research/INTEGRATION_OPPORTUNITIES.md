# Integration Opportunities — 3rd Party Platforms

---

## Tier 1: Must-Have (Sessions 23-28)

### 1. Slack — Daily Check-in Bot

**Use case**: Send daily mood check-in to employees in Slack; capture responses as pulse data.

| Aspect | Detail |
|---|---|
| SDK | `@slack/bolt` (Node.js) |
| Auth | OAuth 2.0 — scopes: `chat:write`, `im:write`, `users:read` |
| Key APIs | `chat.scheduleMessage`, Block Kit interactive components |
| Effort | **Easy** (1-2 weeks) |
| Priority | **Must-have** |

**Implementation flow**:
```
Cron (9 AM) → Slack scheduleMessage → User taps emoji (1-5)
→ Webhook receives response → POST /wellmind/pulse
```

### 2. Google Calendar — Break Suggestions

**Use case**: Detect meeting overload → auto-suggest wellness breaks; auto-create Meet links for coaching.

| Aspect | Detail |
|---|---|
| SDK | `googleapis` npm package |
| Auth | OAuth 2.0 (already implemented in app) |
| Key APIs | `Events.insert`, `FreeBusy.query`, `conferenceData` |
| Effort | **Easy** (1 week — OAuth infra exists) |
| Priority | **Must-have** |

**Implementation flow**:
```
Analyze today's calendar → 3+ hours consecutive meetings?
→ Insert 15-min "Wellness Break" event
→ Send wellbeing_notification
```

### 3. OpenAI / Claude API — NLP Analysis

**Use case**: Sentiment analysis on pulse survey notes; distress detection in chatbot conversations.

| Aspect | Detail |
|---|---|
| SDK | `@anthropic-ai/sdk` or `openai` |
| Auth | API key |
| Key APIs | Messages API / Chat Completions |
| Effort | **Medium** (2-3 weeks) |
| Priority | **Must-have** |

**Implementation**: Classify pulse notes into: positive/neutral/negative/distressed. Auto-escalate if distressed.

---

## Tier 2: High Value (Sessions 29-31)

### 4. Microsoft Teams — Check-in Bot

**Use case**: Same as Slack but for Teams-first organizations.

| Aspect | Detail |
|---|---|
| SDK | Teams Bot Framework SDK |
| Auth | Azure AD app registration |
| Key APIs | Proactive messaging, Adaptive Cards |
| Effort | **Medium** (2 weeks) |
| Priority | **High** |

### 5. Apple HealthKit — Wearable Data

**Use case**: Read sleep quality, HRV, steps; auto-populate pulse survey fields.

| Aspect | Detail |
|---|---|
| SDK | `react-native-health` |
| Auth | Per-type device authorization (Apple enforced) |
| Data types | `sleepAnalysis`, `heartRateVariabilitySDNN`, `stepCount` |
| Effort | **Medium** (2-3 weeks, iOS only) |
| Priority | **Medium** |

**Privacy**: Data stays on device; send only daily aggregated scores to server.

### 6. Google Health Connect — Android Wearable

**Use case**: Same as HealthKit for Android users.

| Aspect | Detail |
|---|---|
| SDK | `react-native-health-connect` |
| Data types | `SleepSession`, `HeartRateVariabilityRmssd`, `Steps` |
| Effort | **Medium** (2-3 weeks, parallel with HealthKit) |
| Priority | **Medium** |

### 7. Zoom — Video Coaching

**Use case**: Auto-generate meeting links for CarePath coaching bookings.

| Aspect | Detail |
|---|---|
| SDK | Server-to-Server OAuth API |
| Key API | `POST /v2/users/{userId}/meetings` |
| Effort | **Easy** (1 week) |
| Priority | **Medium** |

---

## Tier 3: Nice-to-Have (Sessions 32+)

### 8. Workday / SAP SuccessFactors — HRIS Sync

**Use case**: Employee lifecycle events (onboarding, offboarding) trigger wellbeing flows.

| Effort | Hard | Priority | Low |
|---|---|---|---|

### 9. Zendesk / Intercom — Support Integration

**Use case**: Link support tickets to wellbeing referrals.

| Effort | Medium | Priority | Low |
|---|---|---|---|

### 10. Tableau / Power BI — Analytics Export

**Use case**: Executive dashboards with wellbeing KPIs.

| Effort | Easy (data export API) | Priority | Low |
|---|---|---|---|

---

## Integration Architecture

```
┌─────────────────────────────────────────────┐
│              HR-ERP Backend                  │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │WellMind │  │ CarePath │  │ Integration │ │
│  │  API    │  │   API    │  │    Layer    │ │
│  └────┬────┘  └────┬─────┘  └─────┬──────┘ │
│       │            │               │         │
│       └────────────┼───────────────┘         │
│                    │                          │
│  ┌─────────────────┴──────────────────────┐  │
│  │         Integration Service            │  │
│  │  ┌──────┐ ┌──────┐ ┌────┐ ┌────────┐ │  │
│  │  │Slack │ │Teams │ │Cal │ │HealthKit│ │  │
│  │  │ Bot  │ │ Bot  │ │API │ │  Sync   │ │  │
│  │  └──────┘ └──────┘ └────┘ └────────┘ │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```
