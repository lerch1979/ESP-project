# Átfogó Kutatási Jelentés — HR-ERP Jólléti Platform

**Dátum:** 2026-03-18 | **Verzió:** 1.0

---

## Vezetői Összefoglaló

Ez a jelentés összefoglalja a versenytárs platformok, akadémiai szakirodalom, HR technológiai trendek, megfelelőségi szabványok és szállásspecifikus jóllét kutatásait, hogy azonosítsa a hiányosságokat és fejlesztési lehetőségeket a HR-ERP jólléti platform számára.

### Főbb Megállapítások

1. **Platformunk már átlag feletti** az alapfunkciókban (MBI/UWES felmérések, EAP ügykezelés, szálláskörnyezet nyomon követése, konfliktuskezelés) — a legtöbb versenytárs a tartalomszolgáltatásra fókuszál, nem az analitikára.
2. **Legnagyobb hiányosságok**: Nincs meditációs/mindfulness tartalomkönyvtár, nincs Slack/Teams integráció, nincs gamifikáció (sorozatok/pontok), nincs viselhető eszköz adat, nincs WHO-5 szűrés.
3. **Legnagyobb előnyök**: Szállástisztaság-korreláció, túlóra-kiégés összekapcsolás, betegszabadság automatikus érzékelése, konfliktus-jóllét korreláció — olyan funkciók, amelyeket egyetlen versenytárs sem kínál.
4. **Legnagyobb hatású bővítések**: AI hangulatelemzés, Slack/Teams botok, gamifikáció (sorozatok/pontok), hozzájáruláskezelő felület, többnyelvű támogatás.
5. **Megfelelőségi prioritás**: Az adatvédelmi hatásvizsgálat (DPIA) kötelező az éles indítás előtt (GDPR 35. cikk); az EU AI rendelet magas kockázatú besorolása vonatkozik a prediktív funkcióinkra.

### Top 5 Javaslat

| # | Javaslat | Ráfordítás | Várható Hatás |
|---|---|---|---|
| 1 | Slack/Teams napi check-in bot hozzáadása | 1-2 hét | 3-5x pulzus részvételi arány |
| 2 | Gamifikáció bevezetése (sorozatok + pontok) | 1 hét | 30-40% adoptáció növekedés |
| 3 | WHO-5 havi jólléti szűrő hozzáadása | 2 nap | Klinikailag validált alapvonal |
| 4 | Hozzájáruláskezelő felület + DPIA elkészítése | 1-2 hét | GDPR megfelelőség (kötelező) |
| 5 | NLP hangulatelemzés a pulzus megjegyzéseken | 2-3 hét | Korai szorongásfelismerés |

---

## 1. Versenytárs Elemzés

### Piaci Környezet

A vállalati jólléti piac várhatóan eléri a 93 milliárd dollárt 2028-ra (CAGR ~7%). A főbb szereplők három kategóriába sorolhatók:

| Kategória | Platformok | Fókusz |
|---|---|---|
| **Tartalomközpontú** | Headspace for Work, Calm Business, Unmind | Meditáció, mindfulness, CBT tartalom |
| **Klinikai EAP** | Lyra Health, Spring Health, Modern Health | Terapeuta párosítás, klinikai eredmények |
| **Holisztikus platform** | Virgin Pulse (Personify Health), Wellhub, Limeade | Fizikai + mentális + pénzügyi jóllét |

### Összehasonlító Mátrix — Platformunk vs. Top 5

| Funkció | Platformunk | Headspace | Lyra Health | Modern Health | Virgin Pulse | Spring Health |
|---|---|---|---|---|---|---|
| Napi hangulat követés | **Igen (pulzus)** | Nem | Nem | Igen | Igen | Nem |
| Kiégés felmérés (MBI) | **Igen** | Nem | Nem | Nem | Nem | Nem |
| Elkötelezettség felmérés (UWES) | **Igen** | Nem | Nem | Nem | Nem | Nem |
| EAP ügykezelés | **Igen** | Nem | **Igen** | **Igen** | Részleges | **Igen** |
| Szolgáltató keresés + foglalás | **Igen** | Nem | **Igen** | **Igen** | Nem | **Igen** |
| Szállásminőség nyomon követése | **Igen (egyedi)** | Nem | Nem | Nem | Nem | Nem |
| Túlóra-kiégés korreláció | **Igen (egyedi)** | Nem | Nem | Nem | Nem | Nem |
| Betegszabadság automatikus érzékelés | **Igen (egyedi)** | Nem | Nem | Nem | Nem | Nem |
| Konfliktus-jóllét nyomon követés | **Igen (egyedi)** | Nem | Nem | Nem | Nem | Nem |
| Prediktív analitika | **Igen** | Nem | **Igen** | Részleges | **Igen** | **Igen** |
| Meditációs tartalom | **Nem** | **Igen (4000+)** | Nem | **Igen** | Részleges | Nem |
| Slack/Teams integráció | **Nem** | **Igen** | **Igen** | **Igen** | **Igen** | **Igen** |
| Viselhető eszköz integráció | **Nem** | Nem | Nem | Részleges | **Igen** | Nem |
| Gamifikáció | **Nem** | Részleges | Nem | Nem | **Igen** | Nem |
| Coaching (videó) | Részleges (személyes) | Nem | **Igen** | **Igen** | Részleges | **Igen** |
| Többnyelvű | Részleges (HU/EN) | **Igen (15+)** | **Igen** | **Igen** | **Igen** | **Igen** |
| Vezetői irányítópult | **Igen** | Részleges | **Igen** | **Igen** | **Igen** | **Igen** |
| GDPR megfelelő | **Igen** | **Igen** | **Igen** | **Igen** | **Igen** | **Igen** |

### Egyedi Előnyeink (Versenytársak Nem Kínálják)

1. **Szállástisztaság → jóllét korreláció** automatizált ellenőrzési munkafolyamatokkal
2. **Túlóra → kiégés korreláció** automatikus riasztással >40 óra/hó felett
3. **Betegszabadság automatikus érzékelő trigger** (3+ alkalom 30 napon belül → ajánlás + értesítések)
4. **Konfliktus jegy → jólléti ajánlás** krízis eszkalációs protokollal
5. **Kérdésrotációs rendszer** a felmérési fáradtság megelőzésére
6. **Modulok közötti ajánlási rendszer** (WellMind ↔ CarePath ↔ HR rendszer)

### Hozzáadandó Funkciók (Hiányosság Elemzés)

| Prioritás | Funkció | Versenytársak Akik Rendelkeznek Vele |
|---|---|---|
| **Magas** | Slack/Teams integráció | Mind az 5 versenytárs |
| **Magas** | Mindfulness tartalomkönyvtár | Headspace, Modern Health |
| **Magas** | Gamifikáció (sorozatok, pontok) | Virgin Pulse, Headspace |
| **Közepes** | Videó coaching | Lyra, Modern Health, Spring Health |
| **Közepes** | Viselhető eszköz integráció | Virgin Pulse |
| **Közepes** | Teljes többnyelvű támogatás | Minden versenytárs |
| **Alacsony** | Pénzügyi jólléti eszközök | Virgin Pulse, Modern Health |
| **Alacsony** | Igény szerinti terápiás chat | Lyra, Spring Health |

---

## 2. Akadémiai Megállapítások

### Validált Mérőeszközök

| Eszköz | Felhasználás | Tételek | Pontozás | Licenc |
|---|---|---|---|---|
| **MBI-GS** | Kiégés (3 dimenzió) | 16 | 0-6 gyakoriság | Mind Garden ($2,50/felmérés) |
| **UWES-9** | Elkötelezettség (3 dimenzió) | 9 | 0-6 gyakoriság | Ingyenes nem kereskedelmi célra |
| **WHO-5** | Általános jólléti szűrés | 5 | 0-25 nyers / 0-100% | **Ingyenes** |
| **GHQ-12** | Pszichológiai distressz | 12 | 0-36 Likert | Licencelt |
| **Edmondson 7 tételes** | Csapat pszichológiai biztonság | 7 | 1-7 Likert | Ingyenes kutatáshoz |

**Javaslat**: WHO-5 havi szűrőként való bevezetése (ingyenes, 5 tétel, 700+ publikációban validált, ≤7 nyers pontszám jelzi a gyenge jóllétet).

### Beavatkozások Megtérülési Adatai

| Beavatkozás Típusa | ROI | Hatásméret | Forrás |
|---|---|---|---|
| Elsődleges megelőzés (munkaszervezés) | **5:1 – 10:1** | d=0,45-0,65 | Deloitte 2020 |
| Másodlagos megelőzés (képzés) | 3:1 – 5:1 | d=0,25-0,40 | PwC/Beyond Blue 2014 |
| Reaktív/EAP | 1:1 – 3:1 | d=0,30-0,50 | Attridge 2019 |
| WHO: depresszió/szorongás kezelése | **4:1** | — | WHO 2019 |

**Kulcsfontosságú felismerés**: A megelőzés 3-5x költséghatékonyabb a reaktív megközelítésnél. Platformunk helyesen a korai felismerésre fókuszál (pulzus felmérések, MBI pontozás, automatikus triggerek).

### Szállásminőség Hatása

- A szálláselégedetlenség önállóan előrejelzi a munkaelégedetlenséget (OR=1,8)
- A rossz szállás megduplázza az önkéntes fluktuáció kockázatát
- 1 SD javulás a szálláselégedettségben → 0,3 SD javulás a munkaelégedettségben
- Megfelelő szálláson élő munkavállalók: 25-30%-kal kevesebb munkahelyi baleset
- Fő dimenziók: magánélet (legerősebb), zsúfoltság, hőkomfort, tisztaság, biztonság

### Fizikai Munkát Végzők Speciális Igényei

- A segítségkérési arány 50-70%-kal alacsonyabb a szellemi munkát végzőkhöz képest (stigma)
- A műszakos munka 33%-kal növeli a depresszió kockázatát
- Az SMS/WhatsApp alapú beavatkozások 3x-os elköteleződést mutatnak a webes portálokhoz képest
- A kortárstámogatási programok hatékonyabbak a formális tanácsadásnál
- Mobilra optimalizált, offline képes, többnyelvű kialakítás elengedhetetlen

---

## 3. Technológiai Trendek (2025-2026)

### Legnagyobb Hatású Technológiák

| Technológia | Mit Tesz Lehetővé | Ráfordítás | Prioritás |
|---|---|---|---|
| **LLM hangulatelemzés** | Szorongás felismerése a pulzus megjegyzésekben | Közepes | Magas |
| **Slack/Teams botok** | Napi check-in ott, ahol a munkavállalók dolgoznak | Egyszerű | Magas |
| **Gamifikációs motor** | Sorozatok, pontok, jelvények a tartós elköteleződésért | Egyszerű | Magas |
| **Naptár integráció** | Automatikus szünet javaslat megbeszélés túlterhelés után | Egyszerű | Közepes |
| **Apple HealthKit / Google Fit** | Alvásminőség + HRV passzív adatok | Közepes | Közepes |
| **Differenciált adatvédelem** | Erősebb anonimizálás csapatmutatókhoz | Közepes | Magas |
| **CBT mikro-gyakorlatok** | Bizonyítékokon alapuló chatbot beavatkozások | Közepes | Közepes |

### Integrációs Prioritások

1. **Slack** (legnagyobb kereslet, legegyszerűbb megvalósítás, legnagyobb adoptációs hatás)
2. **Google Naptár** (az infrastruktúra már létezik az alkalmazásban)
3. **Zoom/Google Meet** (videó coaching távoli CarePath alkalmakhoz)
4. **Apple HealthKit** (passzív alvás/aktivitás adatok)

---

## 4. Megfelelőségi Áttekintés

### Jelenlegi Állapot

| Követelmény | Állapot | Szükséges Lépések |
|---|---|---|
| GDPR 9. cikk (egészségügyi adatok) | **Részleges** | DPIA elkészítése, hozzájáruláskezelő felület |
| GDPR Törléshez való jog | **Részleges** | „Adataim letöltése" + automatikus törlés cron |
| Min. 5 fős aggregációs küszöb | **Kész** | Már érvényesítve a nézetekben |
| Változtathatatlan naplózás | **Kész** | wellbeing_audit_log blokkolt UPDATE/DELETE-tel |
| ISO 45003 pszichoszociális felmérés | **Részleges** | WHO-5 szűrő hozzáadása, kockázatértékelés dokumentálása |
| EU AI rendelet (magas kockázat) | **Nem elkezdett** | Műszaki dokumentáció, megfelelőségi értékelés, emberi felügyelet dokumentálása |
| Magyar NAIH | **Részleges** | Magyar nyelvű adatvédelmi tájékoztatók, üzemi tanács konzultáció |

### Kritikus Lépések Éles Indítás Előtt

1. **DPIA (Adatvédelmi Hatásvizsgálat)** — kötelező a szisztematikus egészségügyi adatfeldolgozáshoz
2. **Hozzájáruláskezelő felület** — részletes opt-in adattípusonként
3. **EU AI rendelet dokumentáció** — chatbot NLP és prediktív analitika számára
4. **Adatvédelmi tájékoztatók magyarul** + munkavállalók anyanyelvén
5. **Éves torzításvizsgálat** minden AI/ML komponenshez

---

## 5. Szállásspecifikus Kutatás

### Bizonyítékokon Alapuló Ellenőrzési Kritériumok

| Dimenzió | Súly | Mérés | Hatás |
|---|---|---|---|
| Magánélet | Magas | Egyágyas vs. közös szoba, zárak | Legerősebb mentális egészség előrejelző |
| Zsúfoltság | Magas | Személyek szobánként (cél: <1,5) | 2x depresszió kockázat zsúfoltság esetén |
| Tisztaság | Közepes | 1-10 pontszám (4 terület) | Társas konfliktus hajtóerő |
| Hőkomfort | Közepes | Hőmérséklet (18-28°C) | 25%-kal magasabb szorongás hideg/nyirkos környezetben |
| Biztonság | Magas | Zárak, világítás, tűzbiztonság | Erős szorongás előrejelző |
| Zaj | Közepes | Szubjektív értékelés + decibel mérés | Alvászavar, emelkedett kortizol |
| Kapcsolódás | Alacsony-Közepes | WiFi elérhetőség | Társas elszigeteltség tényező |

### Optimális Ellenőrzési Ütemterv

- **Átfogó**: Negyedévente
- **Szúrópróbaszerű**: Havonta
- **Lakói elégedettségi felmérés**: Havonta (rövid, 5 tételes)
- **Incidens utáni**: 24 órán belül
- **Megoldási célérték**: <72 óra nem sürgős, <24 óra egészség/biztonság

---

## Hivatkozások

- Maslach, C. & Leiter, M.P. (2016). Burnout. Stress: Concepts, Cognition, Emotion, and Behavior.
- Schaufeli, W.B. & Bakker, A.B. (2004). UWES Manual. Utrecht University.
- Topp, C.W. et al. (2015). WHO-5 Well-Being Index: systematic review. Psychotherapy and Psychosomatics.
- Deloitte (2020). Mental health and employers: refreshing the case for investment.
- WHO (2018). Housing and Health Guidelines. World Health Organization.
- EU AI Act (2024). Regulation (EU) 2024/1689.
- ISO 45003:2021. Psychological health and safety at work.
- Edmondson, A.C. (1999). Psychological Safety and Learning Behavior in Work Teams. ASQ.
- Evans, G.W. et al. (2003). Housing Quality and Mental Health. Journal of Social Issues.
