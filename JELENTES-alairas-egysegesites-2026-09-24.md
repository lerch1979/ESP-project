# Egységes aláírás-tár + a kárjegyzőkönyv lánca befejezve

**Dátum:** 2026-09-24 · **Élesítve:** igen (mig 177) · **Teljes functest:** 362 passed / 0 failed

**Ez a jóváhagyott 6 lépésből az 1. és a 2.** A többi külön körben jön — a 4. (ellenőrzési
PDF 5 nyelvre írása) önmagában nagyobb munka, mint ez a kettő együtt.

---

## 1. EGY TÁBLA — `document_signatures` (mig 177)

A négyféle dokumentum (kárjegyzőkönyv, ellenőrzés, kárigény, általános irat) mostantól
**ugyanazt a mechanizmust** használja. A három félkész tároló megmarad olvasásra, de az
**új tábla az igazság**.

### A bizonyító erő mezői — mind KÖTELEZŐ

A kikötésed szerint ezek `NOT NULL`-ok, tehát **utólag nem pótolhatók**:

| mező | mit bizonyít |
|---|---|
| `signed_text` | **szó szerint** a szöveg, amit aláírt |
| `signed_text_version` | melyik sablonváltozat |
| `language` | **milyen nyelven olvasta** |
| `signed_snapshot` + `content_sha256` | milyen adatokat látott, és hogy azok nem változtak |
| `signed_at`, `signed_on` | mikor, és milyen készüléken |
| `ip`, `user_agent` | melyik eszközről |
| `operator_user_id` | **ki volt belépve a készüléken** |

**A szöveget azért tároljuk szó szerint, és nem hivatkozásként:** egy későbbi
sablonmódosítás visszamenőleg **hazudna** arról, mit írt alá.

**Az ujjlenyomat a (szöveg + adatok) hash-e, nem a renderelt PDF-é.** Ez tudatos: a
PDF-készítés (Chrome) lassú és elbukhat — a helyszínen álló lakó aláírása nem múlhat
ezen. A pillanatképből a dokumentum bármikor reprodukálható, és a `verify()` kimutatja,
ha az irat utólag megváltozott.

### A megtagadás is érvényes kimenet

Külön gomb: **„Az aláírást megtagadja"**, indokkal. Egy adatbázis-szintű `CHECK` zárja ki
az üres sort: **vagy aláírás van, vagy megtagadás.**

> Egy vitában az „aláírást megtagadta, tanú jelenlétében" bejegyzés **többet ér**, mint a
> hiányzó sor, amiről utólag semmit nem lehet tudni.

---

## 2. ÖT NYELV — visszaesés nélkül

A nyilatkozatok **4 típus × 3 szerep × 5 nyelv** = mind megvan, verziózva
(`2026-09-24.1`). **Ismeretlen nyelvre a rendszer HIBÁT dob, nem esik vissza csendben
magyarra** — pont az a helyzet lenne, amit el akarunk kerülni.

### A kárigény szövege — a kikötésed szerint

> „A fenti kárigényt és annak összegét **TUDOMÁSUL VETTEM**. Tudomásul veszem, hogy a
> Housing Solutions **NEM ÉRVÉNYESÍT LEVONÁST**: a jegyzőkönyvet a munkáltatóm /
> megbízóm felé továbbítja, és az esetleges levonásról **az ő bérszámfejtése** dönt a rá
> vonatkozó szabályok szerint. Az aláírásom a kárigény megismerését igazolja, **NEM a
> levonáshoz való hozzájárulást**."

Mind az 5 nyelven. Egy „hozzájárulok a levonáshoz" szöveg olyan jognyilatkozat lenne,
amire nincs is jogosultságunk — és egy vitában **ellenünk** fordulna.

---

## 3. A KÁRJEGYZŐKÖNYV LÁNCA BEFEJEZVE

### Hol találod a felületen

> **Kárjegyzőkönyvek** → a jegyzőkönyv megnyitása → jobb oldalon az **„Aláírások"**
> dobozban soronként egy **„Aláíratás"** gomb (Lakó / Munkatárs / Tanú).

A párbeszéd sorrendje szándékos: **1. nyelv → 2. szöveg → 3. rajzvászon.** Fordítva az
aláírás megelőzné a megértést, ami az egész funkció értelmét venné el.

### Négy hiba javítva ugyanabban a láncban

| # | mi volt | most |
|---|---|---|
| 1 | **nem volt aláíró felület** sehol | közös párbeszéd, ujjal/egérrel rajzolható |
| 2 | a chipek a `report.employee_signature` mezőt olvasták, az API `employee_signature_data`-t ad → **mindig „Nincs"** | az egységes tárból olvas, névvel, nyelvvel, időponttal |
| 3 | **a PDF nem tartalmazta az aláírásképet** — csak üres vonalat rajzolt | a kép bekerül, és a lap alján az aláírt nyilatkozatok a nyelvvel és az ujjlenyomattal |
| 4 | a PDF nyelvét a **letöltő** választotta | **az aláírás dönti el**: amit a lakó ukránul írt alá, az ukránul hiteles |

---

## 4. ÉLES PRÓBA

```
nyilatkozat-végpont ->  200  | nyelvek: hu,en,uk,tl,de
  tartalmazza, hogy NEM vonunk le:  true
aláírás rögzítése   ->  201  | hash: 2eea28e03545d388…
  tárolva: language=uk, signed_on=staff_device, ip=172.18.0.1,
           user_agent=ELES-PROBA/1.0, signed_text_version=2026-09-24.1
próba-aláírás törölve.
```

A kötelező bizonyíték-mezők élesben is kitöltődnek — nem üres oszlopokként léteznek.

---

## 5. TESZTEK — új SIGN terület, 10 eset

```
SIGN-01  a lakó aláírása rögzül, a bizonyíték-mezőkkel együtt
SIGN-02  ⚠️ a SZÖVEGET szó szerint tárolja, nem sablon-hivatkozásként
SIGN-03  ugyanaz a szerep KÉTSZER nem írhat alá — 409, érthető üzenettel
SIGN-04  ⚠️ MIND AZ 5 NYELVEN van nyilatkozat, mind a 4 dokumentumtípusra
SIGN-05  az aláírás MEGTAGADÁSA is rögzíthető — indokkal
SIGN-06  üres sor NEM keletkezhet: aláírás és indok nélkül elutasítja
SIGN-07  ISMERETLEN nyelvre nem ír alá — nem esik vissza csendben magyarra
SIGN-08  az UJJLENYOMAT kimutatja, ha a dokumentum utólag megváltozott
SIGN-09  ⚠️ az ALÁÍRÁSKÉP bekerül a PDF-be — eddig csak üres vonal volt
SIGN-10  a PDF nyelvét az ALÁÍRÁS dönti el, nem a letöltő
```

**362 passed / 0 failed**, háromszor egymás után.

*(Mellékesen: a functest HTTP-segédje mostantól küld `User-Agent`-et. Minden valódi
kliens küld; enélkül a bizonyíték-kötelezettség jogosan utasított volna el — de nem a
vizsgált viselkedés, hanem a tesztkörnyezet hiánya miatt.)*

---

## 6. AMI MÉG HÁTRAVAN — a jóváhagyott sorrend szerint

| # | lépés | állapot |
|---|---|---|
| 1 | egységes tábla + közös komponens | ✅ **kész** |
| 2 | kárjegyzőkönyv befejezése | ✅ **kész** |
| 3 | kárigény tudomásulvétele a helyes szöveggel | ⏳ a szöveg és a mechanizmus kész, a **bekötés** hátravan |
| 4 | ellenőrzési jegyzőkönyv + a PDF 5 nyelvre írása | ⏳ **a legnagyobb darab** — 54 beégetett magyar szöveg |
| 5 | lakói aláírás saját telefonon | ⏳ új `/my` végpontok + mobil rajzvászon |
| 6 | általános dokumentum a videó-modul általánosításával | ⏳ |

---

## ÖSSZEFOGLALÓ

**Elkészült:** a jóváhagyott sorrend **1. és 2. lépése**, élesítve (mig 177). Egy `document_signatures` tábla mind a négy dokumentumtípusra; a bizonyító erő mezői **kötelezők** (szöveg szó szerint, szövegverzió, nyelv, pillanatkép, ujjlenyomat, idő, készülék, IP, kezelő) — utólag nem pótolhatók, ahogy kikötötted. Az aláírás megtagadása is rögzíthető, indokkal. A kárjegyzőkönyv lánca teljes: **négy** hibát javítottam benne (nem volt aláíró felület; a chipek rossz mezőnevet olvastak, ezért mindig „Nincs"-et mutattak; a PDF nem tartalmazta az aláírásképet; a PDF nyelvét a letöltő választotta, nem az aláíró). Élesben kipróbálva. Új SIGN terület 10 eset, suite **362/0**. Megtalálod: **Kárjegyzőkönyvek → a jegyzőkönyv megnyitása → „Aláírások" doboz → „Aláíratás" gomb**.
**Döntési pont:** nincs.
**Tőled kell:** semmi — folytatom a sorrend szerint. A következő kör a **kárigény bekötése** (kicsi, a szöveg már kész), utána az **ellenőrzési jegyzőkönyv**, ami a legnagyobb darab: a PDF-jében ma 54 beégetett magyar szöveg van, azt teljesen újra kell írni 5 nyelvre.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-alairas-egysegesites-2026-09-24.md
