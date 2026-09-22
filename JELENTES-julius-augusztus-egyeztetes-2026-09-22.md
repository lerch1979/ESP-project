# Július–augusztusi egyeztetés: számított bevétel vs. ténylegesen kiszámlázott

**Dátum:** 2026-09-22 · **Státusz:** ⛔ **NEM rögzítettem semmit** — az eltérés jelentős

---

## 0. A LÉNYEG ELÖLJÁRÓBAN

Két dolgot találtam, és a kettő ellentétes irányba mutat:

1. **A díjak jók.** Az augusztusi számla öt tételéből **hármat pontosan, maradék nélkül
   fel tudtam bontani** a szeptemberi díjakra. Ez erős bizonyíték arra, hogy a 3 476 /
   3 950 Ft-os díjak **augusztusban már éltek** — tehát a visszamenőleges díjsorok
   jogosak.
2. **De az összeg nem áll össze.** A megadott tételek összege 7 264 184 Ft, a rendszer
   augusztusra 33 140 738 Ft ágydíjat számol. A különbség ~26 M Ft. Ez túl nagy ahhoz,
   hogy „eltérés" legyen — inkább **hiányzik egy adat**: az ágydíj-sor összege.

Ezért nem rögzítettem. A kikötésed szerint jeleztem.

---

## 1. MI VAN MA A RENDSZERBEN

**Minden bevételi díjsor 2026-09-01-jén kezdődik.** Egyetlen kivétel a Sarród I. blokkos
sora (2026-01-01 → 2026-08-31, 31 ágy, 90%, 3 500 / 2 400) — ez **pontosan úgy van, ahogy
kérted, és nem nyúltam hozzá.**

Következmény: júliusra és augusztusra a rendszer **a Sarród I.-en kívül minden házra 0
Ft-ot számol.**

```
2026-07  számított ma:  3 261 200 Ft   (csak Sarród I.)
2026-08  számított ma:  3 261 200 Ft   (csak Sarród I.)
```

**Kiállított számla a rendszerben: nincs.** Egyetlen kimenő számla sincs rögzítve
(`invoices` ahol `client_id` nem üres: **0 sor**). Az egyeztetés ezért csak az általad
megadott számokkal végezhető el — a rendszer a ténylegesen kiszámlázott oldalt **nem
ismeri**.

---

## 2. A FOGLALTSÁGI ADAT — ez a jó hír

Aggódtam, hogy júliusra/augusztusra nincs valós foglaltság. **Van:**

| hónap | lefedett nap | átlagos létszám |
|---|---|---|
| 2026-07 | **31 / 31** | 282 fő |
| 2026-08 | **31 / 31** | 283 fő |

A `occupancy_snapshots` mindkét hónapot hiánytalanul lefedi. Egy fenntartás: az
`employee_accommodation_history` mind a 330 sora **2026-09-16-án**, visszamenőleg készült
(`reason = 'rebuilt_from_snapshots'`) — tehát rekonstrukció, nem egykorú rögzítés. A
napi pillanatképek viszont egykorúak, és a rekonstrukció ezekből készült, úgyhogy az
alapadat megbízható.

---

## 3. HÁZANKÉNTI ÖSSZEHASONLÍTÁS

Az alábbi „visszamenőleges" oszlop azt mutatja, amit a rendszer számolna, ha a
szeptemberi díjsorokat július 1-re visszavezetnénk. Sarród I. a blokkos szerződésén
marad, ahogy kérted.

### Július 2026

| szállás | munkahely | fő-nap | díj | visszamenőleg | ma |
|---|---|---:|---:|---:|---:|
| Beled | Autoliv | 1 023 | 3 476 | 3 555 948 | 0 |
| Beled | **Ikea** | **93** | **— nincs díjsor** | **0** | 0 |
| Bük_Barki Apartman | Autoliv | 961 | 3 476 | 3 340 436 | 0 |
| Fertőd | Autoliv | 124 | 3 476 | 431 024 | 0 |
| Fertőrákos | Ikea | 713 | 3 950 | 2 816 350 | 0 |
| Fertőszéplak | Ikea | 620 | 3 950 | 2 449 000 | 0 |
| Petőháza | Autoliv | 837 | 3 476 | 2 909 412 | 0 |
| Petőháza | Ikea | 31 | 3 950 | 122 450 | 0 |
| Röjtökmuzsaj | Ikea | 1 581 | 3 950 | 6 244 950 | 0 |
| **Sarród I.** | Autoliv | 558 | **blokk** | **3 261 200** | 3 261 200 |
| Sarród II. | Autoliv | 248 | 3 476 | 862 048 | 0 |
| Sarród II. | Ikea | 124 | 3 950 | 489 800 | 0 |
| Sopronhorpács | Autoliv | 1 395 | 3 476 | 4 849 020 | 0 |
| Sopronhorpács | Ikea | 434 | 3 950 | 1 714 300 | 0 |
| **ÖSSZESEN** | | **8 742** | | **33 045 938** | **3 261 200** |

### Augusztus 2026

Egyetlen eltérés júliushoz képest: **Fertőrákos 713 → 737 fő-nap** (+94 800 Ft). Minden
más ház változatlan.

| | |
|---|---:|
| **ÖSSZESEN augusztus** | **33 140 738** |
| ebből ma számolt | 3 261 200 |
| **különbözet** | **29 879 538** |

**Július + augusztus visszamenőleg: 66 186 676 Ft** (a korábban emlegetett ~60,4 M-os
becslésem helyett — ez a pontos szám).

---

## 4. AZ AUGUSZTUSI SZÁMLA TÉTELEI — mit sikerült megfejteni

Az öt tételt végigpróbáltam az összes ismert éjszakadíjon. Az eredmény meglepően tiszta:

| tétel | összeg | felbontás | ✓ |
|---|---:|---|:-:|
| ukránok | 2 819 036 | **3 476 × 811 ágyéjszaka** — maradék nélkül | ✅ |
| átsorolás A | 63 042 | **474 × 133** (474 = 3 950 − 3 476, a két díj különbözete) | ✅ |
| átsorolás B | 9 006 | **474 × 19** | ✅ |
| 10 fő új beköltöző | 790 000 | **79 000 × 10 fő** — egyszeri beköltözési díj | ✅ |
| ágydíjak + kompenzáció | 3 583 100 | 2² × 5² × **35 831** (prím) — egyik díjjal sem osztható | ❌ |

**Amit ebből biztosan tudunk:**

- Az **átsorolás** nálatok a két díj **különbözeteként** kerül a számlára (474 Ft/éj),
  nem teljes átszámlázásként. Ez a rendszerben **nem létező fogalom**.
- Az **ukránokat** 3 476 Ft-on számlázzátok, tehát ugyanazon a díjon, mint az Autoliv-os
  ágyakat — de **külön soron**. A rendszer az állampolgárságot nem ismeri (536 dolgozóból
  535-nél üres a `nationality`), így ezt a csoportot **nem tudja elkülöníteni**.
- A **beköltözési díj** (79 000 Ft/fő) a rendszerben **nem létezik** — a számlázómotorban
  nincs ilyen fogalom.
- A 3 476 és 3 950 Ft-os díjak **augusztusban már éltek**. Három tétel pontos, maradék
  nélküli felbontása ezt bizonyítja.

**Amit nem tudok:** a 3 583 100 Ft nem bontható fel semmilyen ismert díjra. Ha ez a
**teljes** ágydíj + kompenzáció, akkor 283 fő × 31 éjszakára ~31 M Ft hiányzik a
számláról. Ha viszont ez **csak a kompenzációs sor**, és az ágydíj-blokk összegét nem
írtad le, akkor minden a helyére kerül.

⚠️ **Két külön dolgot hívunk „kompenzációnak".** A rendszerben a
`compensations` tábla a **kártérítés** (rongálás, takarítás) — összesen 2 tétel,
20 000 Ft. A számlán szereplő 3 583 100 Ft-nak ehhez semmi köze, és a rendszerben nincs
megfelelője.

---

## 5. EGY VALÓDI, MA IS FOLYÓ HIÁNY — Beled + Ikea

A **Beled** szállásra Ikea-munkahelyű lakók is be vannak osztva, de **Beled+Ikea párosra
nincs díjsor**. A rendszer ezekre 0 Ft-ot számol:

| hónap | fő-nap | ki nem számlázott (3 950-nel) |
|---|---:|---:|
| 2026-07 | 93 | 367 350 |
| 2026-08 | 93 | 367 350 |
| 2026-09 (21 napig) | 6 | 23 700 |

Ez nem a visszamenőleges kérdés része — **ma is hiányzik**, és a szeptemberi
számlázásból is kiesik. Ezt a díjsort a többitől függetlenül érdemes pótolni.

---

## 6. EGY APRÓSÁG A SARRÓD I.-EN

A blokkos szerződés 31 ágy × 90% = **27,9** garantált ágyat jelent. A rendszer ezt
**28-ra kerekíti fel**, és a maradék 3 ágyat számolja üresnek:

```
28 × 3 500 + 3 × 2 400 = 105 200 Ft/nap  ×31 nap = 3 261 200 Ft
szigorúan 27,9-cel:                                 3 257 790 Ft
```

Különbség **3 410 Ft/hó, a mi javunkra**. Nem nyúltam hozzá; csak jelzem, hogy a
kerekítés tudatos döntés legyen. (A tényleges létszám 18 fő volt, tehát mindkét számítás
a 90%-os garanciát számlázza — a garancia valóban dolgozik.)

---

## 7. MIT KÉREK TŐLED

**Egy szám kell:** az augusztusi számla **ágydíj-sorának** összege (a kompenzáción,
az ukrán soron, a beköltözési díjon és az átsorolásokon kívüli rész).

Ha megvan, a fenti 33 140 738 Ft-ot soronként össze tudom vetni vele, és megmondom,
melyik háznál hány ágyéjszaka a különbség. **Addig nem rögzítek semmit.**

Ha könnyebb: küldd át az augusztusi (és ha van, a júliusi) számla PDF-jét vagy a
tételsorait — abból magam kiolvasom.

### Amit külön el kell döntened, ha a rögzítés megtörténik

1. **Beköltözési díj (79 000 Ft/fő)** — ez ma nem létezik a rendszerben. Felvegyem
   fogalomként, vagy maradjon kézi számlatétel?
2. **Átsorolás mint különbözet (474 Ft/éj)** — szintén nem létezik. Ugyanaz a kérdés.
3. **Ukrán csoport külön soron** — az állampolgárság 535 dolgozónál üres. Ha külön soron
   kell számlázni, ezt az adatot fel kell tölteni.
4. **Beled + Ikea díjsor** — ez ma is pénzt hagy az asztalon, a visszamenőleges kérdéstől
   függetlenül.

---

## ÖSSZEFOGLALÓ

**Elkészült:** házankénti összevetés júliusra-augusztusra; a rendszer ma 3 261 200 Ft-ot számol havonta (csak Sarród I.), visszamenőleges díjsorokkal 33 045 938 (júl) + 33 140 738 (aug) lenne. Az augusztusi számla öt tételéből hármat maradék nélkül felbontottam a szeptemberi díjakra — tehát a díjak augusztusban már éltek. **Nem rögzítettem semmit.**
**Döntési pont:** a megadott tételek összege 7 264 184 Ft, a számított ágydíj 33 140 738 — ~26 M a különbség, ami szerintem hiányzó adat, nem valódi eltérés.
**Tőled kell:** az augusztusi számla **ágydíj-sorának** összege (vagy a számla tételsorai). Külön: a Beled+Ikea díjsor ma is hiányzik, havi ~367 000 Ft esik ki miatta.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-julius-augusztus-egyeztetes-2026-09-22.md
