# Ütemterv V3 — 23-40. Ülések

**2 órás üléseket feltételezve | Hatás, ráfordítás és függőségek alapján priorizálva**

---

## 1. Fázis: AI és Elköteleződés (23-25. Ülés)

### 23. Ülés: Gamifikációs Motor
- Pulzus sorozat követés (aktuális sorozat, leghosszabb sorozat, jelvények 7/30/90 napnál)
- Pontrendszer (pulzus=10, felmérés=50, coaching=100)
- Új tábla: `wellbeing_points` + `wellbeing_badges`
- Mobil: sorozat megjelenítés a WellMind irányítópulton, jelvénygyűjtemény képernyő
- **Eredmények**: 1 migráció, 1 szolgáltatás, 2 mobil képernyő

### 24. Ülés: Slack Integráció
- Slack Bolt alkalmazás napi hangulat check-inhez
- Ütemezett üzenet konfigurálható időpontban
- Interaktív emoji blokk → leképezés a `submitPulse()` végpontra
- Adminisztrátor konfiguráció: engedélyezés/letiltás, emlékeztető időpont beállítása
- **Eredmények**: Slack bot szolgáltatás, webhook végpont, admin konfigurációs oldal

### 25. Ülés: NLP Hangulatelemzés
- Claude/OpenAI API integráció pulzus megjegyzés elemzéshez
- Hangulati pontszám tárolása a pulzus adatok mellett
- Automatikus eszkaláció szorongás észlelése esetén
- Kulcsszó-párosítás cseréje LLM osztályozóra a chatbotban
- **Eredmények**: NLP szolgáltatás, hangulat pontozási pipeline, chatbot fejlesztés

## 2. Fázis: Tartalom és Megfelelőség (26-28. Ülés)

### 26. Ülés: WHO-5 Szűrő + Hozzájáruláskezelés
- WHO-5 havi jólléti szűrés bevezetése (5 tétel, ingyenes)
- Hozzájárulási tábla + részletes opt-in felület
- „Adataim letöltése" (GDPR 20. cikk) végpont + mobil képernyő
- **Eredmények**: WHO-5 kérdések, hozzájárulási szolgáltatás, adatvédelmi képernyő

### 27. Ülés: Mindfulness Tartalomkönyvtár
- Tartalom séma: `wellbeing_content` (típus, kategória, időtartam, nehézség, média_url)
- Válogatott gyakorlatok: légzés (5), meditáció (5), testszkenner (3), hálagyakorlat (3)
- Tartalomajánlás WellMind pontszámok alapján
- Mobil: TartalomKönyvtár képernyő, TartalomLejátszó képernyő
- **Eredmények**: 1 migráció, tartalom szolgáltatás, 2 mobil képernyő

### 28. Ülés: Nemzetköziesítés (i18n)
- react-i18next az admin felülethez, i18n-js a mobilhoz
- Összes magyar szöveg kinyerése → fordítási fájlok
- Támogatás: magyar, angol, román (migráns munkavállalók)
- Chatbot többnyelvű támogatás (nyelvfelismerés)
- **Eredmények**: i18n keretrendszer, HU/EN/RO fordítások, nyelvválasztó

## 3. Fázis: Integrációk (29-31. Ülés)

### 29. Ülés: Naptár + Videó Integráció
- Google Naptár szünet javaslatok (megbeszélés túlterhelés észlelése)
- Automatikus 15 perces „Jólléti Szünet" javaslat 3+ órás folyamatos megbeszélés után
- Google Meet link generálás CarePath foglalásokhoz
- Mobil: szünet értesítés + foglalás visszaigazolás Meet linkkel
- **Eredmények**: Naptár elemzési szolgáltatás, Meet integráció, értesítések

### 30. Ülés: Teams Bot
- Microsoft Teams értesítési bot Adaptive Card-dal
- Ugyanaz a napi check-in folyamat mint a Slack-nél (hangulat + opcionális megjegyzések)
- Teams webhook a válaszok kezeléséhez
- Admin konfigurációs oldal (engedélyezés/letiltás, időzítés)
- **Eredmények**: Teams bot szolgáltatás, webhook végpont

### 31. Ülés: Viselhető Eszköz Integráció
- Apple HealthKit (alvásminőség, HRV, lépések) react-native-health-en keresztül
- Google Health Connect Android egyenértékűhöz
- Eszközön történő aggregálás → csak napi pontszám küldése (adatvédelem)
- Mobil: Viselhető Eszköz Beállítások képernyő, automatikus pulzus alvás mező kitöltés
- **Eredmények**: HealthKit/Health Connect szolgáltatások, beállítások képernyő

## 4. Fázis: Haladó Funkciók (32-35. Ülés)

### 32. Ülés: Kiégés Előrejelzési Modell
- Logisztikus regresszió betanítása előzményi pulzus + felmérési adatokon
- Kiégési kockázat előrejelzése 14 nappal előre (valószínűségi pontszám)
- Vezetői proaktív értesítés, ha csapattag veszélyeztetett
- Admin: modell teljesítmény irányítópult (precizitás, visszahívás)
- **Eredmények**: ML pipeline, előrejelzési szolgáltatás, admin irányítópult

### 33. Ülés: Csapat Jólléti Kihívások
- Kihívás séma: időkorlátos (7-30 nap), csapat-alapú
- Típusok: lépések, meditációs percek, pulzus sorozat, folyadékbevitel
- Csapat ranglista (min 5 tag, anonimizált egyéni pontszámok)
- Mobil: Kihívások képernyő, CsapatRanglista
- **Eredmények**: 1 migráció, kihívás szolgáltatás, 2 mobil képernyő

### 34. Ülés: CBT Digitális Terápiák
- Strukturált CBT gyakorlatok a chatbotban (gondolat megkérdőjelezés, viselkedésaktiváció)
- 5-10 perces vezetett foglalkozások haladáskövetéssel
- Bizonyítékokon alapuló: PHQ-9/GAD-7 integráció klinikai szűréshez
- Mobil: CBT Gyakorlat képernyő, haladáskövető
- **Eredmények**: CBT tartalommotor, gyakorlat képernyők

### 35. Ülés: Intelligens Beavatkozás Párosítás
- Kollaboratív szűrés: beavatkozás ajánlás hasonló felhasználói eredmények alapján
- A/B tesztelési keretrendszer beavatkozás hatékonysághoz
- ROI kalkulátor tényleges eredményadatokkal
- **Eredmények**: Ajánlómotor, A/B keretrendszer

## 5. Fázis: Megfelelőség és Csiszolás (36-38. Ülés)

### 36. Ülés: EU AI Rendelet Megfelelőség
- Műszaki dokumentáció minden AI funkcióhoz
- Emberi felügyelet dokumentálása (eszkalációs útvonalak)
- Megfelelőségi önértékelés
- Átláthatósági nyilatkozatok (AI nyilvánosságra hozatal a chatbotban)
- **Eredmények**: DPIA dokumentum, AI rendelet megfelelőségi csomag

### 37. Ülés: WCAG Akadálymentesítés
- Admin felület + mobil alkalmazás akadálymentesítési audit
- Színkontraszt javítások (WCAG AA minimum)
- Képernyőolvasó támogatás (accessibilityLabel minden érintési elemen)
- Billentyűzet navigáció az admin felületen
- **Eredmények**: Akadálymentesítési jelentés, javítások alkalmazva

### 38. Ülés: Offline Mód + Teljesítmény
- Offline pulzus beküldés (AsyncStorage sor)
- Háttér szinkronizálás kapcsolat visszaállásakor
- Teljesítmény optimalizálás (React.memo, lusta betöltés)
- Csomagméret optimalizálás
- **Eredmények**: Offline sor szolgáltatás, teljesítmény javítások

## 6. Fázis: Skálázás és Nagyvállalati (39-40. Ülés)

### 39. Ülés: Több-Bérlős Rendszer + SSO
- Szervezeti elkülönítés javítások
- SAML/OIDC SSO integráció
- Szerepkör-alapú hozzáférés-szabályozás finomítások
- API ráta korlátozás bérlőnként
- **Eredmények**: SSO szolgáltatás, RBAC javítások

### 40. Ülés: Éles Indítás Előkészítés
- Végső biztonsági audit
- Terhelésteszt (1000+ egyidejű felhasználó)
- Monitorozás beállítás (Sentry, állapot-ellenőrzések)
- Telepítési pipeline (CI/CD)
- Indítási dokumentáció + oktatási anyagok
- **Eredmények**: Éles telepítés, monitorozás, dokumentáció

---

## Összefoglaló Ütemterv

| Fázis | Ülések | Időtartam | Fókusz |
|---|---|---|---|
| AI és Elköteleződés | 23-25 | ~6 óra | Gamifikáció, Slack, NLP |
| Tartalom és Megfelelőség | 26-28 | ~6 óra | WHO-5, tartalom, i18n |
| Integrációk | 29-31 | ~6 óra | Naptár, Teams, viselhető eszközök |
| Haladó | 32-35 | ~8 óra | ML, kihívások, CBT, párosítás |
| Megfelelőség | 36-38 | ~6 óra | AI rendelet, WCAG, offline |
| Nagyvállalati | 39-40 | ~4 óra | SSO, éles indítás |
