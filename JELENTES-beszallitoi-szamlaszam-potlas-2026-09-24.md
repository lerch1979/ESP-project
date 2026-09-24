# A beszállítói számlaszámot nem lehetett pótolni — javítva

**Dátum:** 2026-09-24 · **Élesítve:** igen · **Teljes functest:** 352 passed / 0 failed

---

## 1. A NÉGY KÉRDÉSED — pontról pontra

### 1. Fogadja-e a szerkesztő végpont a mezőt? — **NEM, némán eldobta**

Pontosan az a minta, amire gyanakodtál. Az `update` végpont **kézzel felsorolt
mezőlistából** olvassa ki a kérés törzsét, és ami nincs a listán, az **csendben elvész**:

```js
const {
  vendor_name, vendor_tax_number, amount, currency, ...
} = req.body;          // ← supplier_invoice_number nem volt benne
```

Nem hibázott, nem naplózott, **200-at adott vissza a változatlan sorral**.

**HÁROM mező hullott el, nem csak egy:**

| mező | mit jelent, hogy nem ment át |
|---|---|
| `supplier_invoice_number` | a jogi azonosító — **ezt jelezted** |
| `performance_date` | devizás számlánál **ez dönti el az MNB árfolyamot**; a javítása eddig hatástalan volt, és senki nem tudott róla |
| `vendor_contractor_id` | a szállító partnerhez kötése |

A belső `invoice_number` szándékosan kint marad: azt mi adjuk, nem szerkesztendő adat.

### 2. Honnan olvassa a lista a számot? — **jó helyről**

A lista a `supplier_invoice_number`-t mutatja nagyban, alatta halványan a belső
sorszámot, és „hiányzik"-ot ír, ha nincs. **Ez helyes volt** — nem itt volt a hiba.

**De a szerkesztő űrlapon volt egy MÁSODIK hiba:** az űrlap **be sem töltötte** a meglévő
számlaszámot (nem szerepelt sem a kezdőértékek közt, sem a betöltésnél). Egy olyan
számlán is üresen nyílt, amin **volt** szám — a felhasználó azt hihette, hogy nincs.

### 3. Akadályozza-e a kötelezőség-ellenőrzés? — **nem, mert nincs is**

A kötelezőség csak a **létrehozásnál** fut. A szerkesztésnél nincs ilyen ellenőrzés,
tehát nem blokkolt semmit. (Szándékosan nem is vezettem be: az épp a pótlást akadályozná.)

### 4. Miért jelzett sikert? — **mert a backend tényleg sikert adott**

A mentés nem bukott el: a szerver 200-at válaszolt, csak figyelmen kívül hagyta a mezőt.
A felület jogosan mutatott zöldet.

**Találtam viszont egy valódi néma-siker rést ugyanitt:** a mentés `if (res.success)`
ága **csak a sikert kezelte**. Ha a szerver 200-nal, de `success: false`-szal válaszolt
volna, a felület **nem szól**, viszont bezárja az ablakot. Ezt lezártam — mostantól
kimondja.

---

## 2. A JAVÍTÁS

**Backend:** a három mező bekerült a szerkesztő végpontba, `updated_at` frissítéssel és
naplózással (a számlaszám és a teljesítés dátuma bekerült a változásnaplóba — az egyik a
jogi azonosító, a másik az árfolyamot dönti el; ha ezek némán változnak, egy későbbi
vitában nem lesz mire hivatkozni).

**Duplikáció:** a pótlás is ütközhet a (szállító + számlaszám) egyedi indexbe. Az
adatbázis nyers `23505`-öt dobna, amiből a felhasználó nem ért semmit — ezért a mentés
**előtt** nézzük, és **409**-cel válaszolunk, megnevezve, **melyik** számlán szerepel már:

> „Ez a számlaszám már szerepel ennél a szállítónál: Tri-Home Kft. / 2026/RH00010
> (belső sorszám: INV-000014)."

A modal a szerver üzenetét írja ki, **és nem zárja be az ablakot**, hogy a beírt adat
javítható maradjon.

**Egy apró döntés:** az üres sztring **nem törlés**, hanem „nem adtak meg". Egy üres
számlaszám elrontaná a lista „hiányzik" jelzését, és kiesne az egyediségi indexből is.

---

## 3. A HIBAOSZTÁLY ŐRZÉSE — ez a lényeg

Ez a **harmadik** előfordulás (adószám → számlaszám → teljesítés dátuma). Ezért nem csak
a tünetet javítottam:

```
SUPNUM-09  ⚠️ a szerkesztő végpont MINDEN űrlapmezőt fogad — nem hullik el némán egy sem
```

A teszt végigküldi a szerkesztő űrlap mezőit, és **megnevezi azt, amelyik nem érkezett
meg**. Ha valaki új mezőt vesz fel az űrlapra, de a végpontra nem, ez fogja megmondani.

Mellé: `SUPNUM-07` (a pótlás működik), `SUPNUM-08` (a pótlás sem hozhat duplikátumot).
SUPNUM 6 → 9 eset, teljes suite **352 passed / 0 failed**.

---

## 4. ÉLES PRÓBA

```
1. pótlás            ->  200  | adatbázisban: PROBA-2026/0001
2. teljesítés dátuma ->  200  | adatbázisban: 2026-08-31
visszaállítva (a próbaérték törölve).
```

Ellenőriztem, hogy nem maradt szemét: `PROBA-%` számlaszám **0 db**.

A deployolt admin csomag tartalmazza a javítást (`InvoiceFormModal-C4027Fgg.js`,
`Invoices-DOT10-j3.js`).

---

## 5. A PÓTLANDÓ SZÁMLÁK — **8 db, és kell hozzá tőled az adat**

A számlaszám **jogi azonosító**: nem tudom kitalálni, csak a papíron/PDF-en szerepel.
Az alábbi 8 sorhoz kérem a szállító saját számlaszámát:

| # | belső sorszám | szállító | összeg | dátum | leírás |
|---|---|---|---:|---|---|
| 1 | `INV-000012` | Darázs Lívia e.v. | 152 400 | 2026-09-02 | Könyvelési díj 2026. augusztus |
| 2 | `INV-000013` | RA-TOX Kártevőírtó (Benkóné Vörös Ágota e.v.) | 87 630 | 2026-09-02 | Kártevőirtás 3 szoba |
| 3 | `INV-000014` | Tri-Home Kft. | 6 029 032 | 2026-09-10 | Bérleti díj 2026. szeptember |
| 4 | `INV-000016` | Top Service Hungária Kft. | 7 700 | 2026-09-11 | Kulcsmásolás, cilinder |
| 5 | `INV-000008` | Anthropic PBC | 41 560,62 | 2026-09-11 | Max plan — 5x |
| 6 | `INV-000015` | Darázs Lívia e.v. | 10 000 | 2026-09-11 | Bérszámfejtés, önellenőrzés |
| 7 | `INV-000010` | MVM Next Energiakereskedelmi Zrt. | 1 255 406 | 2026-09-13 | Áram elszámoló 2026.03.01–08.11. |
| 8 | `INV-000009` | Adria Invest Kft. | 25 580 | 2026-09-14 | Medence takaró téliesítéshez |

**Egy kilencedik sor is számlaszám nélkül van, de az helyes így:**

| | | | |
|---|---|---:|---|
| `INV-000011` | **Gede László (Győr)** | 17 989 | **bérbeadói rezsi-jelzés** — nincs szállítói számla, ez a szabályos kivétel |

### Hogyan pótold

> **Számlák** → a soron a **ceruza (szerkesztés)** → a **„Beszállítói számlaszám"** mező
> → mentés.

Mostantól **tényleg elmenti**, és ha a szám már szerepel ugyanannál a szállítónál,
megmondja, melyik számlán.

Ha átküldöd a 8 számot (elég soronként: `INV-000012 = …`), egy körben rögzítem.

---

## ÖSSZEFOGLALÓ

**Elkészült:** a hiba megvan és javítva — a szerkesztő végpont kézzel felsorolt mezőlistája **némán eldobta** a beszállítói számlaszámot, és vele a **teljesítés dátumát** (ez devizás számlánál az MNB árfolyamot dönti el, tehát a javítása eddig hatástalan volt) és a szállító-hozzárendelést. A felület azért mutatott zöldet, mert a szerver valóban 200-at adott. Két további hibát is találtam ugyanebben a láncban: a szerkesztő űrlap **be sem töltötte** a meglévő számlaszámot, és a mentés a `success: false` ágra némán bezárta az ablakot. Mind javítva, élesben kipróbálva (pótlás 200, a próbaérték törölve), SUPNUM 6 → 9 eset, suite **352/0**. Megtalálod: **Számlák → ceruza → „Beszállítói számlaszám"**.
**Döntési pont:** nincs.
**Tőled kell:** a **8 számlaszám** — a jogi azonosítót nem tudom kitalálni, csak a papíron szerepel. A lista a jelentés 5. pontjában van (`INV-000008..16`); elég soronként `INV-000012 = 2026/…` formában, és egy körben rögzítem. A kilencedik számlaszám nélküli sor (**INV-000011, Gede László**) **helyesen** üres: az bérbeadói rezsi-jelzés.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-beszallitoi-szamlaszam-potlas-2026-09-24.md
