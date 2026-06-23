# iOS Release Checklist — TestFlight → App Store

Everything you do **once the Apple Developer Organization account is approved**.
Code + config are already prepped (commit `8880ad30`): `ios.bundleIdentifier =
hu.housingsolutions.hrerp`, `ITSAppUsesNonExemptEncryption: false`, EAS profiles
`ios-simulator` + `testflight`. App Store Connect (ASC) = https://appstoreconnect.apple.com.

---

## 0. Prerequisites (confirm once enrolled)
- [ ] Organization enrollment **Active** (developer.apple.com → Membership shows the company as the legal entity / "Account Holder").
- [ ] You're signed into ASC with that Apple ID (Account Holder or Admin role).
- [ ] **Privacy Policy URL is live** — required to submit. Host a page (e.g. `https://app.housingsolutions.hu/privacy`) covering: data collected (name, email, photos, push token), purpose, retention, contact. *(We don't have one yet — needs creating; it's a submit blocker.)*

## 1. Register the Bundle ID + create the app record
- [ ] **Bundle ID:** EAS auto-registers `hu.housingsolutions.hrerp` on the first `eas build` (or do it manually: developer.apple.com → Certificates, IDs & Profiles → Identifiers → +). Enable capability **Push Notifications**.
- [ ] **Create app:** ASC → Apps → **+** → New App:
  - Platform: **iOS**
  - Name: **Housing Solutions HR** *(must be unique on the App Store — have a fallback like "Housing Solutions Resident" ready in case it's taken)*
  - Primary language: **Hungarian**
  - Bundle ID: `hu.housingsolutions.hrerp`
  - SKU: any internal string, e.g. `hrerp-ios-001`
  - User Access: Full Access

## 2. App Privacy ("nutrition label") — answers for OUR app
ASC → your app → **App Privacy**. **Tracking: select "No" / "Data Not Used to Track You"** — we have no ad SDK, no IDFA, no cross-app tracking. Then declare these **Data Types** (each: *Linked to the user = Yes*, *Used for tracking = No*, *Purpose = App Functionality* unless noted):

| Data type (Apple category) | What it is in our app | Linked? | Purpose |
|---|---|---|---|
| **Name** (Contact Info) | resident first/last name | Yes | App Functionality |
| **Email Address** (Contact Info) | login + account | Yes | App Functionality |
| **Photos or Videos** (User Content) | profile photo + ticket photos | Yes | App Functionality |
| **Customer Support / Other User Content** | ticket descriptions, chat messages | Yes | App Functionality |
| **Device ID** (Identifiers) | push token (Expo/APNs) for notifications | Yes | App Functionality |

> **Verified in code:** the **mobile app has NO Sentry / crash-reporting SDK** (Sentry is only in the admin *web* app) and **no location module** (`expo-location` absent). So **do not declare Diagnostics (Crash/Performance) or Location** for the iOS app — it would be over-declaring.

**Do NOT declare:** Diagnostics/Crash Data (no Sentry in the app), Location (no `expo-location`), Contacts, Health, Financial, Browsing history, Search history, Advertising data — none collected.

## 3. Export compliance — already handled
`ITSAppUsesNonExemptEncryption: false` is set in `app.json` (app uses only standard HTTPS/TLS). This **auto-answers** the export-compliance question on every upload — no per-build prompt, no extra paperwork.

## 4. Build + submit (our EAS profiles)
From `hr-erp-mobile/` once enrolled:
- [ ] `eas build --platform ios --profile testflight` — first run prompts an **Apple login**; EAS then auto-creates the **Distribution certificate + provisioning profile + APNs key** (push) and builds the `.ipa` (~20–40 min cloud, no Mac needed).
- [ ] `eas submit --platform ios --profile production --latest` — uploads to ASC. *(Or set up an App Store Connect API key in EAS for non-interactive submit — recommended; avoids 2FA prompts.)*
- [ ] Build appears in ASC → TestFlight after processing (~15–60 min).

## 5. TestFlight (internal testing — no Apple review)
- [ ] ASC → TestFlight → the processed build → complete **"Test Information"** (what to test, contact email) + **export-compliance** shows already answered.
- [ ] **Internal Testing** group → add testers by Apple ID (you + colleagues, up to **100**, must be ASC users with a role). Internal = **no Beta App Review**, available immediately.
- [ ] Testers install the **TestFlight** app from the App Store → accept invite → install your build on their iPhone.
- [ ] *(External testers >100 / outside the team → needs a one-time **Beta App Review**, ~1 day.)*

## 6. App Store submission (later — full review)
- [ ] Screenshots (6.7" + 6.5" iPhone required; 5.5" optional) — can generate from the simulator/device.
- [ ] App description, keywords, support URL, category (**Business** or **Productivity**), age rating questionnaire.
- [ ] Privacy Policy URL (same as §0).
- [ ] Demo account for the reviewer (a test resident login) — they WILL need to log in.
- [ ] Submit for **App Review** (~1–3 days). Common rejection risks for us: login-gated app with no demo account; missing privacy policy; permission strings (we have them).

---

## Reference — our config (already done)
- `app.json`: `ios.bundleIdentifier = hu.housingsolutions.hrerp`, `infoPlist.ITSAppUsesNonExemptEncryption = false`, permission strings (Face ID / camera / photos) via plugins.
- `eas.json`: `ios-simulator` (no-Apple test build), `testflight` (store distribution).
- Push: Expo push tokens → APNs; EAS generates the APNs key at first iOS build.
- Icon: `icon.png` 1024² (Expo flattens alpha for the store icon at build time).

## The fast path once approved
Create app in ASC → `eas build -p ios --profile testflight` → `eas submit` → add internal testers → install via TestFlight. **Same day** after enrollment is active.
