# Feature Recommendations — Prioritized Enhancement Plan

---

## High Priority (Sessions 23-25)

| # | Feature | Rationale | Effort | Impact |
|---|---|---|---|---|
| 1 | **Slack daily check-in bot** | All competitors have it; 3-5x participation rate | 1-2 weeks | Very High |
| 2 | **Gamification: streaks + points** | 30-40% adoption increase (proven); streak = strongest retention | 1 week | Very High |
| 3 | **WHO-5 monthly screener** | Free, 5 items, clinically validated (700+ studies), screener cutoff at ≤7 | 2 days | High |
| 4 | **Consent management UI** | GDPR mandatory (Article 9 health data); granular opt-in per data type | 1-2 weeks | High (compliance) |
| 5 | **DPIA documentation** | Legally required before production launch | 1 week | Critical (compliance) |
| 6 | **NLP sentiment analysis** | Upgrade from keyword matching to LLM-based distress detection on pulse notes | 2-3 weeks | High |
| 7 | **Full i18n framework** | Blue-collar/migrant workers need native language; HU/EN/RO minimum | 2 weeks | High |

## Medium Priority (Sessions 26-30)

| # | Feature | Rationale | Effort | Impact |
|---|---|---|---|---|
| 8 | **Teams daily check-in bot** | Second most popular workplace platform after Slack | 2 weeks | Medium-High |
| 9 | **Calendar break suggestions** | Detect meeting overload → auto-suggest breaks (existing Google Cal infra) | 1 week | Medium |
| 10 | **Mindfulness content library** | Table-stakes feature; curated breathing/meditation exercises | 2 weeks | Medium |
| 11 | **Video coaching integration** | Google Meet link auto-generation for CarePath bookings | 1 week | Medium |
| 12 | **CBT micro-exercises in chatbot** | Evidence-based 5-10 min exercises; clinically validated | 2 weeks | Medium |
| 13 | **Differential privacy** | Laplace noise for team metrics (5-15 person teams) | 1-2 weeks | Medium (compliance) |
| 14 | **GDPR data export** | "Download My Data" button; GDPR Article 20 right to portability | 1 week | Medium (compliance) |
| 15 | **WCAG 2.1 AA accessibility audit** | EU legal requirement; screen reader, contrast, keyboard navigation | 2 weeks | Medium (compliance) |

## Low Priority (Sessions 31-35)

| # | Feature | Rationale | Effort | Impact |
|---|---|---|---|---|
| 16 | **Apple HealthKit integration** | Passive sleep/activity data; auto-populate pulse fields | 2-3 weeks | Medium |
| 17 | **Google Health Connect (Android)** | Same as HealthKit for Android users | 2-3 weeks | Medium |
| 18 | **Team wellness challenges** | Time-bounded competitions (steps, meditation); team engagement | 2 weeks | Medium |
| 19 | **Peer recognition (kudos)** | Lightweight wellness recognition between colleagues | 1 week | Low-Medium |
| 20 | **Smart intervention matching** | ML-based: given scores → recommend most effective CarePath service | 3 weeks | Medium |
| 21 | **Burnout prediction model** | Logistic regression on pulse trends to predict burnout 14 days ahead | 3 weeks | Medium-High |
| 22 | **Content recommendation engine** | High stress → breathing; low mood → behavioral activation | 2 weeks | Medium |
| 23 | **Offline pulse submission** | Queue in AsyncStorage → sync on reconnect (blue-collar essential) | 1 week | Medium |

## Nice-to-Have (Backlog)

| # | Feature | Rationale | Effort |
|---|---|---|---|
| 24 | Financial wellness module | Growing trend; partner integration via referral system | Easy |
| 25 | Voice check-in interface | Speech-to-text mood classification; low literacy support | Hard |
| 26 | On-device ML inference | Federated learning; privacy-preserving risk scoring | Hard |
| 27 | Peer support circles | Anonymous group chat, moderated | Medium |
| 28 | Crisis hotline integration | 24/7 phone support with escalation protocol | Medium |
| 29 | HRIS webhook receiver | Employee lifecycle events → wellbeing onboarding | Medium |
| 30 | Psychological safety survey | Edmondson 7-item scale at team level (semi-annual) | Easy |

---

## Implementation Dependencies

```
Gamification (2) ← no dependencies
Slack bot (1) ← needs webhook endpoint
WHO-5 (3) ← add to pulse questions
Consent UI (4) ← needs backend consent table
DPIA (5) ← needs consent UI first
NLP sentiment (6) ← needs OpenAI/Claude API key
i18n (7) ← react-i18next setup; extract all strings
Calendar breaks (9) ← uses existing Google Calendar OAuth
Video coaching (11) ← add conferenceData to Calendar events
HealthKit (16) ← react-native-health; iOS only
```
