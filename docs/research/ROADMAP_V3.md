# Roadmap V3 — Sessions 23-40

**Assumes 2-hour sessions | Prioritized by impact, effort, dependencies**

---

## Phase 1: AI & Engagement (Sessions 23-25)

### Session 23: Gamification Engine
- Pulse streak tracking (current_streak, longest_streak, badges at 7/30/90 days)
- Points system (pulse=10, assessment=50, coaching=100)
- New table: `wellbeing_points` + `wellbeing_badges`
- Mobile: streak display on WellMindDashboard, badge collection screen
- **Deliverables**: 1 migration, 1 service, 2 mobile screens

### Session 24: Slack Integration
- Slack Bolt app for daily mood check-in
- Scheduled message at configurable time
- Interactive emoji block → maps to `submitPulse()`
- Admin config: enable/disable, set reminder time
- **Deliverables**: Slack bot service, webhook endpoint, admin config page

### Session 25: NLP Sentiment Analysis
- Claude/OpenAI API integration for pulse note analysis
- Sentiment score stored alongside pulse data
- Auto-escalation if distress detected in free text
- Replace keyword matching with LLM classifier for chatbot
- **Deliverables**: NLP service, sentiment scoring pipeline, chatbot upgrade

## Phase 2: Content & Compliance (Sessions 26-28)

### Session 26: WHO-5 Screener + Consent Management
- Add WHO-5 as monthly wellbeing screening (5 items, free)
- Consent management table + granular opt-in UI
- "Download My Data" (GDPR Article 20) endpoint + mobile screen
- **Deliverables**: WHO-5 questions, consent service, privacy screen

### Session 27: Mindfulness Content Library
- Content schema: `wellbeing_content` (type, category, duration, difficulty, media_url)
- Curated exercises: breathing (5), meditation (5), body scan (3), gratitude (3)
- Content recommendation based on WellMind scores
- Mobile: ContentLibraryScreen, ContentPlayerScreen
- **Deliverables**: 1 migration, content service, 2 mobile screens

### Session 28: Internationalization (i18n)
- react-i18next for admin UI, i18n-js for mobile
- Extract all Hungarian strings → translation files
- Support: Hungarian, English, Romanian (migrant workers)
- Chatbot multilingual support (language detection)
- **Deliverables**: i18n framework, HU/EN/RO translations, language selector

## Phase 3: Integrations (Sessions 29-31)

### Session 29: Calendar + Video Integration
- Google Calendar break suggestions (detect meeting overload)
- Auto-suggest 15-min wellness break after 3+ hours meetings
- Google Meet link generation for CarePath bookings
- Mobile: break notification + booking confirmation with Meet link
- **Deliverables**: Calendar analysis service, Meet integration, notifications

### Session 30: Teams Bot
- Microsoft Teams notification bot with Adaptive Card
- Same daily check-in flow as Slack (mood + optional notes)
- Teams webhook for response handling
- Admin config page (enable/disable, timing)
- **Deliverables**: Teams bot service, webhook endpoint

### Session 31: Wearable Integration
- Apple HealthKit (sleep quality, HRV, steps) via react-native-health
- Google Health Connect for Android equivalent
- On-device aggregation → send daily score only (privacy)
- Mobile: WearableSettingsScreen, auto-populate pulse sleep field
- **Deliverables**: HealthKit/Health Connect services, settings screen

## Phase 4: Advanced Features (Sessions 32-35)

### Session 32: Burnout Prediction Model
- Train logistic regression on historical pulse + assessment data
- Predict burnout risk 14 days ahead (probability score)
- Manager proactive notification when team member at risk
- Admin: model performance dashboard (precision, recall)
- **Deliverables**: ML pipeline, prediction service, admin dashboard

### Session 33: Team Wellness Challenges
- Challenge schema: time-bounded (7-30 days), team-based
- Types: steps, meditation minutes, pulse streak, hydration
- Team leaderboard (min 5 members, anonymized individual scores)
- Mobile: ChallengesScreen, TeamLeaderboard
- **Deliverables**: 1 migration, challenge service, 2 mobile screens

### Session 34: CBT Digital Therapeutics
- Structured CBT exercises in chatbot (thought challenging, behavioral activation)
- 5-10 minute guided sessions with progress tracking
- Evidence-based: PHQ-9/GAD-7 integration for clinical screening
- Mobile: CBTExerciseScreen, progress tracker
- **Deliverables**: CBT content engine, exercise screens

### Session 35: Smart Intervention Matching
- Collaborative filtering: recommend interventions based on similar user outcomes
- A/B testing framework for intervention effectiveness
- ROI calculator with actual outcome data
- **Deliverables**: Recommendation engine, A/B framework

## Phase 5: Compliance & Polish (Sessions 36-38)

### Session 36: EU AI Act Compliance
- Technical documentation for all AI features
- Human oversight documentation (escalation paths)
- Conformity self-assessment
- Transparency notices (AI disclosure in chatbot)
- **Deliverables**: DPIA document, AI Act compliance pack

### Session 37: WCAG Accessibility
- Admin UI + mobile app accessibility audit
- Color contrast fixes (WCAG AA minimum)
- Screen reader support (accessibilityLabel on all touchables)
- Keyboard navigation for admin UI
- **Deliverables**: Accessibility report, fixes applied

### Session 38: Offline Mode + Performance
- Offline pulse submission (AsyncStorage queue)
- Background sync when connectivity restored
- Performance optimization (React.memo, lazy loading)
- Bundle size optimization
- **Deliverables**: Offline queue service, performance improvements

## Phase 6: Scale & Enterprise (Sessions 39-40)

### Session 39: Multi-Tenant + SSO
- Organization isolation improvements
- SAML/OIDC SSO integration
- Role-based access control refinements
- API rate limiting per tenant
- **Deliverables**: SSO service, RBAC improvements

### Session 40: Production Launch Prep
- Final security audit
- Load testing (1000+ concurrent users)
- Monitoring setup (Sentry, health checks)
- Deployment pipeline (CI/CD)
- Launch documentation + training materials
- **Deliverables**: Production deployment, monitoring, documentation

---

## Summary Timeline

| Phase | Sessions | Duration | Focus |
|---|---|---|---|
| AI & Engagement | 23-25 | ~6 hours | Gamification, Slack, NLP |
| Content & Compliance | 26-28 | ~6 hours | WHO-5, content, i18n |
| Integrations | 29-31 | ~6 hours | Calendar, Teams, wearables |
| Advanced | 32-35 | ~8 hours | ML, challenges, CBT, matching |
| Compliance | 36-38 | ~6 hours | AI Act, WCAG, offline |
| Enterprise | 39-40 | ~4 hours | SSO, production launch |
