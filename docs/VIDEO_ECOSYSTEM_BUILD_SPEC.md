# Video Knowledge Base — Build Spec (Phase 1 MVP)

**Status:** SPEC ONLY — not built. Companion to `KNOWLEDGE_HUB_PLAN.md` (the video
track). **Scope of this doc = the SOFTWARE SYSTEM.** Eszti-avatar video
*production* (recording/voiceover/rendering) is an external pipeline that simply
hands us files/URLs + subtitle text; it is out of scope here.

Investigated 2026-06-22 (3 parallel code audits). All file:line claims below come
from that audit.

---

## 1. What exists today — reuse vs missing

| Area | Exists (reusable) | Missing for the MVP |
|---|---|---|
| **`videos` table** | id, title, description, **url** (external passthrough), thumbnail_url, category (VARCHAR, 6 fixed code values), duration, is_active, timestamps. `add_videos.sql` | language, scoping (workplace/contractor), created_by, featured/order, subtitle link, language-variant grouping |
| **`video_views`** | id, user_id, video_id, watched_at, **completed** (bool). Per-user. | completion %, watchtime, completed_at, **UNIQUE(user,video)** (dupes today), compliance fields |
| **Backend** | `video.controller` + routes: list/get/create/update/delete/categories/record-view, gated by `videos.view/create/edit/delete` | scoped list (per resident), subtitles endpoint, scheduling, compliance report |
| **Admin UI** | `Videos.jsx` + Create/Detail modals — URL-based CRUD, category dropdown, duration, YouTube thumbnail auto-extract | file/variant upload, subtitle upload, visibility (scope) picker, schedule picker, watch dashboard |
| **Mobile** | `VideoListScreen` + `VideoDetailScreen` (WebView iframe embed), `VideoCard`, search + category chips, "Megtekintve" → completed. **Already surfaced in the resident menu** (was hidden). | language-aware player + subtitle tracks, scoped list (driven by backend) |
| **Storage** | Local disk `uploads/`, multer **PDF/JPG/PNG only**, served `express.static('/uploads')` → Caddy `reverse_proxy` (no CDN). 10 MB cap. | **No video file storage; no CDN.** Not viable for 1000–2000 viewers (see §6). Note: `uploads/` not in backup; `storage.service` already flags "migrate to S3". |

**Bottom line:** the module is a thin **URL-passthrough catalog** (good admin/mobile
shells, per-user view rows). It has none of: scoping, multilingual, scheduling,
compliance tracking, or scalable delivery. All four are net-new but build on solid
shells.

---

## 2. Employer-scoping — the key decision: **workplace, not contractor**

**Requirement:** a video is `global` (all residents) OR restricted so only one
company's workers see it (Autoliv fire-safety → Autoliv workers only).

**Two candidate keys (both exist):**
- `contractors` — the staffing agency / employer-of-record. This is what
  **chatbot/FAQ scope by** (`chatbot_knowledge_base.contractor_id`, resolved from
  `req.user.contractorId` in `auth.js`).
- `workplaces` (mig 095) — a first-class table of **physical work sites / end
  clients** (Autoliv, etc.), populated from `employees.workplace` (a TEXT column).
  **No FK to contractors.**

**Recommendation: scope video visibility by WORKPLACE (end-client site).**
- "Autoliv fire-safety" is **site-specific** safety training → keys off *where they
  physically work*, which is `workplace` (= Autoliv).
- One contractor supplies workers to **many** sites; one site uses **many**
  contractors → contractor-scoping would leak the Autoliv video to that agency's
  workers at *other* sites, and hide it from Autoliv workers placed by *other*
  agencies. Semantically wrong for worksite training.
- The chatbot's contractor-scoping is correct **for the chatbot** (tenant-level
  operational policy) but **does not generalize** to site training.

**Do it as a flexible scope enum so both axes are available:**
- `videos.scope ∈ {global, workplace, contractor}` (default `global`).
- `videos.workplace_id` (FK → workplaces) used when scope=workplace.
- `videos.contractor_id` (FK → contractors) used when scope=contractor — kept for the
  occasional employer-policy video, reusing the chatbot axis.

**⚠️ Data-quality caveat (must address):** `employees.workplace` is **free TEXT**, and
`workplaces` is populated *from* that text (loose coupling). Matching a resident to a
video by `employees.workplace = workplaces.name` is fragile (typos/variants).
- **MVP-acceptable:** text-match `employees.workplace = workplaces.name`.
- **Recommended prerequisite (small):** add `employees.workplace_id UUID REFERENCES
  workplaces(id)`, backfill from the text once, and scope off the FK. ~0.5 day, makes
  scoping reliable and is reusable elsewhere.

**Resident → company resolution:** residents are **employees**, and `workplace` lives
on `employees` (not `users`). So the scoped list resolves via
`employees WHERE user_id = req.user.id → workplace_id`. (Contractor can come from
`req.user.contractorId` as today.)

**Scoped list logic (every resident-facing video query):**
> show v WHERE v.is_active AND ( v.scope='global'
>   OR (v.scope='workplace' AND v.workplace_id = :myWorkplaceId)
>   OR (v.scope='contractor' AND v.contractor_id = :myContractorId) )

Admins (videos.view) see all, with a scope filter.

---

## 3. Multilingual model

Three layers, cheapest-first:

1. **Title / description → reuse the Claude translation layer.** Author once (hu or
   en); translate at read-time via `translation.service` + `translation_cache` (the
   same engine the chatbot uses), cached per language. No per-language authoring of
   metadata.
2. **Subtitles (the baseline for video).** New `video_subtitles(video_id, language,
   url)` → one WebVTT track per language (5). The player loads the track matching
   `i18n.language`. Subtitle text can be machine-seeded then human-checked for the
   critical (safety) videos. This is the MVP multilingual answer for video — one
   file, 5 tracks.
3. **Per-language voiceover (flagship only).** Optional `video_variants(video_id,
   language, playback_url)` — a different rendered file per language (Eszti voiceover
   in uk/tl/de…). The player picks the variant matching the user's language, else
   falls back to the base `videos.url` (+ subtitles). Reserve for the 2–3 videos that
   matter most (welcome, fire-safety).

**Player:** replace the bare YouTube/Vimeo iframe with a player that supports
`<track>` subtitles + variant selection. For self-hosted HLS (see §6), use
`expo-video` (mobile) / a VTT-capable web player (admin). Language-aware = pass
`i18n.language` → pick variant + default subtitle track.

---

## 4. Scheduling engine (on-demand + calendar-timed + event-triggered)

Reuse the existing **cron + push + in-app notification** machinery (no DB triggers —
matches every other scheduled job in the repo).

- **On-demand** — already works: the library (scoped, categorized). Nothing new.
- **Calendar-timed / recurring** (Christmas each December, spring fire-ban) —
  `video_schedules(video_id, rule)` where rule is a recurring spec (e.g. cron-like
  `0 0 1 12 *` or `{month, day}`/RRULE). A **daily cron** (`videoScheduler.service`,
  registered in `server.js` like the others, TZ Europe/Budapest) evaluates due
  schedules and, for each in-scope resident, calls
  `inAppNotification.notify({type:'video_assigned', link:'/videos/:id', push:true})`.
- **Event-triggered** (onboarding on arrival, offboarding on check-out) — the same
  daily cron detects residents whose **arrival_date = today** (→ send the
  `scope`-appropriate onboarding video) or **end_date = today / `employee_
  accommodation_history.check_out_date = today`** (→ offboarding video). Source of
  truth: `employees.arrival_date`/`end_date` (already the calendar checkin/checkout
  source) and the detailed `employee_accommodation_history`. No trigger needed; the
  daily sweep is idempotent if we record sends (see §5).
- **Delivery** reuses: `pushNotification.sendToUser` (localized, `user_push_tokens`)
  + `inAppNotification.notify` (the `notifications` table). **Add a `video_*` case to
  the mobile `routeForNotification`** so a tapped push deep-links to the video.

`video_assignments(video_id, user_id, reason, assigned_at, due_at, notified_at)`
records what was pushed to whom (dedupe + "assigned to you" list + reminder logic).

---

## 5. Watch-tracking (compliance evidence)

Extend `video_views` into proper completion tracking:
- Add `UNIQUE(user_id, video_id)` (today it allows dupes) → upsert one row per
  user×video.
- Add `progress_pct INT`, `completed_at TIMESTAMPTZ`, `last_position_sec INT`,
  `watch_count INT`. Mobile player reports progress (e.g. on pause/exit + at ≥90% →
  completed_at = now).
- **Compliance = `completed_at IS NOT NULL`** for a (resident, video) — provable
  "this worker watched fire-safety on this date".
- **Compliance report** (admin, scoped by workplace): for a video + workplace, who
  has/hasn't completed it, with dates → export (reuse the xlsx pattern). This is the
  Autoliv-facing audit artifact.

---

## 6. Storage / delivery at scale (1000–2000 viewers) — **use a video CDN, do NOT serve from the app server**

**Current path is unviable for video:** local disk + `express.static` + single Caddy
node = no adaptive bitrate, no global edge, all bandwidth through one box, no
transcoding. Fine for PDFs, fatal for 1–2k concurrent video streams.

**Recommendation: keep the URL-passthrough design (the `videos.url` field already
exists) but point it at a purpose-built video service that does ingest + transcode +
HLS + global CDN + signed URLs. Don't put video bytes on the Node/Caddy box.**

Options (ranked):
1. **Bunny Stream (recommended).** Cheap, built-in transcoding → HLS, global CDN,
   token-auth/signed URLs (enforce scoping), per-video play analytics. Lowest cost +
   effort; we store the HLS playback URL + token config.
2. **Cloudflare Stream.** Similar, slightly pricier; great if already on Cloudflare.
   Includes per-language captions hosting.
3. **Mux.** Premium, best analytics (could power watch-tracking directly), highest
   cost. Overkill for MVP.
4. **Self-host (S3/R2 + ffmpeg HLS + CDN).** Most control, most build (transcode
   pipeline + CDN). Only if vendor lock-in is unacceptable. Not for Phase 1.

**Subtitles (WebVTT):** small static files → object storage (Cloudflare **R2** —
zero egress) or alongside the Stream asset; `video_subtitles.url` points at them.

**Access control with a CDN:** scope is enforced at the **list/`get` API** (only
in-scope residents receive a playback URL), and the playback URL is a **short-lived
signed token** from the Stream provider so the URL can't be shared outside the app.

**Net:** MVP storage work ≈ *configure a Stream provider + store playback URL +
signed-URL helper* — not a transcoding build. The Eszti pipeline uploads renders to
the provider (or hands us files we upload via API).

---

## 7. Admin workflow (target)

1. **Create video** → title + description (one language; auto-translated on read),
   category, **visibility** (global / workplace=Autoliv / contractor), optional
   **schedule** (on-demand | recurring date | on-arrival | on-checkout).
2. **Upload media** → either paste a Stream playback URL, or upload the file(s) to the
   provider via the admin (base + optional per-language voiceover variants).
3. **Upload subtitles** → 1 WebVTT per language (drag 5 files); machine-seed option.
4. **Watch dashboard** → per video × workplace: completion list + % + dates, export.

---

## 8. Reuse vs build + phased order (Phase 1)

**Reuse:** `videos`/`video_views` tables + admin/mobile shells; the Claude
translation layer (titles/desc); push (`pushNotification` + `user_push_tokens`);
in-app `notifications`; cron registration pattern (`server.js`); calendar
checkin/checkout sources; `workplaces` table; xlsx export pattern.

**Build (Phase 1), in order:**

| # | Slice | Build | Est. |
|---|---|---|---|
| 1.0 | **Storage/CDN foundation** | Pick + configure Bunny/Cloudflare Stream; signed-URL helper; admin "paste/upload → playback URL" | 1–1.5 d |
| 1.1 | **Schema** | mig: videos += scope/workplace_id/contractor_id/language/created_by/featured; `video_subtitles`; `video_variants`; `video_schedules`; `video_assignments`; video_views += progress/completed_at/UNIQUE; `employees.workplace_id` FK + backfill | 1 d |
| 1.2 | **Scoping + multilingual backend** | scoped list/get (resolve resident workplace); subtitles + variants endpoints; title/desc via translation_cache; localized categories | 1.5 d |
| 1.3 | **Admin** | visibility picker (global/workplace/contractor), subtitle + variant upload, category, featured | 1.5 d |
| 1.4 | **Mobile player** | language-aware player (variant + subtitle track from i18n.language); scoped list already driven by backend; progress reporting | 1.5 d |
| 1.5 | **Watch-tracking + compliance report** | progress upsert endpoint; admin per-video×workplace completion report + export | 1.5 d |
| 1.6 | **Scheduling engine** | `videoScheduler` daily cron (recurring + arrival/checkout); `video_assignments`; push + notify; mobile `routeForNotification` video case | 2 d |

**Suggested MVP cut:** 1.0–1.5 = a **scoped, multilingual, tracked video library
with compliance reporting** (~8 days). 1.6 (scheduling/auto-send) can be a fast
follow once the library + tracking are solid. Total Phase 1 ≈ **10 days** of system
work (excludes Eszti video production).

**Dependencies/risks:** (a) `employees.workplace` data quality → do the
`workplace_id` FK backfill (1.1) before relying on scoping; (b) Stream-provider
choice gates 1.0; (c) signed-URL scoping must be verified (don't leak playback URLs
across workplaces); (d) push reminders need `user_push_tokens` populated (already
wired on the mobile build).

---

## 9. Open decisions for the user
1. **Scoping key:** confirm **workplace-primary** (recommended) + add the
   `employees.workplace_id` FK, vs. text-match for MVP.
2. **Stream provider:** Bunny (recommended) vs Cloudflare Stream vs Mux.
3. **Voiceover variants now or later:** subtitles-only MVP (cheaper) vs include
   per-language Eszti variants in Phase 1.
4. **Scheduling in Phase 1 (1.6) or Phase 2:** auto-send on arrival/December, or ship
   the scoped library + compliance first.
