# Resident Knowledge & Onboarding Hub — plan

**Status:** PLAN ONLY (not built). Recorded 2026-06-21. Resume as the next major
track **after** the Tier 1+2 mobile i18n polish ships and is tested on device.

**Key finding that shapes everything:** the hard part already exists — a
Claude-powered **read-time translation layer** (`translation.service.js` +
`translation_cache`, all 5 languages, cached). So *text* content is authored
once and fans out to 5 languages essentially for free. The hub is mostly
**organizing + one new content type (articles) + a navigation shell**, not a
from-scratch CMS.

---

## 1. Structure — category map
One "Info & Help" hub tab; seven top-level category tiles:

| Category | Inside |
|---|---|
| 🛬 Arrival & First Days | First-week checklist, how the app works, who's who, keys/SIM/bank basics |
| 🏠 Your Home | House rules, who to call, utilities, waste/recycling, safety, report-an-issue |
| 💼 Work | Workplace orientation, your rights, pay & deductions basics, safety (munkavédelem), shifts |
| 🏥 Health & Emergencies | Emergency numbers (112), find a doctor/pharmacy, EU/HU healthcare, if you're sick |
| 📋 Admin & Documents | Visa/residence/work permit, tax number, address card, your documents, requests |
| 🇭🇺 Living in Hungary | Money & banking, transport, shopping, phone/internet, weather, public holidays |
| 🤝 Culture & Daily Life | Customs & social norms, basic language, food, community/worship, etiquette |

Cross-cutting: every category has a "Still stuck? Ask" entry → chatbot/FAQ → escalates to a ticket. The hub is both *read* and *ask*.

## 2. Format per piece
Principle: **video** for emotional/visual/demo, **article** for reference, **FAQ** for quick lookups, **document** for official PDFs, **form/action** for "do something."

| Content | Format | Why |
|---|---|---|
| Welcome / how-the-app-works / safety demos / first day | **Video** (subtitled) | Visual, warm, language-light |
| Country / culture / work-rights / "how X works in Hungary" | **Article** (long-form) | Reference; skimmable, searchable, auto-translates |
| "How do I…?" quick questions | **FAQ / chatbot** (exists) | Already translated at read-time, escalates to ticket |
| Contracts, handbooks, official policies | **Document (PDF)** | Authoritative, downloadable |
| Request time off / medical appt / a document | **Interactive form → request** | An *action*, tracked — not content |
| First-week / move-in checklist | **Interactive checklist** (progress) | Onboarding is a journey with state |

## 3. Existing vs new (grounded in the codebase)
**Reuse:**
- **Videos** (`videos` table, admin UI) — add per-language subtitle field; categories currently fixed HU slugs.
- **FAQ/chatbot KB** (`chatbot_knowledge_base` + `chatbot_faq_categories`, contractor-scoped) — already translated at read-time + escalates to tickets. Free "Ask" backbone.
- **Documents** (`documents` table) — host PDFs.
- **Translation layer** (`translation.service` + `translation_cache`, Claude, 5 langs) — the multilingual engine.
- **Tickets** (`ticket_categories` contractor-configurable) — requests backbone.
- **Calendar** (resident read-only, accepts system events) — show approved leave/appointments.
- **`leave_requests` table already exists** (mig 065) — no resident routes yet.
- **Gamification engine** — reward onboarding completion later.

**Build new:**
- **Articles/Guides content type** — `kb_articles` (title, body markdown, category, base_lang, status) + mobile reader + admin rich-text editor. The one substantial new content primitive.
- **Hub navigation shell** — categorized landing screen tying the four formats together.
- **Resident request flows** — `POST /tickets/my` (residents can only READ tickets today) + request categories (time off, document request, general) + structured metadata → on approval write back to `leave_requests` + calendar.
- **(Later)** Announcements + guided onboarding checklist.

**Reuse-with-care:** medical-appointment booking can repurpose **CarePath** provider-booking — but CarePath is EAP/counseling = **GDPR Art 9 health data with NO API permission gate today** (see RESIDENT_APP_BACKLOG security item). General health *info* is just articles (no risk); the *booking action* waits for the Art 9 review + gating.

## 4. Multilingual approach
- **Text (articles, FAQ, request labels):** author once in a base language → read-time Claude translation, cached → 5 languages, ~free after first read. Optional human-reviewed override per language for high-stakes pages (rights, safety, money); mark auto vs reviewed.
- **Video:** audio can't auto-translate cheaply → see the Video Track below.
- **Documents:** keep critical PDFs (house rules, safety) per-language; otherwise prefer articles (they auto-translate).

## 5. Phased roadmap — MVP first
- **Phase 0 (in flight):** Tier 1+2 mobile i18n polish + 3-card onboarding. App is fully multilingual with a welcome.
- **Phase 1 — MVP Knowledge Hub (highest value / least build):** Hub tab with 7 tiles; new **Articles** type + reader + admin editor on the existing translation layer; seed ~15–20 keystone articles; surface existing videos + welcome video (subtitled) + handbook PDF; wire the "Ask" entry to the chatbot/FAQ. Pure read/learn, zero compliance risk.
- **Phase 2 — Actionable requests:** `POST /tickets/my` + request categories + structured fields; surface `leave_requests`; calendar write-back on approval. Medical-appointment via CarePath AFTER Art 9 gating + review.
- **Phase 3 — Guided onboarding journey:** progress-tracked first-week checklist personalized by nationality/role; push nudges; gamification rewards; announcements/broadcast feed.
- **Phase 4 — Scale & quality:** human-reviewed translations for critical pages; flagship per-language video narration; analytics (what residents read/search) + feed unanswered chatbot questions into the content backlog.

## 6. Admin side
- Reuse admin pages: Videos, Chatbot Knowledge Base, Documents.
- New **Articles editor** — markdown/rich-text, category + base language, inline translation preview, per-language override, publish; track auto-vs-reviewed.
- New lightweight **Hub manager** — arrange categories, feature/pin items, per-contractor visibility.
- Authoring is for HR/housing managers, not devs — content forms, no deploys.
- Governance: content owners per category, "last reviewed" date per article, quarterly freshness check (visa/tax/rights pages change).

---

## VIDEO TRACK (related, net-new — plan WITH the hub; plugs into the Video format)
The resident video library + **Eszti's avatar videos** + a **scheduling engine** are a connected track feeding the hub's Video format.

**Video production requirements:**
- **Per-language subtitle/caption tracks** for every video (one video, 5 caption files; auto-transcribe+translate to seed, human-check critical ones). MVP multilingual approach for video.
- **Per-language voiceover (Eszti, 5 langs)** for FLAGSHIP videos (welcome, fire-safety, key compliance) — higher production cost; reserve for the few that matter most.
- Favor language-light visuals + on-screen text so a video is useful even unsubtitled.

**Scheduling engine (net-new):** deliver the right video at the right time, three trigger modes:
- **Calendar-timed:** e.g. the Christmas video auto-sends each December.
- **Event-triggered:** onboarding/welcome video on arrival (check-in), safety video on assignment, etc.
- **On-demand:** browse the library anytime from the hub.

**Watch-tracking (net-new, compliance):** record proof a resident watched a video (e.g. fire-safety) — completion + timestamp = **compliance evidence**. Extends the existing `video_views` table (currently basic view tracking) into per-resident completion records with audit value.

**Reuse vs build for the video track:** reuse the `videos` table + admin UI + `video_views`; build the subtitle/voiceover pipeline, the scheduling engine (calendar/event/on-demand), and the completion/compliance tracking. Avatar (Eszti) video generation is an external production pipeline feeding the library.
