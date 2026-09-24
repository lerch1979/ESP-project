# A lakó a saját telefonján ír alá (5. lépés)

**Dátum:** 2026-09-24 · **Élesítve:** igen · **Teljes functest:** 381 passed / 0 failed

---

## 1. MIÉRT ERŐSEBB EZ JOGILAG

| | személyzeti készülék *(alapeset, marad)* | **saját telefon** |
|---|---|---|
| ki lép be | a munkatárs, és odaadja a telefont | **a lakó, a saját fiókjából** |
| nyelv | a munkatárs állítja be | **az app az ő nyelvén mutatja** |
| mikor | a helyszínen, a munkatárs jelenlétében | **a maga idejében, senki nem áll fölötte** |
| `operator_user_id` | a MUNKATÁRS | **ő maga** |

> Egy vitában ez a különbség számít: **nem tudjuk ráfogni, hogy nem értette**, mert nem
> mi tartottuk a készüléket, és nem mi választottuk a nyelvet.

A személyzeti út marad az alapeset — ahogy mondtad, a lakók fele nem fog appot
használni. Ez a kettő **együtt** létezik.

---

## 2. HOL TALÁLOD

> A lakó telefonján: **Egyéb → „Aláírásra vár"**

Egyetlen görgethető oldal, nem lapozós varázsló — **szándékosan**: a lakó lássa, mennyi
van még hátra a szövegből, mielőtt aláír. A sorrend itt is **szöveg → vászon**.

---

## 3. A JOGOSULTSÁG — ez a biztonsági mag

A szerver **tételesen, dokumentumtípusonként** dönti el, hogy a dokumentum RÁ
vonatkozik-e:

| típus | a kapocs |
|---|---|
| kárjegyzőkönyv | ő a felelős dolgozó |
| kárigény | ő a lakó a kárigényen |
| ellenőrzés | ő **lakik** az ellenőrzött szálláson |
| dokumentum | hozzá van rendelve |

**Miért nem egy általános „van hozzá köze" szabály:** az előbb-utóbb túl tágra sikerülne,
és egy vegyes szálláson **más cég dolgozójának** jegyzőkönyvét is aláírhatóvá tenné.

Idegen dokumentumra a válasz **„nem található"**, nem „nincs jogosultság" — a **létezés
ténye sem szivároghat ki**.

---

## 4. SVG ALÁÍRÁS — új függőség nélkül

A PNG-hez `react-native-view-shot` kellene: **új natív függőség, új build, új kockázat**.
A `react-native-svg` viszont már benne van a projektben.

**Nem feltételeztem, hogy működik:** legeneráltam egy PDF-et beágyazott SVG data-URL-lel,
és **ránéztem a renderelt lapra** — a görbe megjelenik. (Ugyanaz a lecke, mint a Chrome
fejlécnél: ezt csak a kész lapon lehet látni.)

Ráadásul az **SVG vektor**: a nagyítás nem mossa el, és a vonások pontjai megmaradnak —
bizonyítékként ez több, mint egy raszteres kép.

**A szerver mostantól ellenőrzi a formátumot** (PNG vagy SVG data-URL). Egy „aláírás",
ami nem kép, a dokumentumon **üres helyként** jelenne meg, és senki nem venné észre.

---

## 5. EGY SZERKEZETI LÉPÉS: a közös darabok kiemelve

A személyzeti és a lakói kontroller **jogosultsága gyökeresen más**, de három dolgot
ugyanúgy csinálnak: a nyilatkozat paraméterei, a pillanatkép, a megőrzés. Ezeket
`signature.controller.helpers.js`-be emeltem.

> Másolatban idővel szétcsúsztak volna — és a szétcsúszás pont a **ritkábban olvasott
> lakói ágon** maradt volna észrevétlen.

---

## 6. ÉLES PRÓBA — Timi tesztfiókjával

Két kárjegyzőkönyvet hoztam létre: egyet Timire, egyet Esztire (idegen).

```
1. aláírásra vár        ->  200  | ELES-SAJAT
   tartalmazza az IDEGENT?  nem ✓
2. nyilatkozat ukránul  ->  200  | Я прочитав(ла) вищезазначений протокол…
3. IDEGEN dokumentum    ->  404  A dokumentum nem található
4. aláírás SVG-vel      ->  201
   tárolva: {"signed_on":"own_phone","language":"uk","operator=signer":true}
próbaadat törölve.
```

A lényeg a 3. sor: **az idegen jegyzőkönyv se a listában nem jelent meg, se közvetlenül
nem érhető el.**

---

## 7. TESZTEK

```
SIGN-14  ⚠️ a lakó CSAK a RÁ vonatkozó dokumentumot írhatja alá
SIGN-15  a SAJÁT telefonos aláírás "own_phone"-ként rögzül, a lakó a kezelő
SIGN-16  az SVG aláírás elfogadott, a NEM KÉP viszont nem
```

**381 passed / 0 failed**, kétszer. i18n-őr zöld (8 lakói képernyőre bővítve).

---

## 8. ÁLLAPOT

| # | lépés | állapot |
|---|---|---|
| 1–4 | egységes tábla, kárjegyzőkönyv, kárigény, ellenőrzés + PDF | ✅ kész |
| 5 | **lakói aláírás saját telefonon** | ✅ **kész** (a mobil része buildet igényel) |
| 6 | általános dokumentum — a videó-modul általánosítása | ⏳ következő |

⚠️ **A mobil rész a telefonokra csak a következő buildben jut ki.** A backend él, a
képernyő kész, de amíg nincs új build, a lakók a jelenlegi appot használják.

---

## ÖSSZEFOGLALÓ

**Elkészült:** a lakó a **saját telefonján, saját fiókjából, saját nyelvén** írhat alá — `signed_on='own_phone'`, és a kezelő ŐMAGA, nem mi; ez a jogilag erősebb út, a személyzeti készülék marad az alapeset. A jogosultság **tételes**: idegen dokumentum se a listában nem jelenik meg, se közvetlenül nem érhető el (404, nem 403 — a létezés ténye sem szivárog ki). Élesben Timi tesztfiókjával végigpróbálva: saját jegyzőkönyv 201, idegen 404, ukrán nyilatkozat, `own_phone` rögzítve. SVG-aláírás **új natív függőség nélkül** (`react-native-svg`), és hogy megjelenik-e a PDF-ben, azt a renderelt lapon ellenőriztem. Suite **381/0**. Megtalálod: a lakó telefonján **Egyéb → „Aláírásra vár"**.
**Döntési pont:** nincs.
**Tőled kell:** semmi. Egy dolgot tényként mondok: **a mobil rész a telefonokra csak a következő buildben jut ki** — a backend él, a képernyő kész, de build nélkül a lakók nem látják. Szólj, ha indítsam, vagy összevárom a 6. lépéssel.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-lakoi-alairas-sajat-telefon-2026-09-24.md
