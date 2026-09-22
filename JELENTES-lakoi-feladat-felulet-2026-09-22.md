# Lakónak szóló feladat: deploy + felület

**Dátum:** 2026-09-22 · **Commit:** `42141255` · **Functest:** 299 passed / 0 failed

---

## 1. Deploy ✅ MEGTÖRTÉNT

CI zöld → mentés (`db-20260922-1149.dump`) → `pull && up -d` → **mig 172 lefutott**.

```
▶ [172] resident_tasks...
✓ [172] resident_tasks — applied
```

Ellenőrizve élesben: `assigned_to_employee_id` oszlop létezik, `api: 200`.

---

## 2. A kérdésed egy sorban

**Van-e Eszti fiókjához push-token az éles adatbázisban?**

> **Igen — 1 db, iOS/iPhone, regisztrálva 2026-09-22 07:40:05, és a szerverről küldött
> próbapush `{"sent":1}` eredménnyel ment ki.** Nincs teendő a telefonon.

*(Megjegyzés: a `sent:1` azt jelenti, hogy az Expo átvette. Ha az értesítés mégsem jelenik
meg a telefonon, a hiba az iOS-oldali kézbesítésnél van, nem a szervernél.)*

---

## 3. Admin kiosztó felület

A `TaskCreationModal`-ban új kapcsoló:

> **„A LAKÓNAK szól — látja az appban, push-t kap, visszajelezhet"**

**Alapból KI van kapcsolva**, és ez szándékos: a feladatok túlnyomó többsége belső
teendő. Egy alapértelmezésben bekapcsolt kapcsoló előbb-utóbb egy bizalmas feljegyzést
tenne a lakó telefonjára — az pedig nem szépséghiba, hanem bizalmi kérdés.

**A kapcsoló csak akkor jelenik meg**, ha tudjuk, melyik lakóról van szó. Enélkül a
bekapcsolás néma kudarc lenne: a feladat elkészülne, de soha nem jelenne meg senkinél.

**Bekapcsolva figyelmeztetés szól:** *„A lakó EZT A CÍMET ÉS LEÍRÁST fogja látni a
telefonján — fogalmazz neki szólóan."*

---

## 4. Mobil teendőlista

Új fül, **csak a lakónak**. Három visszajelzés: **láttam / folyamatban / kész**.

**A „kész" után nincs több gomb.** A visszajelzés nem visszavonható a telefonról — ha a
lakó tévedett, az irodát kell megkeresnie. Így marad nyoma a változtatásnak.

A fül **minden megnyitáskor frissít**, mert a teendő push-sal is érkezhetett közben.

**Öt nyelven** (hu/en/uk/tl/de) — a navigációs felirat és az összes teendő-szöveg.

---

## 5. Amit menet közben találtam: az i18n-őr vakfoltja

A `check-i18n-coverage.js` a **JSX-kommentet** (`{/* … */}`) felhasználói szövegnek látta,
és elbukott rajta.

**Ez valódi akadály volt, nem csak az én dolgozatom:** a `CLAUDE.md` magyar kommentelést
ír elő, tehát **minden magyarul kommentelt lakói képernyő elbukott volna** ezen az őrön.

Javítva: az őr kihagyja a JSX-kommentet. A megjelenő szöveget ez **nem engedi át** — a
`{'szöveg'}` alakot nem érinti az új ág. Az új képernyő felvéve az őr listájára
(**5 → 6** vizsgált képernyő), és zöld.

---

## 6. Mobil build — SZÁNDÉKOSAN NEM készült

A döntésed szerint egy build viszi majd a **chat-képet**, a **push-javításokat** és a
**teendőlistát** is — így csak egyszer kell az Apple ellenőrzésén átmenni.

Az előző körben készült **iOS build 7** már fent van a TestFlighton; az a teendőlistát
még **nem** tartalmazza.

---

## 7. Állapot

| | |
|---|---|
| Backend (mig 172) | ✅ élesben |
| Admin kiosztó | ✅ kész, **élesítésre vár** |
| Mobil teendőlista | ✅ kész, **buildre vár** |
| Functest | 299 passed / 0 failed |
| i18n-őr | zöld, 6 képernyő |
