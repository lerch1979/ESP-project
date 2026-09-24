# „A felület sikert jelez, a mentés nem történt meg" — rendszerszintű átvizsgálás

**Dátum:** 2026-09-24 · **Státusz:** vizsgálat, **nem építettem semmit**

---

## 0. A LEGFONTOSABB EREDMÉNY — és egy önhelyesbítés

A hibaosztálynak **két fele** van, és **csak az egyik létezik valóban:**

| | állapot |
|---|---|
| **A) a végpont némán eldobja a mezőt** | ✅ **valós, és rendszerszintű** — ez a kódbázis alapértelmezett mintája |
| **B) a felület nem mondja ki a hibaágat** | ⚠️ **ma NEM tud előfordulni** — lásd alább |

**Önhelyesbítés:** ma reggel a számlás javításnál azt írtam, hogy „lezártam egy valódi
néma-siker rést" a felületen. **Ez túlzás volt.** Megvizsgáltam: a backend **sehol nem ad
200-as választ `success: false`-szal** (0 találat az egész kódbázisban), az axios pedig
minden nem-2xx válaszra hibát dob. A `if (res.success)` else-ág nélkül tehát **halott
ág**, nem élő hiba. Amit ott csináltam, az **védekezés**, nem hibajavítás. A tényleges
hiba az eldobott mező volt.

---

## 1. KÉZZEL FELSOROLT MEZŐLISTÁK — a szám önmagáért beszél

```
PUT / PATCH útvonal összesen              91
ebből kontrollerhez köthető, req.body-t olvas   79
  ├─ KÉZZEL felsorolt mezőlista           62   ← itt bármelyik mező némán kieshet
  └─ dinamikus / allow-list minta          4
```

**Vagyis a hibás minta nem kivétel, hanem a kódbázis alapértelmezése: 62 / 66.**

### 1.1 Amit ma ténylegesen eldobnak — végpontonként

A táblaoszlopokat vetettem össze az elfogadott mezőkkel (rendszer-oszlopok — `id`,
`created_at`, `created_by`, … — kiszűrve).

| végpont | eldobott mezők | súly |
|---|---|---|
| **`PUT /billing/rates/:id`** | **`billing_basis`, `vat_exempt`**, `contractor_id`, `accommodation_id`, `workplace_id` | 🔴 **pénzt érint** |
| `PATCH /inspections/:id` | `total_score`, `technical_score`, `hygiene_score`, `aesthetic_score`, `grade`, `scheduled_at`, `started_at`, `completed_at`, `inspector_id`, `inspection_type` | 🟠 az ellenőrzés érdemi adatai |
| `PUT /documents/:id` | `document_date`, **`is_signed_copy`**, `accommodation_id`, `contract_id`, `is_private` | 🟠 az „aláírt példány" jelölés nem javítható |
| `PUT /invoice-drafts/:id` | `performance_date`, `status`, `final_invoice_id`, … | 🟡 |
| `PUT /users/:id` | `preferred_language`, `must_change_password` | 🟡 (a második szándékos) |
| `PUT /cost-centers/:id` | aggregátumok (`total_invoices`, …) | ⚪ szándékos |

**A legfontosabb: `PUT /billing/rates/:id`.**

A `BillingRates.jsx` űrlapja **tartalmazza** a `billing_basis` és a `vat_exempt` mezőt —
a végpont viszont **nem fogadja**. Ha valaki egy meglévő díjsoron átállítaná a
számlázási alapot (fő/ágy/átalány) vagy az ÁFA-mentességet, az **némán nem mentődne.**

> ⚠️ **Ma ez LAPPANGÓ, nem aktív hiba:** az `updateRate` benne van az API-kliensben, de
> **egyetlen képernyő sem hívja** — a díjszabás oldal csak létrehoz. Vagyis a bomba be
> van élesítve, de még senki nem lépett rá. Abban a pillanatban, hogy valaki bedrótoz
> egy „díj szerkesztése" gombot, pénzügyi adat fog némán elveszni.

### 1.2 Amit ELLENŐRIZTEM és rendben van

| végpont | állapot |
|---|---|
| `PUT /contractors/:id` | ✅ a **`tax_number` benne van** — a korábbi hiba javítva |
| `PUT /invoices/:id` | ✅ a mai javítás után mind a három mező átmegy |
| `PUT /accommodations/:id` | ✅ az űrlap 11 mezője pontosan egyezik az elfogadottakkal |
| `PUT /documents/:id` | ✅ a `DocumentDetailModal` pontosan a 4 elfogadott mezőt küldi |

*(Egy módszertani megjegyzés: az első elemzőm hamisan jelentette hiányzónak a
`tax_number`-t és a `supplier_invoice_number`-t, mert a magyar kommentekben lévő
vesszők elnyelték a mezőneveket a darabolásnál. A kommentmentesítés után futtattam újra
— a fenti számok már a javított elemzésből valók.)*

---

## 2. A FELÜLET: hol jelez sikert ellenőrzés nélkül

### 2.1 Amit kerestem, és amit találtam

| minta | találat | valódi kockázat |
|---|---|---|
| `if (res.success) { … }` **else nélkül** | **200 hely** | ⚪ **nincs** — a backend sosem ad 200-at `success:false`-szal |
| `toast.success` közvetlenül `await` után | **74 hely** | ⚪ **nincs** — az axios nem-2xx-re dob, a `catch` elkapja |
| **mentés `await` nélkül** | **6 találat → mind hamis** | ⚪ nincs (mind egy `await`-elő segédfüggvényben) |
| **ÜRES `catch` blokk** | **64 hely** | 🔴 **ez a valódi rés** |

### 2.2 Az ÜRES catch a tényleges veszély

```js
try { ... } catch {}            // a hiba nyomtalanul eltűnik
.catch(() => {})
```

**64 helyen** nyeljük el a hibát szó nélkül. Itt tényleg megtörténhet, hogy a művelet
elbukik, és a felhasználó semmit nem lát — mert nincs is mit látnia.

Ezek nagy része ártalmatlan (háttérbetöltés, nyelvváltás), de vannak köztük
**mentési utak**, például a `DamageReportEditModal.jsx:83` és `:91` — épp a
kárjegyzőkönyv-szerkesztésben, amiről tegnap kiderült, hogy a lánc amúgy is félkész.

➡️ **Az üres catch-eket egyesével kell átnézni** — ez a 2. kérdésed valódi válasza, nem
a `toast.success`-minta.

---

## 3. SZERKEZETI MEGOLDÁS — hogy ez az osztály ne tudjon visszajönni

A javaslatom **három réteg**, és szándékosan ebben a sorrendben. Az 1-es önmagában
megoldja a problémát; a 2-es és 3-as olcsó, és a jövőt védi.

### ① Ismeretlen mező → HIBA, ne csendes eldobás *(ez a kért „szerkezeti kizárás")*

Egy közös segéd, amit minden szerkesztő végpont használ:

```js
// utils/patchBody.js
const { patch, ismeretlen } = szurPatch(req.body, ENGEDETT_MEZOK);
if (ismeretlen.length) {
  return res.status(400).json({
    success: false,
    code: 'UNKNOWN_FIELD',
    message: `Ismeretlen vagy nem szerkeszthető mező: ${ismeretlen.join(', ')}. `
      + 'A mentés nem történt meg.',
  });
}
```

**Miért ez a helyes viselkedés:** ma a rendszer *úgy tesz, mintha* mentett volna. Egy
400-as hiba a felhasználónak kellemetlen, de **igaz** — és azonnal kiderül, ahelyett hogy
hetekkel később egy könyvelő venné észre.

**Amire figyelni kell:** a `data = { ...form }` alakú küldések (pl. az
`InvoiceFormModal`) olyan mezőket is küldenek, amiket *szándékosan* nem mentünk
(`invoice_number`, `is_landlord_notice`). Ezért az engedélylistának **két része** kell
legyen: `MENTHETO` és `FIGYELMEN_KIVUL_HAGYHATO` — ami egyikben sincs, az hiba.
Enélkül a bevezetés napján 400-akba futna minden űrlap.

### ② Egy körbe-teszt MINDEN szerkesztő végpontra *(a CI-ben fogja meg)*

A mai `SUPNUM-09` általánosítása: a teszt végigmegy a szerkesztő végpontokon, minden
engedélyezett mezőre küld egy értéket, visszaolvassa az adatbázisból, és **megnevezi azt,
amelyik nem érkezett meg.** Így ha valaki új mezőt vesz fel az űrlapra, de a végpontra
nem, a CI szól — nem a felhasználó három hónappal később.

### ③ Üres catch tiltása a mentési utakon

ESLint `no-empty` (`allowEmptyCatch: false`) a `hr-erp-admin/src`-ra. Ahol tényleg
szándékos az elnyelés, ott egy egysoros indoklás kell — pont, mint a repó többi részén.

### Amit NEM javaslok

- **Ne írjuk át mind a 62 végpontot egyszerre.** Az ①-es segédet elég az új és a
  módosított végpontokba bevezetni, plusz a ②-es teszt kimutatja, melyik 62-ből melyik
  hibás ténylegesen. A „nagy átírás" kockázata nagyobb, mint a haszna.
- **Ne legyen `SELECT *`-alapú automatikus mező-elfogadás.** Az azt jelentené, hogy egy
  `is_active` vagy `contractor_id` mező is átírható a kérésből — jogosultsági rés lenne.

---

## 4. JAVASOLT SORREND

| # | lépés | méret | miért |
|---|---|---|---|
| 1 | **`PUT /billing/rates/:id` kiegészítése** (`billing_basis`, `vat_exempt`, …) | kicsi | ez az egyetlen **pénzt érintő** lappangó eset |
| 2 | **A 64 üres catch átnézése**, a mentési utakon beszédes hibaüzenet | közepes | ez a 2. kérdésed valódi válasza |
| 3 | **`szurPatch` segéd + ismeretlen mező → 400**, az új végpontoktól kezdve | közepes | a szerkezeti kizárás |
| 4 | **Körbe-teszt a CI-ben** minden szerkesztő végpontra | közepes | ez fogja meg a jövőbelieket |
| 5 | ESLint `no-empty` catch-tiltás | kicsi | hogy ne keletkezzen új |

---

## ÖSSZEFOGLALÓ

**Elkészült:** rendszerszintű átvizsgálás, nem építettem. **91 szerkesztő végpontból 62 kézzel felsorolt mezőlistával dolgozik** — a hibás minta a kódbázis alapértelmezése, nem kivétel. Ténylegesen eldobott mezőt **öt végponton** találtam; a legsúlyosabb a **`PUT /billing/rates/:id`**, ami a `billing_basis`-t és a `vat_exempt`-et dobja el — ez **pénzt érintene**, de ma **lappangó**, mert egyetlen képernyő sem hívja (a díjszabás oldal csak létrehoz). A `tax_number` és a mai számlaszám-javítás rendben van.
**Önhelyesbítés:** a 2. kérdésed feltevése ma **nem áll fenn** — a backend sehol nem ad 200-at `success: false`-szal (0 találat), az axios pedig minden hibára dob, tehát a 200 db `if (res.success)` és a 74 db `toast.success` **halott ág, nem élő hiba**. A ma reggeli „néma-siker javításom" ezért **védekezés volt, nem hibajavítás** — ezt pontosítanom kell. A valódi rés máshol van: **64 üres `catch` blokk**, köztük a kárjegyzőkönyv-szerkesztésben is.
**Döntési pont:** bevezessük-e az „ismeretlen mező → 400" szabályt. Ez **szerkezetileg kizárja** az osztályt, de kétrészes engedélylistát igényel (menthető / szándékosan figyelmen kívül hagyható), különben a bevezetés napján minden űrlap 400-ba futna.
**Tőled kell:** jóváhagyás a 4. pont sorrendjére — elsőként a díjszabás-végpont javítását és a 64 üres catch átnézését javaslom, a szerkezeti megoldást utána.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-nema-mentes-rendszerszintu-2026-09-24.md
