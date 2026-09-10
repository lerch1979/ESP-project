# Project entrypoint for Claude Code

You are working in the HR-ERP project (`/Users/lerchbalazs/dev/HR-ERP-PROJECT`).

**Before doing ANY work in this repo, read these three files in order:**

1. `PROJECT_STATE.md` — live architecture, active vs dormant systems, known overlaps, tech debt, current focus.
2. `CLAUDE_CODE_INSTRUCTIONS.md` — how to operate as a Claude Code agent in this repo.
3. Most recent entry in `SESSION_LOG.md` — what the previous session did, what's in flight, what's next.

Then run `git log --oneline -10` and `git status` and **briefly summarize** to the user what you understand before diving in.

**Open architectural decision:** see `docs/ARCH_COST_TRACKING_OPTIONS.md` — cost-tracking unification between old `cost_centers` pipeline and new `accommodation_expenses`. Awaiting user choice.

**Duplication is a real risk in this repo.** Before adding anything new, search for existing systems and check the "Known overlaps" section of `PROJECT_STATE.md`.

**🌐 Resident i18n guard (MANDATORY before committing resident-facing changes).** If a change touches resident-facing UI (the mobile resident screens) OR DB enums a resident can see (ticket categories / statuses / priorities), run:

```
node scripts/check-i18n-coverage.js     # must exit 0
```

It verifies every resident-visible enum slug has a key in all 5 locales (hu/en/uk/tl/de) and that the resident-only screens contain no hardcoded Hungarian. Do not commit such changes if it exits non-zero — fix the gaps it lists first. (Needs Postgres up; honors `$DATABASE_URL`.)

---

## 🇭🇺 A KOMMUNIKÁCIÓ NYELVE: MAGYAR

**Minden, amit a felhasználónak írsz, magyarul legyen.** Ez vonatkozik a jelentésekre,
összefoglalókra, kérdésekre, hibaüzenetekre, a javaslatokra és a döntési pontokra is —
tehát mindenre, amit a beszélgetésben olvas.

**Kivétel — ezek maradnak angolul, mert konkrét technikai értékek, nem szövegek:**

- kód és kódrészletek
- commit üzenetek
- fájl- és könyvtárnevek (`billingEngine.service.js`, `docs/PROJECT_STATE.md`)
- adatbázis-táblák, -mezők és -enumok (`accommodation_expenses`, `rate_status`, `end_date`)
- rendszer-állapotnevek (`finalized`, `calculated`, `payroll_handoff`, `missing`, `not_needed`)
- parancsok, kapcsolók, HTTP-metódusok és végpontok (`npm run functest`, `POST /expenses`)
- külső szolgáltatások és szabványok nevei (`EAS`, `TestFlight`, `MNB`, `SOAPAction`)

**Ha egy technikai fogalmat magyarul írsz, tedd zárójelbe az angol megfelelőjét** —
egyszer, amikor először előfordul az adott jelentésben. Például:

> A hónapzárás (month close) elutasítja a lezárást, amíg van árfolyam nélküli tétel.
> A sor-szintű szűrés (row-level scoping) a `owner_user_id` mezőn keresztül működik.

**Miért ez a szabály:** az állapotnevek és mezőnevek adatbázis-értékek — ha lefordítom
őket, a jelentés már nem egyezik azzal, amit a rendszerben látsz, és egy `finalized`
állapotot kereső ember nem találja meg a "lezárt" szót. A magyar szöveg neked szól, az
angol azonosítók a rendszernek.
