# HTML → Chrome PDF átállás · az aláírt példány megőrzése

**Dátum:** 2026-09-24 · **Élesítve:** igen (mig 178) · **Teljes functest:** 378 passed / 0 failed

---

## 1. A KIKÖTÉSED 1. PONTJÁRA: **ez ma nem így van**

Megnéztem, és a válasz egyértelmű:

> **Egyetlen PDF sincs eltárolva. Sem az ellenőrzési jegyzőkönyv, sem a kárjegyzőkönyv.**
> Minden letöltés **újragenerál** az aktuális adatból és az aktuális sablonból.

Vagyis „a korábban aláírt dokumentum pontosan úgy maradjon" **ma nem teljesül**, és a
mostani sablonváltás után biztosan nem teljesült volna.

**Miért végzetes ez egy vitában:** a másik fél bemutat egy papírt, mi kinyomtatjuk
ugyanazt az azonosítót, és a kettő nem egyezik. Nem hamisítás miatt — hanem mert a
rendszer sosem őrizte meg, amit aláírtak.

### A megoldás: `signed_document_archive` (mig 178)

Az aláíráskor renderelt PDF **bájtra pontosan** eltárolódik. A letöltés három szintű:

| # | ha… | akkor |
|---|---|---|
| 1 | van **megőrzött** példány | azt adjuk vissza, bájtazonosan |
| 2 | van aláírás, de nincs megőrzött példány *(mig 178 előtti)* | az aláírás **pillanatképéből** renderelünk — a tartalom hű, a forma új |
| 3 | nincs aláírás | friss renderelés az aktuális adatból |

**Aláírt dokumentumnál a nyelv sem a letöltő választása:** amit ukránul írtak alá, az
ukránul hiteles. A válasz `X-Document-Source` fejlécében megmondjuk, melyik szintről jött.

**A megőrzés az aláírás UTÁN fut**, a kérés útján kívül: a PDF-gyártás Chrome-ot indít,
lassú és elbukhat — a helyszínen álló lakó aláírása nem múlhat ezen.

---

## 2. AZ ÁTÁLLÁS

Közös renderelő (`htmlPdf.service.js`) + négy HTML sablon. A CSS
`overflow-wrap: anywhere` tördeli a hosszú német összetett szavakat **cellán belül** —
ezért nem csúszik el semmi.

A régi `inspectionPDF.service.js`-t **nem töröltem**: az adatbetöltése közös, és amíg
minden hívó át nem áll, a két út párhuzamosan él.

---

## 3. HÁROM HIBA, AMIT CSAK A RENDERELT LAPON LEHETETT ÉSZREVENNI

### a) A Chrome rányomtatta a szerver fájlútvonalát a jegyzőkönyvre

A Chrome 153 a `--print-to-pdf-no-header` mellett is odaírta a fejlécbe a dátumot és a
címet, a láblécbe pedig ezt:

```
file:///var/folders/t8/drcj08_x5mz8dnw4kq411vrm0000gn/T/legal_de_179027361270…html   1/2
```

Egy jogi dokumentumra nyomtatott belső útvonal **nem stílusprobléma: adatot
szivárogtat**, és komolytalanná teszi az iratot. Az új kapcsoló a
`--no-pdf-header-footer`.

⚠️ **Ugyanez a hiba a kárjegyzőkönyvben is ott volt** — az is javítva.

### b) A minősítés és a típus nyers angol kulcsként jelent meg

A német jegyzőkönyvön ez állt:

```
Bewertung:         poor        →  mangelhaft
Art der Kontrolle: monthly     →  monatlich
```

**A lakó pont a minősítést nem értette volna meg — azt, ami a bírság alapja.** Mind a 8
ellenőrzéstípus és 6 minősítés lefordítva, 5 nyelven.

### c) ⚠️ A SZERVEREN NINCS CHROME — az egész PDF-út élesben soha nem működött volna

Élesítés után derült ki: a backend konténerben **nem volt telepítve Chrome**.

**Nem csak az új kód érintett: a MEGLÉVŐ kárjegyzőkönyv-PDF sem működött volna.** Ez
eddig észrevétlen maradt, mert élesben még **senki nem töltött le** kárjegyzőkönyvet
(4 jegyzőkönyv van, egyik sem aláírt) — a hiba az **első valódi aláíratásnál**
jelentkezett volna, a helyszínen, a lakó előtt.

Javítva: a Dockerfile-ba bekerült a Chromium és a betűkészletek. **A konténert helyben
lefordítottam és kipróbáltam**, mielőtt pusholtam — a CI elsőre elbukott egy nem létező
csomagnéven (`font-noto-cyrillic`; a cirill magában a `font-noto`-ban van).

Ellenőrzött kimenet a konténerben:

```
HU: árvíztűrő tükörfúrógép ő ű Ő Ű
UK: Мене ознайомлено з результатом перевірки
DE: Prüfer, Ästhetik, mangelhaft, ZAHLUNGSAUFFORDERUNG
TL: Naipaalam sa akin ang resulta
```

*Ugyanaz a hibaosztály, amit a Dockerfile `assets/` és `migrations/` sorai már
dokumentálnak: a kód kész volt, a futtatókörnyezet nem.*

---

## 4. A KIKÖTÉSED 2. PONTJA: 4 dokumentum × 5 nyelv, német tördeléssel

### Fejlesztői gépen, valódi Chrome-mal, bő adattal

```
dokumentum   nyelv   bájt     oldal
legal        hu     121417      2
legal        de     116960      2     ← a német NEM lett több oldal
owner/internal/demand: minden nyelven 1 oldal
20/20 sikeres
```

### Nyelvek hossza (a leghosszabb feszíti a táblázatot)

```
de  767 karakter   ← a leghosszabb, ahogy vártad
hu  752
tl  747
en  706
uk  663
leghosszabb egybefüggő szó: 20 karakter (ZAHLUNGSAUFFORDERUNG) — a tördelés elbírja
```

### Élesben, a szerveren

```
sikeres: 20 / 20
nincs hiba
```

### És ránézésre is megnéztem

A német jegyzőkönyvet képpé alakítva ellenőriztem: a táblázatok elférnek, semmi nem
csúszik ki, nincs szerverútvonal a lapon, a minősítés `mangelhaft`, a típus `monatlich`.

---

## 5. TESZTEK

```
INSPDF-01  ⚠️ mind a 4 dokumentum × 5 nyelv előáll — nincs hiányzó címke
INSPDF-02  ⚠️ a NYERS kulcsok fordulnak — nem "Bewertung: poor" áll a német lapon
INSPDF-03  a NÉMET a leghosszabb nyelv, de nincs cellát feszítő szó
INSPDF-04  az ALÁÍRÁSKÉP és a nyilatkozat rákerül a jegyzőkönyvre
INSPDF-05  ⚠️ a MEGŐRZÖTT példány jelölve van a lapon
```

**378 passed / 0 failed.**

---

## 6. ÁLLAPOT

| # | lépés | állapot |
|---|---|---|
| 1–3 | egységes tábla, kárjegyzőkönyv, kárigény | ✅ kész |
| 4a | ellenőrzés — lakói aláírás + következmény-szöveg | ✅ kész |
| 4b | ellenőrzés — **PDF 5 nyelvre + megőrzés** | ✅ **kész** |
| 5 | lakói aláírás saját telefonon | ⏳ következő |
| 6 | általános dokumentum (videó-modul általánosítása) | ⏳ |

---

## ÖSSZEFOGLALÓ

**Elkészült:** az ellenőrzési dokumentumok HTML → Chrome PDF-en, mind a négy típus mind az öt nyelven (20/20 élesben is), és az **aláírt példány megőrzése** (mig 178). Megtalálod: **Ellenőrzések → az ellenőrzés megnyitása → a PDF-letöltő gombok**; aláírt jegyzőkönyvnél a rendszer a megőrzött példányt adja vissza, az aláírás nyelvén.
**A kikötésed 1. pontjára a válasz: ma NEM így volt** — egyetlen PDF sem volt eltárolva, minden letöltés újragenerált, tehát egy aláírt irat bármikor megváltozhatott. Ezt a mig 178 oldja meg, három szintű letöltéssel (megőrzött → pillanatképből → friss).
**Három hiba, amit csak a renderelt lapon lehetett észrevenni:** a Chrome **rányomtatta a szerver fájlútvonalát** a jegyzőkönyvre (a kárjegyzőkönyvre is — az is javítva); a minősítés nyersen `poor`-ként jelent meg a német lapon; és ⚠️ **a szerveren egyáltalán nem volt Chrome** — vagyis a PDF-út élesben soha nem működött volna, a meglévő kárjegyzőkönyvé sem. A konténert helyben lefordítottam és kipróbáltam, mielőtt pusholtam.
**Döntési pont:** nincs.
**Tőled kell:** semmi — megyek tovább az 5. (lakói aláírás saját telefonon) és 6. (videó-modul általánosítása) lépésre.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-pdf-html-atallas-2026-09-24.md
