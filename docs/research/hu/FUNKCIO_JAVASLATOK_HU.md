# Funkció Javaslatok — Priorizált Fejlesztési Terv

---

## Magas Prioritás (23-25. Ülés)

| # | Funkció | Indoklás | Ráfordítás | Hatás |
|---|---|---|---|---|
| 1 | **Slack napi check-in bot** | Minden versenytárs rendelkezik vele; 3-5x részvételi arány | 1-2 hét | Nagyon Magas |
| 2 | **Gamifikáció: sorozatok + pontok** | 30-40% adoptáció növekedés (bizonyított); sorozat = legerősebb megtartás | 1 hét | Nagyon Magas |
| 3 | **WHO-5 havi szűrő** | Ingyenes, 5 tétel, klinikailag validált (700+ tanulmány), szűrőérték ≤7 | 2 nap | Magas |
| 4 | **Hozzájáruláskezelő felület** | GDPR kötelező (9. cikk egészségügyi adat); részletes opt-in adattípusonként | 1-2 hét | Magas (megfelelőség) |
| 5 | **DPIA dokumentáció** | Jogilag kötelező éles indítás előtt | 1 hét | Kritikus (megfelelőség) |
| 6 | **NLP hangulatelemzés** | Kulcsszó-alapúról LLM-alapú szorongásfelismerésre váltás a pulzus megjegyzésekben | 2-3 hét | Magas |
| 7 | **Teljes i18n keretrendszer** | Fizikai munkások/migráns munkavállalók anyanyelvi támogatása szükséges; HU/EN/RO minimum | 2 hét | Magas |

## Közepes Prioritás (26-30. Ülés)

| # | Funkció | Indoklás | Ráfordítás | Hatás |
|---|---|---|---|---|
| 8 | **Teams napi check-in bot** | Második legnépszerűbb munkahelyi platform a Slack után | 2 hét | Közepes-Magas |
| 9 | **Naptár szünet javaslatok** | Megbeszélés túlterhelés felismerése → automatikus szünet javaslat (meglévő Google Cal infra) | 1 hét | Közepes |
| 10 | **Mindfulness tartalomkönyvtár** | Alapvető funkció; válogatott légzés/meditációs gyakorlatok | 2 hét | Közepes |
| 11 | **Videó coaching integráció** | Google Meet link automatikus generálása CarePath foglalásokhoz | 1 hét | Közepes |
| 12 | **CBT mikro-gyakorlatok a chatbotban** | Bizonyítékokon alapuló 5-10 perces gyakorlatok; klinikailag validált | 2 hét | Közepes |
| 13 | **Differenciált adatvédelem** | Laplace-zaj csapatmutatókhoz (5-15 fős csapatok) | 1-2 hét | Közepes (megfelelőség) |
| 14 | **GDPR adatexport** | „Adataim letöltése" gomb; GDPR 20. cikk adathordozhatóság | 1 hét | Közepes (megfelelőség) |
| 15 | **WCAG 2.1 AA akadálymentesítési audit** | EU jogi követelmény; képernyőolvasó, kontraszt, billentyűzet navigáció | 2 hét | Közepes (megfelelőség) |

## Alacsony Prioritás (31-35. Ülés)

| # | Funkció | Indoklás | Ráfordítás | Hatás |
|---|---|---|---|---|
| 16 | **Apple HealthKit integráció** | Passzív alvás/aktivitás adatok; automatikus pulzus mező kitöltés | 2-3 hét | Közepes |
| 17 | **Google Health Connect (Android)** | Ugyanaz mint a HealthKit Android felhasználóknak | 2-3 hét | Közepes |
| 18 | **Csapat jólléti kihívások** | Időkorlátos versenyek (lépések, meditáció); csapat elköteleződés | 2 hét | Közepes |
| 19 | **Kortárs elismerés (kudos)** | Könnyűsúlyú jólléti elismerés kollégák között | 1 hét | Alacsony-Közepes |
| 20 | **Intelligens beavatkozás párosítás** | ML-alapú: pontszámok alapján → leghatékonyabb CarePath szolgáltatás ajánlása | 3 hét | Közepes |
| 21 | **Kiégés előrejelzési modell** | Logisztikus regresszió pulzus trendeken a kiégés 14 napos előrejelzéséhez | 3 hét | Közepes-Magas |
| 22 | **Tartalomajánló motor** | Magas stressz → légzőgyakorlatok; alacsony hangulat → viselkedésaktiváció | 2 hét | Közepes |
| 23 | **Offline pulzus beküldés** | Sorba állítás AsyncStorage-ban → szinkronizálás visszacsatlakozáskor (fizikai munkásoknak elengedhetetlen) | 1 hét | Közepes |

## Jó Ha Van (Teendőlista)

| # | Funkció | Indoklás | Ráfordítás |
|---|---|---|---|
| 24 | Pénzügyi jólléti modul | Növekvő trend; partner integráció az ajánlási rendszeren keresztül | Egyszerű |
| 25 | Hangalapú check-in felület | Beszédfelismerés → hangulat osztályozás; alacsony írástudás támogatás | Nehéz |
| 26 | Eszközön futó ML következtetés | Föderált tanulás; adatvédelem-megőrző kockázatpontozás | Nehéz |
| 27 | Kortárstámogatási körök | Anonim csoportos chat, moderált | Közepes |
| 28 | Krízis forródrót integráció | 24/7 telefonos támogatás eszkalációs protokollal | Közepes |
| 29 | HRIS webhook fogadó | Munkavállalói életciklus események → jólléti onboarding | Közepes |
| 30 | Pszichológiai biztonsági felmérés | Edmondson 7 tételes skála csapat szinten (félévente) | Egyszerű |

---

## Megvalósítási Függőségek

```
Gamifikáció (2) ← nincs függőség
Slack bot (1) ← webhook végpont szükséges
WHO-5 (3) ← pulzus kérdésekhez hozzáadás
Hozzájáruláskezelő (4) ← backend hozzájárulási tábla szükséges
DPIA (5) ← hozzájáruláskezelő szükséges előbb
NLP hangulatelemzés (6) ← OpenAI/Claude API kulcs szükséges
i18n (7) ← react-i18next beállítás; összes szöveg kinyerése
Naptár szünetek (9) ← meglévő Google Naptár OAuth használata
Videó coaching (11) ← conferenceData hozzáadása Naptár eseményekhez
HealthKit (16) ← react-native-health; csak iOS
```
