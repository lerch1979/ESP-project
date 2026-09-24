# Helyszínen aláírható jegyzőkönyvek — vizsgálat és javaslat

**Dátum:** 2026-09-24 · **Státusz:** vizsgálat, **nem építettem semmit**

---

## 0. A LEGFONTOSABB, AMIT ELÖLJÁRÓBAN KI KELL MONDANOM

A kérésed abból indul ki, hogy *„a kárjegyzőkönyvben működik a három aláírás-blokk"*.
**Ez nem így van, és ezt a különbséget a további tervezés előtt tisztázni kell.**

Élesben, most:

```
kárjegyzőkönyv (damage_reports)     4 db,  ebből aláírt:  0
ellenőrzés (inspections)            0 db,  ebből aláírt:  0
kárigény (compensation_residents)   —      aláírás:       0
```

**Egyetlen aláírás sincs a rendszerben.** Nem azért, mert nem használják, hanem mert a
lánc nincs végig megépítve.

---

## 1. MI VAN MA — pontosan

### 1.1 A kárjegyzőkönyv: oszlopok és egy végpont, de NINCS aláíró felület

**Ami megvan** (mig 073, `damage_reports`):

```sql
employee_signature_date  TIMESTAMPTZ
employee_signature_data  TEXT          -- base64 PNG
manager_signature_date   TIMESTAMPTZ
manager_signature_data   TEXT
witness_name             VARCHAR(255)
witness_signature_data   TEXT
employee_acknowledged    BOOLEAN
```

**Ami megvan a backendben:** `POST /damage-reports/:id/acknowledge`, ami elvárja a
`signature_data`-t, és elmenti:

```sql
UPDATE damage_reports SET
  employee_acknowledged  = true,
  employee_signature_date = NOW(),
  employee_signature_data = $2,
  ...
```

**Ami NINCS meg — négy hiány, mindegyik önmagában megállítja a folyamatot:**

| # | hiány | következmény |
|---|---|---|
| 1 | **Nincs aláíró felület sehol** a kárjegyzőkönyvhöz. A `DamageReportDetail.jsx` csak *állapot-chipeket* mutat („Aláírva" / „Nincs"). Aláírás-rögzítő komponens (`SignatureCanvas`, `signature_pad`) **az egész adminban nincs.** | a végpontot semmi nem hívja |
| 2 | **A chipek mindig „Nincs"-et mutatnak.** A felület a `report.employee_signature` mezőt olvassa, az API viszont `dr.*`-ot ad vissza, vagyis `employee_signature_data`-t — alias nélkül. A két név nem egyezik. | még ha aláírnák is, a felület azt mondaná, nincs aláírás |
| 3 | **A PDF nem tartalmazza az aláírásképet.** A sablon üres vonalat rajzol és a dátumot írja mellé: `<div class="sl"></div>` — se `<img>`, se base64. | a dokumentumon nem látszik az aláírás |
| 4 | A **vezetői** és a **tanú** aláírás-oszlopot **semmi nem írja** a rendszerben. | a „három aláírás-blokk" a papír-sablon három helye, nem három működő funkció |

➡️ **A „három aláírás-blokk" ma a PDF három üres vonala**, amit kinyomtatva kézzel kell
aláírni. A digitális rész félig van kész.

### 1.2 Ahol viszont TÉNYLEG működik az aláírás: a helyszíni fizetés

Az egyetlen hely az egész rendszerben, ahol aláírást rögzítünk:
`hr-erp-admin/src/pages/compensations/OnSitePaymentModal.jsx`

```js
const signatureData = canvas.toDataURL('image/png');
await inspectionsAPI.recordOnSitePayment(resident.id, { method, signature_data, ... });
```

Backend (`fine.service.js`): `compensation_residents.signature_data` + `signed_at = NOW()`.

**Ez a működő minta** — nyers HTML `<canvas>`, ujjal/egérrel rajzolt vonal, PNG data-URL.
Nincs külső könyvtár. **Erre érdemes építeni**, de fontos: ez a *fizetés* nyugtázása,
nem a jegyzőkönyv tudomásulvétele.

### 1.3 Az ellenőrzésnél: oszlop van, de az az ELLENŐRÉ, és soha nem íródik

`inspections.digital_signature` + `signature_timestamp` (mig 086). A `PATCH` végpont
elfogadja — **de egyetlen felület sem küldi.** A PDF pedig így hivatkozik rá:

> „Az ellenőr **digitális aláírása rögzítve**: …"

Tehát ez a mező eleve az **ellenőr** aláírásának készült, nem a lakóénak. A lakó
tudomásulvételéhez **nincs hely**.

### 1.4 Összegezve: HÁROM félkész tároló, EGY működő rögzítő

| hol | oszlopok | rögzítő felület | PDF-be kerül? | élesben |
|---|---|---|---|---|
| `damage_reports` | 3 blokk | ❌ nincs | ❌ nem | 0 aláírás |
| `inspections` | 1 (az ellenőré) | ❌ nincs | csak szöveges utalás | 0 aláírás |
| `compensation_residents` | 1 | ✅ **van** | ❌ nem vizsgáltam PDF-et | 0 aláírás |

A kérésed úgy szól, hogy **ne építsek másodikat**. Egyetértek — de a valóság az, hogy
**hármat kell eggyé vonni**, nem egyet kiterjeszteni.

---

## 2. JAVASLAT — egy közös aláírás-mechanizmus

### 2.1 A javasolt szerkezet

Egy tábla, minden aláírásra: **`document_signatures`**

| mező | miért |
|---|---|
| `subject_type` + `subject_id` | mihez tartozik: `damage_report` / `inspection` / `compensation_resident` / `document` |
| `signer_type` | `resident` / `staff` / `witness` — a három blokk így egy táblában él |
| `signer_employee_id`, `signer_user_id`, `signer_name` | ki írta alá (a tanú nem felhasználónk) |
| `signature_png` | a rajzolt kép |
| **`signed_text`** | **a PONTOS szöveg, amit aláírt** — lásd 3. és 5. pont |
| **`signed_text_version`** | a szövegsablon verziója |
| **`language`** | amilyen nyelven elolvasta |
| `signed_at`, `ip`, `user_agent`, `device_label` | bizonyító erő (5. pont) |
| `signed_on` | `staff_device` / `own_phone` — más a folyamat (4. pont) |
| `document_sha256` | az aláíráskor generált PDF ujjlenyomata |

A három meglévő oszlopkészletet **nem kell azonnal megszüntetni**: az új tábla az
igazság, a régi oszlopok maradhatnak olvasásra, amíg a régi adat (jelenleg: nincs) ki
nem fut. Mivel **élesben nulla aláírás van, a migráció költsége most nulla** — ez a
legolcsóbb pillanat egységesíteni.

### 2.2 Ellenőrzési jegyzőkönyv (szoba-ellenőrzés)

**Miért fontos, ahogy írod:** ebből bírság lehet (2× bukás → 10 000 Ft/fő,
`hygiene_fine_config.fine_amount` alapértelmezése tényleg 10 000).

**Javaslat:**
- A lakó aláírása **`signer_type = 'resident'`**, az ellenőré `'staff'` — egy
  mechanizmus, két szerep.
- Az aláírt szöveg **nem** a bírság elfogadása, hanem a megismerés:
  > „Az ellenőrzés eredményét megismertem. Tudomásul veszem, hogy ismételt hiányosság
  > esetén a házirend szerinti kötbér megállapítható."
- **Az aláírás megtagadása is rögzíthető legyen** (`refused_at` + ok). Ez a gyakorlatban
  fontosabb, mint az aláírás: egy vitában az „aláírást megtagadta, tanú jelenlétében"
  bejegyzés többet ér, mint a hiányzó sor.

### 2.3 Kárigény tudomásulvétele — a szöveg

**Ezt a pontodat maradéktalanul osztom, és a rendszer állapota alá is támasztja.** A
`PROJECT_STATE.md` szerint a bérlevonás **végrehajtása MOTHBALLED**
(„*jegyzőkönyv is our end-of-process*") — tehát **tényleg nem mi vonunk le.**

| ❌ NEM ez | ✅ EZ |
|---|---|
| „Hozzájárulok a levonáshoz" | „A kárigényt **tudomásul vettem**." |

Javasolt teljes szöveg (mind az 5 nyelven):

> „A fenti kárigényt és annak összegét **tudomásul vettem**. Tudomásul veszem, hogy a
> Housing Solutions **nem érvényesít levonást**: a jegyzőkönyvet a munkáltatóm /
> megbízóm felé továbbítja, és az esetleges levonásról **az ő bérszámfejtése** dönt a
> rá vonatkozó szabályok szerint. Az aláírásom a kárigény megismerését igazolja, nem a
> levonáshoz való hozzájárulást."

**Miért számít ez ennyire:** egy „hozzájárulok a levonáshoz" szöveg olyan
jognyilatkozat, amire nincs is jogosultságunk, és egy vitában **ellenünk** fordul — azt
bizonyítaná, hogy levonási szándékunk volt.

### 2.4 Általános dokumentum-aláíratás (házirend, tájékoztató) — **NEM kell új modul**

A **videó-kommunikációs modul** (mig 143) már tartalmazza a teljes vázat:

| amit a házirend-kiküldés igényel | a videó-modulban már megvan |
|---|---|
| célzás (kinek megy ki) | `video_announcements.audience` |
| **nyelvenkénti kézbesítés** | `video_announcement_recipients.language` ✅ |
| kötelező jelleg | `is_mandatory` |
| emlékeztető, ha nem nézte meg | `renag_sent_at` + napi cron |
| a lakó látja a telefonján | `GET /videos/my` |
| visszaigazolás | `POST /videos/my/:id/view` |

**Ami hiányzik belőle:** egy PDF/dokumentum típus a videó mellé, és az aláírás.

➡️ **Javaslat:** a videó-modult általánosítsuk „kiküldött tartalom"-ra (videó **vagy**
dokumentum), és a `recordMyView` mellé kerüljön egy `sign` lépés. **Ne épüljön negyedik
kiküldő-mechanizmus** — ugyanaz az elv, amit a megosztó linkeknél kimondtál.

*(A `DocumentPanel.jsx` „aláírt példány megvan" jelölése ehhez nem nyújt semmit: az csak
egy jelölőnégyzet egy feltöltött szkennelt fájlon, nem aláírási folyamat.)*

---

## 3. NYELVEK — ma a legnagyobb rés a bizonyító erőn

**A kárjegyzőkönyv PDF-je 5 nyelven készül** (`src/locales/{hu,en,tl,uk,de}/damageReport.json`)
— ez jó. **De:**

```js
const language = req.query.language || req.query.lang || 'hu';
```

A nyelvet **a letöltő választja, letöltéskor** — nem az, amit a lakó aláíráskor
elolvasott. Ha a lakó ukránul olvasta és magyarul töltik le, a két dokumentum nem
ugyanaz, és **semmi nem rögzíti, melyiket látta.**

**Az ellenőrzési PDF ennél rosszabb:** `inspectionPDF.service.js` 54 szövegkiírása
**mind magyar**, nincs benne nyelvkezelés. Egy ukrán lakó ma **egy magyar nyelvű
jegyzőkönyvet írna alá** — ez bizonyító erő szempontjából gyakorlatilag használhatatlan.

**Javaslat:**
1. Az aláírás pillanatában **rögzítsük a nyelvet ÉS a szöveget** (`language`,
   `signed_text`, `signed_text_version`) — nem hivatkozással, hanem **szó szerint**.
2. Az aláírt PDF **azon a nyelven** generálódjon, és a generált fájl **SHA-256** lenyomata
   kerüljön az aláírás mellé.
3. Az ellenőrzési PDF-et át kell írni a kárjegyzőkönyv mintájára (locales-alapú), mert
   PDFKit-tel, beégetett magyar szöveggel ez nem megoldható.

---

## 4. MOBIL — ma a lakó SEMMIT nem tud aláírni

**Tény:** a lakói mobilappban **nincs aláírás-funkció**, és a lakói API-n **nincs
ellenőrzés, kárjegyzőkönyv vagy kárigény végpont**. A lakó ma ezt látja: jegyek,
szállás, profil, videók, naptár, teendők. Ennyi.

Tehát ma **csak a személyzet készülékén** lehetne aláírni — ha lenne felület, ami nincs.

### A két folyamat KÜLÖNBÖZŐ, és ezt érdemes kimondani

| | **A) személyzet készülékén** | **B) a lakó saját telefonján** |
|---|---|---|
| ki olvassa | a személyzet mutatja | a lakó, a maga idejében |
| nyelv | a személyzet állítja be | **a lakó app-nyelve, automatikusan** |
| bizonyító erő | gyengébb: a készülék a miénk | **erősebb: saját fiók, saját eszköz** |
| mikor | a helyszínen, azonnal | akár később is |
| kockázat | „nem értettem, mit írtam alá" | „nem én nyomtam meg" (ezt a fiók + push oldja) |

**Javaslatom: MINDKETTŐ, de eltérő szereppel.**

- **A) a helyszínen** — a személyzet készülékén, a lakó jelenlétében. Ez marad az
  elsődleges, mert az ellenőrzés úgyis ott történik. A `signed_on = 'staff_device'`
  jelölje, és **kötelező legyen a nyelvválasztás a lakó nyelvére**, mielőtt megmutatják.
- **B) a saját telefonján** — a lakó push-értesítést kap („aláírásra vár egy
  jegyzőkönyv"), a **saját nyelvén** elolvassa, és aláírja. `signed_on = 'own_phone'`.
  Ez a jogilag erősebb, mert a saját fiókjából, a saját eszközén történik.

**Sorrend-javaslat:** előbb A), mert az ellenőrzés a helyszínen zajlik és ott azonnal
kell a papír. B) utána, mert ahhoz a lakói API-t is bővíteni kell (új `/my` végpontok),
és a mobilra aláírás-vászon kell (React Native-ben `react-native-svg` alapú rajzolás vagy
WebView-canvas — ezt külön meg kell vizsgálni, nincs benne a jelenlegi csomagokban).

---

## 5. JOGI BIZONYÍTÓ ERŐ

### Amit ma tárolunk

| | |
|---|---|
| aláíráskép (PNG) | ✅ (de csak a helyszíni fizetésnél) |
| időbélyeg | ✅ `signed_at` / `signature_date` |
| IP-cím | ❌ |
| eszköz / user-agent | ❌ |
| **mit írt alá (a szöveg)** | ❌ |
| milyen nyelven olvasta | ❌ |
| ki kezelte a készüléket | ❌ |
| a dokumentum sértetlensége | ❌ |

### Ami egy vitában valóban számít

A magyar jog szerint ez **nem minősített elektronikus aláírás** — teljes bizonyító erejű
magánokiratot önmagában nem hoz létre. **Amit el lehet érni: erős, konzisztens
bizonyíték**, ami egy munkaügyi vagy polgári vitában hitelt érdemlően alátámasztja, hogy
az adott személy az adott tartalmat megismerte.

Ehhez a fentieken túl javaslom:

1. **A szöveg szó szerinti tárolása** (`signed_text`), nem hivatkozás sablonra. Ha a
   sablon később változik, a hivatkozás hazudni fog arról, mit írt alá.
2. **A PDF SHA-256 lenyomata** az aláírás pillanatából. Így utólag bizonyítható, hogy a
   bemutatott dokumentum ugyanaz.
3. **IP + user-agent + eszköz megnevezése**, és **ki volt belépve** a készüléken
   (a személyzeti eszköznél ez a másik fél azonosítása).
4. **Az aláírás megtagadásának rögzítése** — tanúval. Gyakorlatban ez legalább annyiszor
   fordul elő, mint az aláírás.
5. **Változtathatatlanság:** az aláírás után a jegyzőkönyv **ne legyen szerkeszthető**.
   Ma a kárjegyzőkönyvnél ez részben megvan (`FINALIZED_STATUSES`), az ellenőrzésnél nincs.
6. **Két tanú vagy videó** helyett elég lehet, ha a lakó a **saját telefonjáról**
   ír alá (4/B) — az a leginkább védhető megoldás, és ingyen van.

**Amit NE ígérjünk:** hogy ez „digitálisan hiteles aláírás". Nem az. Ha tényleg minősített
aláírás kell (pl. munkaszerződéshez), az külön szolgáltató (AVDH / e-Szignó) kérdése, és
külön döntés.

---

## 6. JAVASOLT SORREND

| # | lépés | méret | miért ebben a sorrendben |
|---|---|---|---|
| 1 | **`document_signatures` tábla + közös aláírás-komponens** (admin) | közepes | enélkül minden további csak újabb félkész tároló lenne |
| 2 | **Kárjegyzőkönyv befejezése**: aláíró felület + a kép a PDF-be + a chip-hiba javítása | kicsi | a lánc 80%-a kész, csak a végét nem kötötték be |
| 3 | **Kárigény tudomásulvétele** a helyes szöveggel, 5 nyelven | kicsi | a szöveg a lényeg, a mechanizmus az 1-esből jön |
| 4 | **Ellenőrzési jegyzőkönyv**: lakói aláírás + a PDF átírása 5 nyelvre | **közepes-nagy** | a PDF teljes újraírása kell (ma beégetett magyar) |
| 5 | **Lakói aláírás a saját telefonon** (4/B) | közepes | új `/my` végpontok + mobil rajzvászon |
| 6 | **Általános dokumentum-kiküldés** a videó-modul általánosításával | közepes | a váz megvan, ne épüljön negyedik kiküldő |

---

## ÖSSZEFOGLALÓ

**Elkészült:** vizsgálat, nem építettem semmit. **A kiindulópontot helyesbítenem kell: a kárjegyzőkönyv három aláírás-blokkja NEM működik** — az oszlopok és egy végpont megvannak, de aláíró felület sehol nincs az adminban, a PDF nem tartalmazza az aláírásképet (csak üres vonalat), a felület `employee_signature`-t olvas, miközben az API `employee_signature_data`-t ad (ezért mindig „Nincs"-et mutat), a vezetői és tanú-oszlopot pedig semmi nem írja. Élesben **nulla aláírás van, mind a három tárolóban**. Az egyetlen működő rögzítés a helyszíni fizetés modálja (`<canvas>` → PNG). Három félkész tároló van (`damage_reports`, `inspections.digital_signature`, `compensation_residents`) — a helyes lépés ezeket **eggyé vonni**, nem egyet kiterjeszteni; és mivel élesben nulla adat van, ez most nulla költséggel megtehető.
**Döntési pont:** (1) egységesítsük-e a három tárolót egy `document_signatures` táblába, ahogy javaslom; (2) a lakó a **személyzet készülékén**, a **saját telefonján**, vagy mindkettőn írjon alá; (3) az ellenőrzési PDF-et át kell írni 5 nyelvre — ma 54 beégetett magyar szöveg van benne, vagyis egy ukrán lakó magyar jegyzőkönyvet írna alá.
**Tőled kell:** döntés a fenti háromban, és jóváhagyás a 6. pont sorrendjére. A kárigény szövegét a kikötésed szerint fogalmaztam meg („tudomásul vettem a kárigényt", kimondva, hogy **nem mi vonunk le**) — ezt a `PROJECT_STATE` is alátámasztja: a levonás végrehajtása mothballed, a jegyzőkönyv a folyamat vége.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-helyszini-alairas-vizsgalat-2026-09-24.md
