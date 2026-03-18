# Integrációs Lehetőségek — Harmadik Feles Platformok

---

## 1. Szint: Elengedhetetlen (23-28. Ülés)

### 1. Slack — Napi Check-in Bot

**Felhasználási eset**: Napi hangulat check-in küldése munkavállalóknak Slack-en; válaszok rögzítése pulzus adatként.

| Szempont | Részletek |
|---|---|
| SDK | `@slack/bolt` (Node.js) |
| Hitelesítés | OAuth 2.0 — jogosultságok: `chat:write`, `im:write`, `users:read` |
| Fő API-k | `chat.scheduleMessage`, Block Kit interaktív komponensek |
| Ráfordítás | **Egyszerű** (1-2 hét) |
| Prioritás | **Elengedhetetlen** |

**Megvalósítási folyamat**:
```
Cron (9:00) → Slack scheduleMessage → Felhasználó emoji-t koppint (1-5)
→ Webhook fogadja a választ → POST /wellmind/pulse
```

### 2. Google Naptár — Szünet Javaslatok

**Felhasználási eset**: Megbeszélés túlterhelés felismerése → automatikus jólléti szünetek javaslása; Meet linkek automatikus létrehozása coachinghoz.

| Szempont | Részletek |
|---|---|
| SDK | `googleapis` npm csomag |
| Hitelesítés | OAuth 2.0 (már megvalósítva az alkalmazásban) |
| Fő API-k | `Events.insert`, `FreeBusy.query`, `conferenceData` |
| Ráfordítás | **Egyszerű** (1 hét — OAuth infrastruktúra létezik) |
| Prioritás | **Elengedhetetlen** |

**Megvalósítási folyamat**:
```
Mai naptár elemzése → 3+ óra folyamatos megbeszélés?
→ 15 perces "Jólléti Szünet" esemény beszúrása
→ wellbeing_notification küldése
```

### 3. OpenAI / Claude API — NLP Elemzés

**Felhasználási eset**: Hangulatelemzés pulzus felmérés megjegyzéseken; szorongás felismerés chatbot beszélgetésekben.

| Szempont | Részletek |
|---|---|
| SDK | `@anthropic-ai/sdk` vagy `openai` |
| Hitelesítés | API kulcs |
| Fő API-k | Messages API / Chat Completions |
| Ráfordítás | **Közepes** (2-3 hét) |
| Prioritás | **Elengedhetetlen** |

**Megvalósítás**: Pulzus megjegyzések osztályozása: pozitív/semleges/negatív/szorongó. Automatikus eszkaláció szorongás esetén.

---

## 2. Szint: Magas Érték (29-31. Ülés)

### 4. Microsoft Teams — Check-in Bot

**Felhasználási eset**: Ugyanaz mint a Slack, de Teams-központú szervezeteknek.

| Szempont | Részletek |
|---|---|
| SDK | Teams Bot Framework SDK |
| Hitelesítés | Azure AD alkalmazás regisztráció |
| Fő API-k | Proaktív üzenetküldés, Adaptive Cards |
| Ráfordítás | **Közepes** (2 hét) |
| Prioritás | **Magas** |

### 5. Apple HealthKit — Viselhető Eszköz Adatok

**Felhasználási eset**: Alvásminőség, HRV, lépések olvasása; automatikus pulzus felmérés mezők kitöltése.

| Szempont | Részletek |
|---|---|
| SDK | `react-native-health` |
| Hitelesítés | Típusonkénti eszköz engedélyezés (Apple által kötelezően) |
| Adattípusok | `sleepAnalysis`, `heartRateVariabilitySDNN`, `stepCount` |
| Ráfordítás | **Közepes** (2-3 hét, csak iOS) |
| Prioritás | **Közepes** |

**Adatvédelem**: Az adatok az eszközön maradnak; csak napi aggregált pontszámok kerülnek a szerverre.

### 6. Google Health Connect — Android Viselhető Eszköz

**Felhasználási eset**: Ugyanaz mint a HealthKit Android felhasználóknak.

| Szempont | Részletek |
|---|---|
| SDK | `react-native-health-connect` |
| Adattípusok | `SleepSession`, `HeartRateVariabilityRmssd`, `Steps` |
| Ráfordítás | **Közepes** (2-3 hét, párhuzamosan a HealthKit-tel) |
| Prioritás | **Közepes** |

### 7. Zoom — Videó Coaching

**Felhasználási eset**: Megbeszélési linkek automatikus generálása CarePath coaching foglalásokhoz.

| Szempont | Részletek |
|---|---|
| SDK | Szerver-Szerver OAuth API |
| Fő API | `POST /v2/users/{userId}/meetings` |
| Ráfordítás | **Egyszerű** (1 hét) |
| Prioritás | **Közepes** |

---

## 3. Szint: Jó Ha Van (32+ Ülés)

### 8. Workday / SAP SuccessFactors — HRIS Szinkronizálás

**Felhasználási eset**: Munkavállalói életciklus események (belépés, kilépés) jólléti folyamatok triggerelése.

| Ráfordítás | Nehéz | Prioritás | Alacsony |
|---|---|---|---|

### 9. Zendesk / Intercom — Támogatási Integráció

**Felhasználási eset**: Támogatási jegyek összekapcsolása jólléti ajánlásokkal.

| Ráfordítás | Közepes | Prioritás | Alacsony |
|---|---|---|---|

### 10. Tableau / Power BI — Analitikai Export

**Felhasználási eset**: Vezetői irányítópultok jólléti KPI-kkal.

| Ráfordítás | Egyszerű (adatexport API) | Prioritás | Alacsony |
|---|---|---|---|

---

## Integrációs Architektúra

```
┌──────────────────────────────────────────────────┐
│              HR-ERP Backend                       │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ WellMind │  │ CarePath │  │  Integrációs   │ │
│  │   API    │  │   API    │  │    Réteg       │ │
│  └────┬─────┘  └────┬─────┘  └──────┬─────────┘ │
│       │              │                │           │
│       └──────────────┼────────────────┘           │
│                      │                            │
│  ┌───────────────────┴─────────────────────────┐  │
│  │          Integrációs Szolgáltatás            │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │  │
│  │  │Slack │ │Teams │ │Naptár│ │HealthKit │  │  │
│  │  │ Bot  │ │ Bot  │ │ API  │ │  Szinkr. │  │  │
│  │  └──────┘ └──────┘ └──────┘ └──────────┘  │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```
