# A nyilatkozat kimondja a következményt · kárigény és ellenőrzés bekötve

**Dátum:** 2026-09-24 · **Élesítve:** igen · **Teljes functest:** 373 passed / 0 failed

**Ez a jóváhagyott sorrend 3. lépése és a 4. ALÁÍRÁSI fele.** A 4. PDF-fele külön körben
jön — az indoklás a 4. fejezetben, mert lényegesen nagyobb, mint amire a becslés készült.

---

## 1. A KÖVETKEZMÉNY A SZÖVEGBEN — ez volt a kiegészítésed lényege

Az ellenőrzési nyilatkozat eddig **általánosságban** beszélt következményről
(„ismételt hiányosság esetén kötbér megállapítható"). Ez a jogalaphoz kevés.

Mostantól a **konkrétumot** mondja ki:

> „Az ellenőrzés eredményét megismertem. Az ellenőrzés minősítése: **gyenge** (higiéniai
> pontszám: **12**). Tudomásul veszem, hogy a **15** vagy annál alacsonyabb higiéniai
> pontszám **NEM MEGFELELŐ** eredménynek számít, és hogy **2** egymást követő nem
> megfelelő ellenőrzés esetén a házirend szerinti kötbér — jelenleg **10 000 Ft / fő** —
> megállapítható. Tudomásul veszem, hogy az aláírásom az eredmény és e következmény
> **MEGISMERÉSÉT** igazolja."

Négy dolog van benne, amit eddig nem mondtunk meg: **mi az eredmény**, **mi a küszöb**,
**hányadik alkalomnál**, és **mennyi**.

### Az értékek az ÉLŐ konfigurációból jönnek

Nem beégetve, hanem a `hygiene_fine_config`-ból (ma: 2 alkalom, 15 pont, 10 000 Ft).
**Ha az összeg változik, a szöveg is más lesz** — és a tárolt példány azt őrzi, ami
**akkor** élt. Ez a szó szerinti tárolás értelme.

### A minősítés is fordul — ezt menet közben kellett javítanom

Elsőre az ukrán szövegben **magyarul** állt volna, hogy „gyenge":

```
UK: …Результат: gyenge (бал за гігієну: 12)…     ← HIBÁS
UK: …Результат: слабко (бал за гігієну: 12)…     ← javítva
```

Pont azt a szót nem értette volna meg, amiért az egészet a saját nyelvén mutatjuk.

### Kitöltetlen helyőrzővel nem írunk alá

Ha bármelyik érték hiányzik, a rendszer **hibát dob**, nem írat alá.

> Egy „`{{osszeg}}` Ft bírság" szövegű nyilatkozat nemcsak zavaros — **bizonyítékként
> értéktelen**, mert nem derül ki belőle, mit közöltünk. Inkább hiba, mint egy félkész
> jogi szöveg aláíratása.

### A felület ugyanazt mutatja, amit aláír

A párbeszéd a **konkrét ellenőrzés** szövegét kéri le (`subjectId`-vel). Ha a
megjelenített és a tárolt szöveg eltérne, az aláírás nem arról szólna, amit a lakó
elolvasott.

---

## 2. KÁRIGÉNY BEKÖTVE (3. lépés)

> **Kárigények** → a kárigény megnyitása → **Lakók** fül → soronként
> **„Tudomásulvétel"** gomb.

**A fizetéstől függetlenül elérhető**, mert ez nem fizetés, hanem a kárigény
megismerésének igazolása. A szöveg — mind az 5 nyelven — kimondja, hogy a Housing
Solutions **nem érvényesít levonást**.

---

## 3. ELLENŐRZÉS BEKÖTVE (4. lépés aláírási fele)

> **Ellenőrzések** → az ellenőrzés megnyitása → **Áttekintés** fül → felül a
> **„Lakói tudomásulvétel"** doboz → **„Aláíratás"**.

A doboz mutatja, ki írta alá, **milyen nyelven**, mikor — vagy hogy **megtagadta**.

---

## 4. AMIÉRT A PDF KÜLÖN KÖRBE KERÜL — helyesbített becslés

A vizsgálati jelentésemben az ellenőrzési PDF átírását „közepes-nagy"-nak becsültem,
„54 beégetett magyar szöveg" alapján. **A pontos szám nagyobb:**

```
inspectionPDF.service.js          970 sor
KÜLÖNBÖZŐ beégetett magyar szöveg 119 db
5 nyelvre fordítva                595 szöveg
```

És nem csak fordítás: a fájl **több különböző dokumentumot** állít elő (ellenőrzési
jegyzőkönyv, belső riport, részletes riport, kárigény-felszólítás), PDFKit-tel,
**pozicionált elrendezésben** — ahol egy hosszabb német mondat elcsúsztatja a táblázatot.

**Nem akartam ezt ugyanabba a körbe tenni**, amiben az aláírási rész van: egy
felülvizsgálhatatlan méretű változás, aminek a hibái a nyomtatott jegyzőkönyvön
jelennének meg.

**Javaslatom a következő körre:** a kárjegyzőkönyv mintájára álljunk át HTML → Chrome
PDF-re. Az már 5 nyelven működik, a szövegek `locales/*/…json`-ban vannak, és a HTML
elrendezés **magától tördel** — nem csúszik el egy hosszabb mondattól.

---

## 5. TESZTEK

```
SIGN-11  ⚠️ az ELLENŐRZÉSI nyilatkozat kimondja a KÖVETKEZMÉNYT — a saját nyelvén
SIGN-12  KITÖLTETLEN helyőrzővel NEM írunk alá
SIGN-13  a nyilatkozat az ÉLŐ konfigurációt tükrözi, nem beégetett számot
```

A **SIGN-04** elvárását igazítanom kellett: az ellenőrzési szöveg mostantól paraméteres,
tehát a paraméter nélküli hívás **szándékosan** dob. A teszt a szövegek **meglétét**
méri; a hibakezelést a SIGN-12 külön.

**373 passed / 0 failed.**

---

## 6. ÉLES PRÓBA

```
HU: …minősítése: gyenge (higiéniai pontszám: 12). …a 15 vagy annál alacsonyabb…
UK: …Результат: слабко (бал за гігієну: 12). …бал 15 або нижче… після 2 поспіль…
próba-ellenőrzés törölve.
```

---

## 7. ÁLLAPOT

| # | lépés | állapot |
|---|---|---|
| 1 | egységes tábla + közös komponens | ✅ kész |
| 2 | kárjegyzőkönyv | ✅ kész |
| 3 | kárigény tudomásulvétele | ✅ **kész** |
| 4a | ellenőrzés — **lakói aláírás + következmény-szöveg** | ✅ **kész** |
| 4b | ellenőrzés — **PDF 5 nyelvre** | ⏳ következő kör, HTML-re átállással |
| 5 | lakói aláírás saját telefonon | ⏳ |
| 6 | általános dokumentum (videó-modul általánosítása) | ⏳ |

---

## ÖSSZEFOGLALÓ

**Elkészült:** az ellenőrzési nyilatkozat mostantól **kimondja a konkrét következményt** — mi az eredmény, hány pont, mi a „nem megfelelő" küszöb, hányadik ismételt bukásnál, és mekkora összeg —, az **élő konfigurációból**, a lakó saját nyelvén; kitöltetlen értékkel a rendszer inkább hibát dob, mint hogy félkész jogi szöveget írasson alá. Menet közben javítanom kellett, hogy a **minősítés is forduljon** (az ukrán szövegben magyarul állt volna, hogy „gyenge"). A kárigény és az ellenőrzés aláírása bekötve. Élesítve, élő próbával igazolva. Suite **373/0**. Megtalálod: **Kárigények → Lakók fül → „Tudomásulvétel"**, illetve **Ellenőrzések → Áttekintés fül → „Lakói tudomásulvétel" → „Aláíratás"**.
**Döntési pont:** az ellenőrzési PDF átírása. A becslésemet **helyesbítenem kell**: nem 54, hanem **119 különböző beégetett magyar szöveg** van benne 970 sorban, négyféle dokumentumhoz, pozicionált PDFKit-elrendezésben. Javaslom, hogy a kárjegyzőkönyv mintájára álljunk át HTML → Chrome PDF-re, mert az magától tördel, és ott a 5 nyelv már működik.
**Tőled kell:** jóváhagyás a HTML-re átállásra — utána viszem tovább a 4b, 5, 6 lépést.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-alairas-kovetkezmeny-2026-09-24.md
