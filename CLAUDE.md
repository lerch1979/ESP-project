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

---

## 📄 JELENTÉSEK FORMÁTUMA — MINDEN JELENTÉSRE KÖTELEZŐ

### 1. A teljes jelentés FÁJLBA megy

Minden érdemi jelentést ments `.md` fájlba az asztalra:

```
~/Desktop/HR-ERP-PROJECT/JELENTES-<tema>-<ÉÉÉÉ-HH-NN>.md
```

(A `~/Desktop/HR-ERP-PROJECT` a repó gyökerére mutató symlink, tehát a fájl a repóban
landol — ha nem akarod verziózni, a gyökér `*.xlsx`/`*.md` gitignore-mintáját bővítsd.)

**Miért:** a terminálból a hosszú jelentés beillesztése nem működik, és egy fájl később
is visszakereshető — a beszélgetés görgetősávja nem az.

### 2. A beszélgetésben a jelentés VÉGÉN kötelező egy ÖSSZEFOGLALÓ blokk

**Legfeljebb 5 sor, magyarul**, pontosan három dolgot mondjon el:

1. **mi készült el** — tényszerűen, nem folyamat-leírásként,
2. **mi a döntési pont** — amiben a tulajdonosnak választania kell,
3. **mi kell tőle** — konkrét cselekvés (jóváhagyás, adat, hozzáférés).

Sablon:

```markdown
## ÖSSZEFOGLALÓ
**Elkészült:** …
**Döntési pont:** …
**Tőled kell:** …
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-….md
```

**Miért 5 sor:** a részletes indoklás a fájlban van. Az összefoglaló arra való, hogy a
képernyőre pillantva el lehessen dönteni, kell-e most foglalkozni vele. Ha nincs döntési
pont vagy nem kell semmi, azt is **ki kell mondani** („Döntési pont: nincs") — egy üresen
hagyott sor azt üzeni, hogy elfelejtetted, nem azt, hogy nincs.

### 3. Amit az összefoglaló NEM tartalmazhat

- Nem ismétli meg a részleteket, amik a fájlban vannak.
- Nem szépíti az eredményt: ha valami félkész vagy nem sikerült, az az „Elkészült"
  sorban tényként szerepel, nem hagyható ki.
- Nem ígér olyan következő lépést, amit nem hagytak jóvá.

---

## ✅ MIKOR NEVEZHETŐ EGY FUNKCIÓ KÉSZNEK

### A teljes lánc szabálya

Egy funkció **csak akkor jelenthető késznek**, ha mind a négy lépés megvan:

1. **adatbevitel** — van FELÜLET, ahol egy valódi felhasználó be tudja vinni az adatot,
2. **tárolás** — a rendszer eltárolja (adatbázis, migráció),
3. **megjelenítés** — a felhasználó vissza is látja,
4. **éles próba** — élesben, VALÓS felhasználóként végigpróbálva.

**Ha bármelyik hiányzik, az a jelentésben TÉNYKÉNT szerepel** — „a felület még nincs
meg" —, nem pedig készként.

### Az „Elkészült" sorban mindig ott a HELY

Az összefoglaló „Elkészült" sora **mondja ki, hol lehet az adatot bevinni**, konkrét
menüponttal:

> **Elkészült:** … Megtalálod: **Hibajegyek → „Új hibajegy" → az űrlap alján
> „Kit érint még?"**

**Ha nincs ilyen hely, a funkció nem kész.** Ez a mondat nem díszítés: ha nem tudom
leírni, hová kell kattintani, akkor a funkciót nem lehet használni.

### Miért ez a szabály

Mert pontosan ez történt a „több érintett lakó" funkcióval (2026-09-22): a backend tudta,
a mobil megjelenítette, a migráció lefutott — és **élesítve**-ként jelentettem. Az admin
felületen viszont sehol nem volt hol megadni, tehát a gyakorlatban a funkció nem
létezett. A tesztelő vette észre, nem én.

A tárolás és a megjelenítés megléte **nem** funkció. A funkció az, amit a felhasználó
el tud végezni.

### Ellenőrző kérdések, mielőtt bármit késznek jelentek

- Hová kattint a felhasználó? (Ha nem tudom egy mondatban leírni → nem kész.)
- **Mindkét** úton megvan? (Létrehozás ÉS szerkesztés — az egyik önmagában fél funkció.)
- Kiment-e a felület frissítése, és a **deployolt** csomag tartalmazza-e? (A forráskód
  nem bizonyíték — a `grep` a deployolt bundle-ön az.)
- Végigpróbáltam-e élesben, **valódi felhasználóként**, nem csak a végpontot hívva?
