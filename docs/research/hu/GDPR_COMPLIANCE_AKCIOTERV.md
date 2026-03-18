# GDPR Megfelelőségi Akcióterv
## HR-ERP Jólléti Platform — Housing Solutions Kft.

**Verzió:** 1.0 | **Dátum:** 2026-03-18 | **Besorolás:** Bizalmas

---

# I. VEZETŐI ÖSSZEFOGLALÓ

## Jelenlegi Állapot: ~70% Kész

Az HR-ERP Jólléti Platform GDPR megfelelősége jó alapokon áll, de **3 kritikus hiányosság** azonosítható, amelyek **éles indítás előtt kötelezően pótlandók**.

| Mutató | Érték |
|---|---|
| **Megfelelőségi szint** | ~70% |
| **Kritikus hiányosságok** | 3 darab (DPIA, Consent UI, DPA szerződések) |
| **Implementációs idő** | 2-4 hét |
| **Becsült költség** | 0-5.000 EUR (DIY vs. jogász) |
| **Éles indítás feltétele** | Tier 1 feladatok 100%-os befejezése |

### Kritikus Hiányosságok

| # | Hiányosság | GDPR Cikk | Kockázat | Prioritás |
|---|---|---|---|---|
| 1 | **Adatvédelmi Hatásvizsgálat (DPIA) hiányzik** | 35. cikk | Bírság: max 20M EUR / 4% árbevétel | KRITIKUS |
| 2 | **Hozzájáruláskezelő felület nincs** | 9. cikk (2)(a) | Adatfeldolgozás jogalap nélkül | KRITIKUS |
| 3 | **Adatfeldolgozói szerződések (DPA) hiányosak** | 28. cikk | Vendor-kockázat, felelősség | MAGAS |

### Ajánlás

A Tier 1 feladatok elvégzése **kötelező az éles indítás előtt**. Javasolt megközelítés: DIY implementáció (0 EUR) + jogász review (2-3.000 EUR) = optimális költség-kockázat arány.

---

# II. MEGLÉVŐ COMPLIANCE ELEMEK — Amit Jól Csináltál

## 2.1 Aggregációs Szabály (Minimum 5 Fő)

**Megvalósítás**: Minden csapat-szintű lekérdezés tartalmazza a `HAVING COUNT(DISTINCT user_id) >= 5` feltételt.

```sql
-- Példa: v_housing_wellbeing_correlation nézet
SELECT
  contractor_id,
  cleanliness_category,
  ROUND(AVG(mood_score)::numeric, 2) AS avg_mood,
  COUNT(DISTINCT user_id) AS employee_count
FROM housing_cleanliness_inspections ci
JOIN wellmind_pulse_surveys ps ON ci.user_id = ps.user_id
GROUP BY contractor_id, cleanliness_category
HAVING COUNT(DISTINCT ci.user_id) >= 5;  -- ← GDPR privacy szabály
```

**Állapot**: ✅ Kész — minden SQL nézetben és API válaszban érvényesítve.

## 2.2 Row-Level Security (RLS) Szabályzatok

**Megvalósítás**: PostgreSQL RLS policies biztosítják, hogy a munkavállalók csak saját adataikat láthatják.

```sql
-- Példa: Munkavállaló csak saját pulzus adatait láthatja
CREATE POLICY pulse_employee_view ON wellmind_pulse_surveys
  FOR SELECT USING (user_id = current_setting('app.user_id')::uuid);
```

**Állapot**: ✅ Kész — wellmind és carepath táblákon.

## 2.3 Változtathatatlan Audit Napló

**Megvalósítás**: `wellbeing_audit_log` tábla — INSERT only, UPDATE/DELETE blokkolva trigger-rel.

| Mező | Leírás |
|---|---|
| `user_id` | Ki hajtotta végre a műveletet |
| `action_type` | SELECT / INSERT / UPDATE / DELETE |
| `resource_type` | pulse_survey / assessment / carepath_case |
| `resource_id` | Érintett rekord azonosító |
| `access_reason` | Hozzáférés indoklása (kötelező mező) |
| `ip_address` | Kliens IP címe |
| `timestamp` | UTC időbélyeg |

**Állapot**: ✅ Kész — minden wellbeing adat-hozzáférés naplózva.

## 2.4 Titkosítás (pgcrypto)

- **Szállítási réteg**: HTTPS/TLS 1.3 only
- **Adatbázis szint**: CarePath session jegyzetei PGP szimmetrikus titkosítással (`CAREPATH_ENCRYPTION_KEY`)
- **Token-ök**: JWT token expiry 15 perc, refresh token 7 nap

**Állapot**: ✅ Kész.

## 2.5 Anonimitás Opció

- CarePath ügyek `is_anonymous` flag-gel hozhatók létre
- Anonim ügyek esetén a szolgáltató nem látja a munkavállaló adatait

**Állapot**: ✅ Kész.

## 2.6 Adatminimalizálás

- Pulzus felmérés: csak 4 kötelező mező (hangulat, stressz, alvás, munkaterhelés)
- Nincs biometrikus adat, kamera, mikrofon, GPS tracking
- Nincs érzelemfelismerés (EU AI Act 5(1)(f) tiltja)

**Állapot**: ✅ Kész.

## 2.7 Összehasonlítás Versenytársakkal

| Compliance Elem | Platformunk | Headspace | Calm | Virgin Pulse | Modern Health | Lyra | Spring Health |
|---|---|---|---|---|---|---|---|
| Min. 5 fő aggregáció | ✅ | ✅ | N/A | ✅ | ✅ | ✅ | ✅ |
| RLS policies | ✅ | ? | ? | ✅ | ✅ | ✅ | ✅ |
| Immutable audit log | ✅ | ? | ? | ✅ | ✅ | ✅ | ✅ |
| Session notes titkosítás | ✅ (PGP) | N/A | N/A | ? | ✅ | ✅ | ✅ |
| Anonimitás opció | ✅ | N/A | N/A | Nem | ✅ | ✅ | ✅ |
| DPIA dokumentálva | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Explicit consent UI | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DPA szerződések | ❌ Részben | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Következtetés**: A technikai alapok erősek, de az adminisztratív-jogi dokumentáció hiányzik.

---

# III. TIER 1: KÖTELEZŐ FELADATOK — Éles Indítás Előtt

---

## A. Adatvédelmi Hatásvizsgálat (DPIA)

### Mi ez?

A GDPR 35. cikk alapján kötelező dokumentum, amely felméri az adatfeldolgozási tevékenységek kockázatait és az azok csökkentésére szolgáló intézkedéseket.

### Mikor kötelező?

Három kritérium közül **legalább kettő** teljesülése esetén:

| # | Kritérium | HR-ERP Platform | Teljesül? |
|---|---|---|---|
| 1 | Szisztematikus, átfogó értékelés természetes személyek személyes jellemzőiről | Napi pulzus felmérések, negyedéves kiégés/elkötelezettség felmérések | ✅ IGEN |
| 2 | Nagy volumenű 9. cikk szerinti különleges adatkategóriák feldolgozása | Egészségügyi adatok (hangulat, stressz, alvás, kiégési pontszám) | ✅ IGEN |
| 3 | Szisztematikus, nagyszabású nyilvános területek megfigyelése | Nem alkalmazandó (nem nyilvános terület) | ❌ NEM |

**Eredmény: 2/3 kritérium teljesül → DPIA KÖTELEZŐ.**

### Kockázatértékelési Mátrix

| # | Kockázat | Leírás | Valószínűség | Hatás | Mitigáció | Állapot |
|---|---|---|---|---|---|---|
| 1 | **Adatszivárgás** | Adatbázis illetéktelen hozzáférés | Közepes | Magas | Encryption (pgcrypto), HTTPS only, RLS, audit log | ✅ Kész |
| 2 | **Hozzáférés-szabályozási hiba** | Munkavállaló más dolgozó adatait látja | Alacsony | Magas | RLS minden táblán, JWT auth, role-based permissions | ✅ Kész |
| 3 | **Aggregációból visszafejtés** | Egyén azonosítható kis csapat statisztikákból | Alacsony | Közepes | Min 5 fő szabály kódban érvényesítve, automatizált tesztek | ✅ Kész |
| 4 | **Vendor adatszivárgás** | Harmadik feles API kompromittálódik | Közepes | Közepes | DPA szerződések, API kulcsok env változókban, rate limiting | ⚠️ DPA-k hiányoznak |
| 5 | **AI előítélet** | NLP hangulatelemzés torzítása, diszkrimináció | Közepes | Közepes | Emberi felügyelet, negyedéves fairness audit | 📋 Tervezett |
| 6 | **Hozzájárulás hiánya** | Implicit consent nem elégséges GDPR 9. cikk | Magas | Magas | Explicit consent UI adattípusonként | ⚠️ Folyamatban |
| 7 | **Túlzott adatmegőrzés** | Személyes adat törvényi időn túl megőrizve | Alacsony | Alacsony | Automatikus törlés cron, 1 év grace period | 📋 Tervezett |

### Ráfordítás és Költség

| Megközelítés | Idő | Költség | Ajánlás |
|---|---|---|---|
| **DIY** (saját kitöltés) | 1-2 hét | 0 EUR | ✅ Ajánlott első lépésként |
| **Jogász** | 3-5 nap | 2.000-5.000 EUR | Review után |

### DPIA Checklist

- [ ] NAIH DPIA sablon letöltése (naih.hu)
- [ ] Adatfeldolgozási műveletek leírása
- [ ] Szükségesség és arányosság értékelés
- [ ] Kockázatértékelés kitöltése (fenti mátrix alapján)
- [ ] Technikai, szervezési, jogi intézkedések dokumentálása
- [ ] DPO / adatvédelmi konzulens review
- [ ] Jóváhagyás és aláírás
- [ ] Tárolás: `/docs/compliance/dpia/`

---

## B. Hozzájáruláskezelő Felület (Consent Management UI)

### Mi ez?

A GDPR 9. cikk (2)(a) bekezdés szerinti **kifejezett hozzájárulás** biztosítása minden egészségügyi adat feldolgozásához.

### Jelenlegi Helyzet

- ❌ Implicit consent a bejelentkezésnél — **NEM ELÉGSÉGES** egészségügyi adatokhoz
- A GDPR 9. cikk speciális kategóriás adatokhoz kifejezett, tájékoztatáson alapuló, önkéntes hozzájárulást követel

### Megoldás: Részletes Opt-in Adattípusonként

#### Backend: Új Tábla

```sql
CREATE TABLE user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(50) NOT NULL,
  consented BOOLEAN NOT NULL DEFAULT FALSE,
  consent_date TIMESTAMP WITH TIME ZONE,
  consent_version VARCHAR(20) NOT NULL DEFAULT '1.0',
  withdraw_date TIMESTAMP WITH TIME ZONE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, consent_type)
);

CREATE INDEX idx_user_consents_user ON user_consents(user_id);
CREATE INDEX idx_user_consents_type ON user_consents(consent_type, consented);
```

#### Consent Típusok

| Típus | Leírás | Kötelező? | Visszavonható? |
|---|---|---|---|
| `pulse_surveys` | Napi pulzus felmérés adatok gyűjtése (hangulat, stressz, alvás, munkaterhelés) | Igen (funkció használatához) | Igen, bármikor |
| `assessments` | Negyedéves kiégés/elkötelezettség felmérések | Igen (funkció használatához) | Igen, bármikor |
| `carepath` | CarePath EAP szolgáltatások, ügykezelés, szolgáltató foglalás | Igen (funkció használatához) | Igen, bármikor |
| `analytics` | Aggregált, anonimizált elemzések csapat/szervezeti szinten | Opcionális | Igen, bármikor |
| `research` | Anonimizált adatok tudományos kutatási célra | Opcionális | Igen, bármikor |

#### API Végpontok

| Metódus | Útvonal | Leírás |
|---|---|---|
| `POST` | `/api/v1/user/consents` | Hozzájárulás rögzítése |
| `GET` | `/api/v1/user/consents` | Saját hozzájárulások lekérdezése |
| `DELETE` | `/api/v1/user/consents/:type` | Hozzájárulás visszavonása |

#### Mobil Alkalmazás: Onboarding Flow

**1. lépés — Üdvözlés**
> „Üdvözöljük a HR-ERP Jólléti Platformon! A szolgáltatás használatához kérjük, olvassa el adatkezelési tájékoztatónkat és adja meg hozzájárulását."
> [Adatkezelési Tájékoztató megtekintése →]

**2. lépés — Hozzájárulási Nyilatkozatok**

| | Hozzájárulás | Leírás |
|---|---|---|
| ☑️ | **Napi pulzus felmérés** | Hozzájárulok a napi hangulat, stressz, alvásminőség és munkaterhelés adataim gyűjtéséhez és feldolgozásához jólléti célból. |
| ☑️ | **Negyedéves felmérés** | Hozzájárulok a kiégés és elkötelezettség felméréseim feldolgozásához. |
| ☑️ | **CarePath szolgáltatások** | Hozzájárulok az EAP ügyeim és szolgáltató foglalásaim kezeléséhez. |
| ☐ | **Aggregált elemzések** *(opcionális)* | Hozzájárulok, hogy anonimizált adataim felhasználásra kerüljenek csapat-szintű statisztikákhoz (min. 5 fős csoportokban). |
| ☐ | **Tudományos kutatás** *(opcionális)* | Hozzájárulok, hogy anonimizált adataim felhasználásra kerüljenek munkahelyi jólléti kutatásokhoz. |

**3. lépés — Jóváhagyás**
> [Elfogadom] — Timestamp + IP cím rögzítése
> A hozzájárulását bármikor módosíthatja: Beállítások → Adatvédelem.

#### Elfogadási Kritériumok

- [ ] Felhasználó képes opt-in és opt-out minden adattípusra külön-külön
- [ ] Hozzájárulás bármikor visszavonható negatív következmény nélkül
- [ ] Visszavonáskor az érintett adatfeldolgozás leáll
- [ ] Minden consent változás naplózva (audit trail)
- [ ] Consent verzió követve (tájékoztató változásakor újbóli hozzájárulás)

#### Ráfordítás

| Feladat | Idő |
|---|---|
| Backend (migráció + API) | 3 nap |
| Mobile UI (onboarding + beállítások) | 2 nap |
| Admin UI (consent management oldal) | 2 nap |
| **Összesen** | **~1 hét** |

#### Checklist

- [ ] Migráció futtatása (`user_consents` tábla)
- [ ] API végpontok implementálása
- [ ] Mobil onboarding flow fejlesztés
- [ ] Mobil beállítások → Adatvédelem → Hozzájárulás kezelése
- [ ] Admin UI: felhasználók consent állapotának megtekintése
- [ ] Tesztelés minden consent típussal (opt-in, opt-out, withdraw)
- [ ] Adatkezelési tájékoztató frissítése

---

## C. Adatfeldolgozói Szerződések (DPA)

### Mi ez?

A GDPR 28. cikk alapján kötelező szerződés minden harmadik féllel, aki személyes adatot dolgoz fel az adatkezelő nevében.

### Szükséges DPA Szerződések

| # | Vendor | Szolgáltatás | Adattípus | DPA Állapot |
|---|---|---|---|---|
| 1 | **AWS / GCP / Azure** | Cloud hosting, adatbázis | Minden személyes adat | ⚠️ Szükséges |
| 2 | **Anthropic (Claude API)** | NLP hangulatelemzés | Pulzus megjegyzések szövege | ⚠️ Szükséges |
| 3 | **SendGrid / Mailgun** | Email küldés | Email cím, értesítések | ⚠️ Szükséges |

### DPA Email Sablon (Angol)

```
Subject: Request for GDPR Data Processing Agreement

Dear [Vendor Name] Compliance Team,

We are implementing [Vendor Service] as part of our HR wellbeing
platform operating under GDPR jurisdiction (Hungary, EU).

As per GDPR Article 28, we kindly request:
1. Your standard Data Processing Agreement (DPA)
2. List of sub-processors
3. Data center locations (EU/EEA preferred)
4. Technical and organizational security measures

Our platform processes employee health-related data (GDPR Article 9
special categories) including wellbeing assessments and mood surveys.

Please send the DPA to: [email]

Best regards,
[Your Name], [Company Name]
```

### DPA Email Sablon (Magyar)

```
Tárgy: Adatfeldolgozói szerződés kérése — GDPR 28. cikk

Tisztelt [Vendor Neve] Compliance Csapat!

A [Vendor Szolgáltatás] szolgáltatásukat használjuk HR jólléti
platformunk részeként, amely a GDPR hatálya alá tartozik
(Magyarország, EU).

A GDPR 28. cikke alapján kérjük:
1. Standard adatfeldolgozói szerződésük (DPA) megküldését
2. Al-feldolgozók listáját
3. Adatközpontok helyét (EU/EGT preferált)
4. Technikai és szervezési biztonsági intézkedéseik leírását

Platformunk munkavállalói egészségügyi adatokat kezel
(GDPR 9. cikk különleges kategóriák), beleértve jólléti
felméréseket és hangulat felméréseket.

Kérjük a DPA-t az alábbi címre: [email]

Üdvözlettel,
[Név], [Cégnév]
```

### Ráfordítás: 1 nap

### Checklist

- [ ] Vendor lista összeállítása (fenti táblázat)
- [ ] DPA kérés email küldése minden vendor-nak
- [ ] AWS/GCP DPA megszerzése (online elérhető standard DPA)
- [ ] Anthropic DPA megszerzése
- [ ] Email provider DPA megszerzése
- [ ] Aláírt DPA-k tárolása: `/docs/compliance/dpa/`
- [ ] DPA-k érvényességének éves felülvizsgálata naplózva

---

# IV. TIER 2: JAVASOLT FELADATOK — Éles Indítás Után 3 Hónapon Belül

---

## D. Adathordozhatóság — „Adataim Letöltése"

**GDPR 20. cikk**: Az érintett jogosult a rá vonatkozó személyes adatokat géppel olvasható formátumban megkapni.

### Implementáció

| Elem | Részletek |
|---|---|
| **API végpont** | `GET /api/v1/user/export-data` |
| **Formátum** | JSON (ZIP fájlban) |
| **Tartalom** | user_profile, pulse_surveys, assessments, carepath_cases, interventions, coaching_sessions |
| **Mobil UI** | Beállítások → Adatvédelem → „Adataim letöltése" gomb |
| **Ráfordítás** | 3-5 nap |

### Checklist

- [ ] Backend export endpoint implementálása
- [ ] JSON export formátum definiálása
- [ ] Mobile UI gomb hozzáadása
- [ ] Tesztelés nagy adatmennyiséggel
- [ ] Rate limiting (max 1 export/nap)

---

## E. Törléshez Való Jog — „Elfelejtetés"

**GDPR 17. cikk**: Az érintett jogosult kérni személyes adatai törlését.

### Implementáció

| Lépés | Részletek |
|---|---|
| **Soft delete** | Email anonimizálás, név cseréje „Törölt felhasználó"-ra, `deleted_at` timestamp |
| **Grace period** | 30 nap (visszaállítási lehetőség) |
| **Hard delete** | 30 nap után cron job véglegesen töröl |
| **Mobil UI** | Beállítások → Fiók → „Fiókom törlése" (megerősítő modal) |
| **Ráfordítás** | 2-3 nap |

---

## F. Adatkezelési Tájékoztató és Felhasználási Feltételek

### Szükséges Dokumentumok

| Dokumentum | Nyelv | Forrás |
|---|---|---|
| Adatkezelési tájékoztató | Magyar + Angol | NAIH sablon / TermsFeed generátor |
| Felhasználási feltételek | Magyar + Angol | Jogász / TermsFeed |
| Cookie policy | Magyar + Angol | Ha van web analytics |

### Ráfordítás

| Megközelítés | Idő | Költség |
|---|---|---|
| DIY (generátor) | 2-5 nap | 0 EUR |
| Jogász | 1-2 hét | 5.000-10.000 EUR |

---

# V. ÜTEMTERV ÉS KÖLTSÉG

## 4 Hetes Implementációs Terv

```
Hét 1  ████████████████████
       DPIA dokumentáció (Nap 1-2)
       Consent backend tábla + API (Nap 3-5)

Hét 2  ████████████████████
       Consent Mobile UI (Nap 1-3)
       DPA email-ek küldése + Admin UI (Nap 4-5)

Hét 3  ████████████████████
       Data export endpoint (Nap 1-3)
       Delete account flow (Nap 4-5)

Hét 4  ████████████████████
       Privacy Policy szövegezés (Nap 1-2)
       Tesztelés + dokumentáció (Nap 3-5)
```

## Költség Összesítés

| Feladat | DIY Idő | Jogász Költség | Ajánlás |
|---|---|---|---|
| **DPIA** | 1-2 hét | 2.000-5.000 EUR | DIY, majd jogász review |
| **Consent UI** | 1 hét | N/A (fejlesztés) | DIY |
| **DPA szerződések** | 1 nap | 1.000-2.000 EUR | DIY (vendor standard DPA) |
| **Data export** | 3-5 nap | N/A | DIY |
| **Privacy Policy** | 2-5 nap | 5.000-10.000 EUR | DIY generátorral, majd review |
| **ÖSSZESEN** | **3-4 hét** | **8.000-17.000 EUR** | **DIY + jogász review: 2.000-3.000 EUR** |

---

# VI. SABLON DOKUMENTUMOK

## Consent Szövegek (Jóváhagyott Megfogalmazás)

### Pulzus Felmérés
> „Hozzájárulok, hogy a platformon megadott napi hangulat-, stressz-, alvásminőség- és munkaterhelés-adataimat a munkáltató a jóllétem monitorozása és támogatása céljából feldolgozza. Tudomásul veszem, hogy adataim kizárólag aggregált, anonimizált formában (minimum 5 fős csoportokban) kerülnek felhasználásra csapat-szintű elemzésekhez. Hozzájárulásomat bármikor, hátrányos következmény nélkül visszavonhatom."

### Negyedéves Felmérés
> „Hozzájárulok a MBI (Maslach Burnout Inventory) és UWES (Utrecht Work Engagement Scale) kiégés- és elkötelezettség-felmérés eredményeim feldolgozásához jólléti támogatás céljából."

### CarePath (EAP) Szolgáltatások
> „Hozzájárulok, hogy a CarePath Employee Assistance Program keretében megadott adataimat (ügy leírása, sürgősségi szint, szolgáltató foglalások) a program szolgáltatásainak nyújtásához feldolgozzák."

---

# VII. JOGI HIVATKOZÁSOK

## GDPR Releváns Cikkek

| Cikk | Tárgy | Relevanciánk |
|---|---|---|
| **5. cikk** | Adatvédelmi elvek | Jogszerűség, célhoz kötöttség, adattakarékosság |
| **9. cikk** | Különleges adatkategóriák | Egészségügyi adat (hangulat, stressz, kiégés) |
| **13-14. cikk** | Tájékoztatási kötelezettség | Privacy Policy |
| **15-22. cikk** | Érintetti jogok | Hozzáférés, törlés, hordozhatóság |
| **25. cikk** | Beépített adatvédelem | Privacy by design (RLS, aggregáció) |
| **28. cikk** | Adatfeldolgozó | DPA szerződések |
| **32. cikk** | Adatbiztonsági intézkedések | Titkosítás, audit log |
| **35. cikk** | Hatásvizsgálat (DPIA) | Kötelező — egészségügyi adat |

## Magyar Jogszabályok

| Jogszabály | Tárgy | Relevanciánk |
|---|---|---|
| **Mt. 166. §** | Munkáltató köteles biztosítani az egészséges és biztonságos munkakörülményeket | Platform jogalapja |
| **Info tv.** | Információs önrendelkezési jogról szóló törvény | Nemzeti adatvédelmi szabályozás |
| **NAIH** | Nemzeti Adatvédelmi és Információszabadság Hatóság | Felügyeleti szerv, DPIA sablon |

## Nemzetközi Szabványok

| Szabvány | Tárgy |
|---|---|
| **ISO 45003:2021** | Pszichológiai egészség és biztonság a munkahelyen |
| **EU AI Act (2024/1689)** | Magas kockázatú HR AI rendszerek szabályozása |
| **WHO-5 Well-Being Index** | Validált jólléti szűrőeszköz |

---

*Dokumentum vége — HR-ERP Jólléti Platform GDPR Megfelelőségi Akcióterv v1.0*
*Housing Solutions Kft. — 2026*
