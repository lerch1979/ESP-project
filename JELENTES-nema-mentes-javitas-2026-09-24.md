# A néma mentés hibaosztálya — mindhárom lépés kész

**Dátum:** 2026-09-24 · **Élesítve:** igen · **Teljes functest:** 370 passed / 0 failed

---

## 0. AZ ÖNHELYESBÍTÉS, AHOGY KÉRTED — és egy MÁSODIK is

### Amit ma reggel a számlás javításról írtam

> „Lezártam egy valódi néma-siker rést a felületen."

**Ez túlzás volt.** A backend **sehol nem ad 200-as választ `success: false`-szal** (0
találat az egész kódbázisban), az axios pedig minden nem-2xx válaszra hibát dob. A
`if (res.success)` else-ág nélkül tehát **halott ág**, nem élő hiba.

**Amit ott csináltam, az védekezés volt, nem hibajavítás.** A tényleges hiba az eldobott
mező volt. Ez így, ebben a formában kerül a jelentésbe.

### És egy másik, amit ma találtam magamon

A tegnapi jelentésemben a **64 üres `catch`**-et „a valódi rés"-ként írtam le. A
kategorizálás után a kép **lényegesen jobb**:

> **Valódi mentési úton EGYETLEN üres catch sincs.**

Az egyetlen, amit az első elemzőm „MENTÉS"-nek jelölt (`VideoDetailModal`), valójában
egy **sikeres szerkesztés utáni újratöltés** — a mentést a szerkesztő ablak már
elvégezte. A „valódi rés" megfogalmazás tehát szintén erősebb volt a kelleténél.

---

## 1. ELSŐ — `PUT /billing/rates/:id` (pénzt érint)

### Ami eddig némán elveszett

| mező | mit dönt el |
|---|---|
| **`billing_basis`** | **hogyan számolunk**: fő / ágyéjszaka / átalány |
| **`vat_exempt`** | ÁFA-mentes-e a díjsor |

Ma lappangó volt (egyetlen képernyő sem hívja a szerkesztést), de ahogy írtad:
szerződések változnak, és az első mentés **némán elrontaná a számlázást** — úgy, hogy a
hiba csak a hónap végén, a számlán derülne ki.

### Amit szándékosan NEM engedek, és most kimondok

A `contractor_id` és az `accommodation_id` **nem szerkeszthető**, de nem csendben
eldobva, hanem **400-zal és indoklással**:

> „A(z) `contractor_id` meglévő díjsoron nem módosítható: az a díj **AZONOSÍTÓJA**, nem
> tulajdonsága. Átírása a már kiszámlázott hónapokat változtatná meg. Nyiss új díjsort,
> a régit pedig zárd le egy érvényességi véggel."

### Az adatbázis-ellenőrzések is emberi nyelvre fordulnak

Egy `per_bed_night` alapra váltás `rate_used` nélkül eddig nyers `23514`-et dobott.
Most: *„A díjsor így ellentmondásos lenne: a választott számlázási alaphoz tartozó összeg
hiányzik…"*

### Éles próba

```
kiindulás:          per_bed_night | ÁFA-mentes: false
azonosító átírása -> 400  "…az a díj AZONOSÍTÓJA, nem tulajdonsága…"
vat_exempt=true   -> 200  | adatbázisban: true      ← EDDIG ITT NÉMÁN ELVESZETT
ellentmondásos    -> 400  "A díjsor így ellentmondásos lenne…"
visszaállítva.
```

---

## 2. MÁSODIK — a 64 üres catch, kategorizálva

| kategória | db | mit tettem |
|---|---|---|
| **valódi mentési út** | **0** | — (lásd az önhelyesbítést) |
| **opcionális listabetöltés** | 53 | közös segéd: konzol mindig, felhasználói üzenet ott, ahol látható a következmény |
| egyéb (nyelvváltás, háttérfrissítés) | 11 | kommentet kap, miért szándékos |

### Miért nem elég a `catch {}`, még „opcionális" betöltésnél sem

> Ha a dolgozó-lista betöltése elbukik, a felhasználó egy **üres legördülőt** lát.
> „Nincs egyetlen dolgozó sem?" — **de van**, csak a lekérdezés hibázott. A hiba nem
> tűnik el: átalakul egy félreértéssé.

### A megoldás: `utils/nonFatal.js`

A két rossz véglet helyett (néma elnyelés ↔ minden hibára felugró ablak):

- a **konzolba mindig** ír, helymegjelöléssel — a támogatás ebből dolgozik;
- a **felhasználónak csak ott** szól, ahol a hiány egy vezérlőt **használhatatlanná**
  tesz, és akkor is **egyszer** (nem három párhuzamos betöltésnél háromszor).

### Ahol bekötöttem (a következmény láthatósága szerint)

| hely | miért ez |
|---|---|
| **kárjegyzőkönyv-szerkesztés** (szállás- és dolgozó-választó) | **ez volt az első, ahogy kérted** |
| **BillingRates** (díjlista) | a legveszélyesebb: üres listát látva a felhasználó **újat rögzítene** egy meglévő mellé |
| UserFormModal (szerepkörök) | itt a hiány lehet jogosultsági kérdés is — csak konzol |
| VideoDetailModal | sikeres mentés utáni újratöltés — a sikerüzenet jogos, de a képernyőn régi adat maradhat |

---

## 3. HARMADIK — „ismeretlen mező", FOKOZATOSAN

**Az 1. fázis csak NAPLÓZ, nem utasít el** — pontosan ahogy kérted. Az azonnali 400 a
bevezetés napján állítaná meg a munkát, vagyis **a javítás okozna üzemzavart**.

```
[ismeretlen-mező] PUT /api/v1/invoices/… — a kérés olyan mezőt hozott, amiről senki
nem döntött: ez_a_mezo_nem_letezik (felhasználó: …) → most csak naplózás, a mentés
folytatódik
```

### A kétrészes engedélylista

| rész | jelentése |
|---|---|
| **MENTHETŐ** | ezt eltároljuk |
| **FIGYELMEN KÍVÜL** | a felület küldi, de **tudatosan** nem mentjük (belső sorszám, csak megjelenítési jelölők) |

**Ami egyikben sincs, arról senki nem döntött** — az a gyanús, azt naplózzuk.

### A 2. fázis felkapcsolása

Egyetlen környezeti változó: `UNKNOWN_FIELD_ENFORCE=true`. **Nem kapcsoltam fel** — előbb
látni kell a naplóból, hol futna 400-ba. Elsőként a számlás végponton vezettem be, mert
az a ma legjobban értett eset.

---

## 4. TESZTEK

```
WPRATE-90  ⚠️ a díjsor SZERKESZTÉSE átveszi a billing_basis-t és a vat_exempt-et
WPRATE-91  a megbízó/szállás ÁTÍRÁSÁT kimondottan elutasítja — nem csendben dobja el
WPRATE-92  ellentmondásos díjsor ÉRTHETŐ hibát kap, nem "Hiba"-t

UFIELD-01  a MENTHETŐ és a TUDATOSAN figyelmen kívül hagyott mező NEM gyanús
UFIELD-02  ⚠️ amiről SENKI NEM DÖNTÖTT, azt megnevezi
UFIELD-03  az 1. fázis NEM utasít el — a mentés folytatódik
UFIELD-04  a számlás végpont ismeretlen mezővel is MENT (1. fázis), és naplóz
UFIELD-05  az ÁLTALÁNOS mezők (id, created_at) nem számítanak ismeretlennek
```

**370 passed / 0 failed.**

---

## 5. MI KÖVETKEZIK EBBEN A SZÁLBAN

| # | lépés | állapot |
|---|---|---|
| 1 | díjszabás-végpont | ✅ kész, élesítve |
| 2 | üres catch-ek | ✅ kategorizálva, a következményesek javítva |
| 3 | ismeretlen mező — **naplózó fázis** | ✅ kész |
| 4 | ismeretlen mező — **éles fázis** | ⏳ a napló alapján, külön döntéssel |
| 5 | a naplózó őr kiterjesztése a többi 61 végpontra | ⏳ |
| 6 | ESLint `no-empty` catch-tiltás | ⏳ |

*(Az aláírás-szál — kárigény, ellenőrzési jegyzőkönyv, lakói telefon, videó-modul —
ettől függetlenül fut tovább.)*

---

## ÖSSZEFOGLALÓ

**Elkészült:** mindhárom lépés, élesítve. **(1)** A `PUT /billing/rates/:id` átveszi a `billing_basis`-t és a `vat_exempt`-et — élesben igazolva (`vat_exempt=true` → 200, az adatbázisban is); a megbízó/szállás átírását **kimondva utasítja el** (400), mert az a díjsor azonosítója, és a már kiszámlázott hónapokat írná át. **(2)** A 64 üres catch kategorizálva; közös `nonFatal` segéd: konzolba mindig, felhasználói üzenet ott, ahol a hiány egy vezérlőt használhatatlanná tesz — a kárjegyzőkönyv-szerkesztéssel kezdve. **(3)** Az „ismeretlen mező" őr **naplózó fázisban** él, kétrészes engedélylistával; az éles kapcsoló (`UNKNOWN_FIELD_ENFORCE`) **nincs felkapcsolva**. Suite **370/0**.
**Önhelyesbítés (két darab):** a ma reggeli „néma-siker javítás" **védekezés volt, nem hibajavítás** — a backend sehol nem ad 200-at `success:false`-szal. És a tegnapi „64 üres catch a valódi rés" is erősebb volt a kelleténél: **valódi mentési úton egyetlen üres catch sincs**, a kockázat az üres legördülők félreérthetősége.
**Döntési pont:** mikor kapcsoljuk fel az „ismeretlen mező" éles fázisát. Javaslom: néhány nap naplógyűjtés után, a talált mezők átnézésével.
**Tőled kell:** semmi most. Pár nap múlva átnézem a naplót, és jelentem, hol futna 400-ba.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-nema-mentes-javitas-2026-09-24.md
