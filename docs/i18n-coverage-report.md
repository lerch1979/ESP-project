# i18n Translation Coverage Report

**Date:** 2026-03-20 | **Platform:** HR-ERP Workforce Stability

---

## Infrastructure Status: 100% Complete

| Component | Status | Details |
|---|---|---|
| Backend i18n (locales) | ✅ | 20 JSON files (5 lang × 4 namespaces: common, damageReport, emails, notifications) |
| Admin UI react-i18next | ✅ | Installed, configured, auto-detect from profile |
| Mobile react-i18next | ✅ | Installed, configured, auto-detect from profile |
| Language Management API | ✅ | 7 endpoints (get/set/bulk/stats) |
| Damage Report PDF | ✅ | 5 languages, 35 templates |
| Email templates | ✅ | 5 languages, 7 template types |
| Auto-translation service | ✅ | Cache + mock/Google API ready |
| Pulse Question Library | ✅ | 86 questions in 5 languages |

## Translation Keys

| Platform | Keys/Language | Languages | Total Keys |
|---|---|---|---|
| Backend locales | ~80 | 5 | 400 |
| Admin UI (common.json) | 125 | 5 | 625 |
| Mobile (locales/*.json) | 104 | 5 | 520 |
| **Total** | **~309** | **5** | **1,545** |

## Page-Level Implementation Status

### Admin UI (59 pages)

| Priority | Pages | i18n Import | Strings Translated | Status |
|---|---|---|---|---|
| **P1 - Critical** | Login, Dashboard | Ready | Partial | Keys ready |
| **P1 - High Use** | Users, Tickets, Accommodations | Ready | Partial | Keys ready |
| **P2 - Medium** | Pulse, CarePath, WellMind, Reports | Ready | Partial | Keys ready |
| **P3 - Low** | Remaining 45+ pages | Ready | Hardcoded | Infrastructure ready |

### Mobile (53 screens)

| Priority | Screens | i18n Import | Strings Translated | Status |
|---|---|---|---|---|
| **P1 - Critical** | Login, Dashboard, Pulse | ✅ | Partial (app init loads language) | Auth sets language |
| **P1 - High Use** | WellMind, CarePath screens | Ready | Partial | Keys ready |
| **P2 - Medium** | Tickets, FAQ, Settings | Ready | Partial | Keys ready |
| **P3 - Low** | Remaining 35+ screens | Ready | Hardcoded | Infrastructure ready |

## What Works Today

1. **User logs in** → UI language automatically set from `preferred_language`
2. **Admin changes user language** → PATCH `/users/:id/language`
3. **Damage Report PDF** → `?lang=en` generates in any of 5 languages
4. **Email notifications** → sent in user's preferred language
5. **Pulse questions** → 86 questions available in all 5 languages
6. **Auto-translation** → user content translated via cache/API

## What Needs Gradual Completion

1. **Admin UI pages**: Replace hardcoded Hungarian strings with `t()` calls in 59 JSX files
2. **Mobile screens**: Replace hardcoded strings with `t()` calls in 53 JS files
3. **Navigation labels**: Replace static titles with `t()` in navigators

## Incremental Strategy

The `useTranslation()` hook and all 1,545 translation keys are **ready to use**. Each page can be converted independently:

```jsx
// Step 1: Add import
import { useTranslation } from 'react-i18next';

// Step 2: Get t function
const { t } = useTranslation();

// Step 3: Replace strings
<Button>{t('save')}</Button>  // instead of <Button>Mentés</Button>
```

No architectural changes needed — pure find-and-replace work.

## Languages Supported

| Code | Language | Flag | Admin | Mobile | Backend | PDF | Email |
|---|---|---|---|---|---|---|---|
| hu | Magyar | 🇭🇺 | ✅ | ✅ | ✅ | ✅ | ✅ |
| en | English | 🇬🇧 | ✅ | ✅ | ✅ | ✅ | ✅ |
| tl | Tagalog | 🇵🇭 | ✅ | ✅ | ✅ | ✅ | ✅ |
| uk | Українська | 🇺🇦 | ✅ | ✅ | ✅ | ✅ | ✅ |
| de | Deutsch | 🇩🇪 | ✅ | ✅ | ✅ | ✅ | ✅ |
