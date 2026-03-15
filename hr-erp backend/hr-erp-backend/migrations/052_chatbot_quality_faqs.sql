-- Migration 052: Replace FAQs with high-quality curated dataset
-- Backup already created as chatbot_knowledge_base_backup

-- Clear existing entries (messages reference via ON DELETE SET NULL)
UPDATE chatbot_messages SET faq_id = NULL WHERE faq_id IS NOT NULL;
DELETE FROM chatbot_knowledge_base;

-- Get contractor and category IDs
DO $$
DECLARE
  v_contractor_id UUID;
  cat_szabadsag UUID;
  cat_fizetes UUID;
  cat_lakas UUID;
  cat_egeszseg UUID;
  cat_munka UUID;
  cat_szabalyok UUID;
  cat_onboarding UUID;
  cat_technikai UUID;
BEGIN
  SELECT id INTO v_contractor_id FROM contractors LIMIT 1;
  SELECT id INTO cat_szabadsag FROM chatbot_faq_categories WHERE slug = 'szabadsag';
  SELECT id INTO cat_fizetes FROM chatbot_faq_categories WHERE slug = 'fizetes';
  SELECT id INTO cat_lakas FROM chatbot_faq_categories WHERE slug = 'lakas';
  SELECT id INTO cat_egeszseg FROM chatbot_faq_categories WHERE slug = 'egeszseg';
  SELECT id INTO cat_munka FROM chatbot_faq_categories WHERE slug = 'munka';
  SELECT id INTO cat_szabalyok FROM chatbot_faq_categories WHERE slug = 'szabalyok';
  SELECT id INTO cat_onboarding FROM chatbot_faq_categories WHERE slug = 'onboarding';
  SELECT id INTO cat_technikai FROM chatbot_faq_categories WHERE slug = 'technikai';

  -- ═══════════════════════════════════════════════════════════════
  -- SZABADSÁG (Leave)
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_szabadsag,
   'Hogyan kérhetek szabadságot?',
   'Szabadság igénylése lépésről lépésre:
1. Nyisd meg a mobilalkalmazást vagy a webes felületet
2. Menj a Naptár menüpontra
3. Válaszd ki a kívánt dátumokat
4. Válaszd a szabadság típusát (éves szabadság, pótszabadság, stb.)
5. Add meg az indoklást ha szükséges
6. Kattints a "Beküldés" gombra

A felettesed automatikusan értesítést kap és jóváhagyhatja a kérést. A jóváhagyás általában 1-2 munkanapon belül megtörténik.',
   ARRAY['szabadság', 'szabadsag', 'igénylés', 'igenyles', 'kérés', 'keres', 'leave', 'holiday', 'pihenés', 'pihenes', 'napok', 'éves', 'eves'],
   20),

  (v_contractor_id, cat_szabadsag,
   'Hány nap szabadságom van?',
   'A szabadságkereted a Naptár menüpontban tekintheted meg. Az éves szabadság a Munka Törvénykönyve szerint minimum 20 munkanap, amely az életkorod alapján növekszik. Pótszabadság jár gyermekek után és egyéb jogcímeken. A felhasznált és maradék napjaidat a profil oldalon is láthatod.',
   ARRAY['szabadság', 'nap', 'napok', 'keret', 'mennyi', 'hány', 'maradék', 'maradt'],
   15);

  -- ═══════════════════════════════════════════════════════════════
  -- FIZETÉS (Salary)
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_fizetes,
   'Mikor kapom a fizetést?',
   'A fizetés minden hónap 10-én érkezik a megadott bankszámlára. Ha a 10-e hétvégére vagy ünnepnapra esik, az azt megelőző utolsó munkanapon történik az utalás. A fizetési papírt (bérjegyzéket) a rendszerben a Pénzügy menüpont alatt találod.',
   ARRAY['fizetés', 'fizetes', 'bér', 'ber', 'utalás', 'utalas', 'pénz', 'penz', 'bankszámla', 'bankszamla', 'mikor', 'időpont', 'bérjegyzék', 'berjegyzek'],
   20),

  (v_contractor_id, cat_fizetes,
   'Hol találom a bérsáv beállításokat?',
   'A bérsáv beállítások az admin felületen érhetők el:
1. Jelentkezz be az admin panelbe (hr-erp-admin)
2. Menj a Pénzügy menüpontra a bal oldali sávban
3. Válaszd a "Bértranszparencia" almenüt
4. Itt beállíthatod a bérsávokat pozíciók szerint
5. Mentsd el a módosításokat

Megjegyzés: Ehhez admin vagy HR vezető jogosultság szükséges.',
   ARRAY['bérsáv', 'bersav', 'beállítás', 'beallitas', 'bér', 'ber', 'fizetés', 'fizetes', 'sáv', 'sav', 'transzparencia', 'admin'],
   18);

  -- ═══════════════════════════════════════════════════════════════
  -- LAKÁS / SZÁLLÁS (Accommodation)
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_lakas,
   'Kinek jelentsem a lakásproblémát?',
   'Lakásproblémát az alábbi módon jelenthetsz:
1. Nyisd meg a Hibajegyek menüpontot
2. Kattints az "Új hibajegy" gombra
3. Válaszd a "Szálláshely" kategóriát
4. Írd le részletesen a problémát (csepegő csap, elromlott fűtés, stb.)
5. Ha van, csatolj fényképet

A karbantartó csapat 24-48 órán belül foglalkozik a bejelentéssel. Sürgős esetben (vízszivárgás, áramkimaradás) hívd a 24 órás sürgősségi számot: +36 1 234 5678.',
   ARRAY['lakás', 'lakas', 'probléma', 'problema', 'hiba', 'javítás', 'javitas', 'karbantartás', 'karbantartas', 'szállás', 'szallas', 'jelentés', 'jelentes', 'csepeg', 'fűtés', 'futes'],
   20),

  (v_contractor_id, cat_lakas,
   'Mik a szálláshely szabályok?',
   'A szálláshely legfontosabb szabályai:
- Csend: 22:00 és 6:00 között kérjük a csendes pihenést
- Tisztaság: a közös helyiségeket használat után takarítsd el
- Vendégek: vendégeket előzetes bejelentés alapján fogadhatsz, max. 22:00-ig
- Dohányzás: csak a kijelölt helyen megengedett
- Parkolás: a kijelölt helyen, parkolási engedéllyel
- Hulladékgyűjtés: szelektíven, a kijelölt tárolókba

A részletes házirend a Dokumentumok menüpontban elérhető.',
   ARRAY['szállás', 'szallas', 'szabály', 'szabaly', 'szabályok', 'szabalyok', 'házirendszabalyzat', 'rend', 'lakás', 'lakas', 'csend', 'dohányzás', 'dohanyzas', 'vendég', 'vendeg'],
   15);

  -- ═══════════════════════════════════════════════════════════════
  -- EGÉSZSÉG (Health)
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_egeszseg,
   'Hol van a legközelebbi kórház?',
   'A legközelebbi kórház: Szent János Kórház és Észak-budai Egyesített Kórházak
Cím: 1125 Budapest, Diós árok 1-3.
Telefon: +36 1 458 4500
Sürgősségi osztály: 24 órában elérhető

Megközelítés:
- Busszal: 21-es busz, Kútvölgyi út megálló
- Autóval: kb. 15 perc a szállástól

Kisebb sérülésekre és betegségekre az üzemorvos is rendelkezésre áll munkanapokon 8:00-16:00 között.',
   ARRAY['kórház', 'korhaz', 'orvos', 'sürgősség', 'surgosseg', 'beteg', 'betegség', 'betegseg', 'sérülés', 'serules', 'egészség', 'egeszseg', 'rendelő', 'rendelo', 'mentő', 'mento'],
   18),

  (v_contractor_id, cat_egeszseg,
   'Hogyan kérhetek betegszabadságot?',
   'Betegszabadság igénylése:
1. Értesítsd a felettesed telefonon vagy e-mailben a betegség napján reggel
2. Menj orvoshoz és kérj táppénzes papírt
3. A táppénzes papírt (orvosi igazolás) add le a HR osztálynak
4. A rendszerben a felettesed rögzíti a távollétét

Jogosultság: Az első 15 betegszabadság napra a munkáltató fizeti a távolléti díj 70%-át. Ezt követően a TB finanszírozza (táppénz).',
   ARRAY['betegszabadság', 'betegszabadsag', 'beteg', 'táppénz', 'tapppenz', 'orvos', 'igazolás', 'igazolas', 'betegség', 'betegseg', 'távollét', 'tavollet'],
   15);

  -- ═══════════════════════════════════════════════════════════════
  -- MUNKA / PROJEKTEK (Work / Projects)
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_munka,
   'Hogyan hozok létre új projektet?',
   'Új projekt létrehozása az admin felületen:
1. Menj a Projektkezelés → Projektek menüpontra
2. Kattints az "Új projekt" gombra (jobb felső sarok)
3. Töltsd ki a kötelező mezőket:
   - Projekt neve
   - Projekt kód (egyedi azonosító)
   - Kezdő és záró dátum
   - Felelős személy
4. Opcionálisan add hozzá a leírást és a költségvetést
5. Kattints a "Mentés" gombra

A projekt automatikusan megjelenik a csapattagok Feladataim oldalán.',
   ARRAY['projekt', 'létrehozás', 'letrehozas', 'új', 'uj', 'create', 'projektek', 'projektkezelés', 'projektkezeles'],
   20),

  (v_contractor_id, cat_munka,
   'Hogyan exportálom a számlákat?',
   'Számla exportálás lépései:
1. Menj a Pénzügy → Számlák menüpontra
2. Szűrd le a kívánt időszakra és státuszra
3. Jelöld ki az exportálandó számlákat (vagy válaszd az "Összes kijelölése" opciót)
4. Kattints az "Exportálás" gombra a felső sávban
5. Válaszd a formátumot: Excel (XLSX) vagy PDF
6. A fájl automatikusan letöltődik

Tipp: A Számlariportok oldalon összesítő riportokat is készíthetsz.',
   ARRAY['számla', 'szamla', 'export', 'exportálás', 'exportalas', 'letöltés', 'letoltes', 'invoice', 'pénzügy', 'penzugy', 'riport'],
   18),

  (v_contractor_id, cat_munka,
   'Hol van a költségközpont kezelő?',
   'A költségközpont kezelő az admin felületen érhető el:
1. Menj a Pénzügy menüpontra a bal oldali navigációban
2. Válaszd a "Költségközpontok" almenüt
3. Itt láthatsz minden aktív költségközpontot

Funkciók:
- Új költségközpont létrehozása
- Meglévő szerkesztése (név, kód, felelős)
- Költségközpont inaktiválása
- Számlák hozzárendelése költségközpontokhoz

Megjegyzés: Admin jogosultság szükséges a szerkesztéshez.',
   ARRAY['költségközpont', 'koltsegkozpont', 'költség', 'koltseg', 'központ', 'kozpont', 'cost center', 'pénzügy', 'penzugy'],
   18);

  -- ═══════════════════════════════════════════════════════════════
  -- SZABÁLYOK (Rules)
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_szabalyok,
   'Mik a közösségi szabályok?',
   'A legfontosabb közösségi szabályok:
1. Tisztelet: tiszteld a többi lakó nyugalmát és magánéletét
2. Csend: 22:00-06:00 között csendes pihenő idő
3. Közös terek: használat után hagyd rendben (konyha, mosókonyha, nappali)
4. Hulladék: szelektív gyűjtés a kijelölt helyen
5. Dohányzás: kizárólag a kijelölt területeken
6. Alkohol: a közös terekben tilos a szeszesital fogyasztása
7. Vendégek: bejelentés szükséges, max. 22:00-ig tartózkodhatnak
8. Parkolás: csak a kijelölt helyen, regisztrált járművel

Szabálysértés esetén figyelmeztető rendszer lép életbe.',
   ARRAY['közösségi', 'kozossegi', 'szabály', 'szabaly', 'szabályok', 'szabalyok', 'rend', 'magatartás', 'magatartas', 'viselkedés', 'viselkedes'],
   15);

  -- ═══════════════════════════════════════════════════════════════
  -- ONBOARDING
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_onboarding,
   'Mi a teendőm az első munkanapon?',
   'Első munkanapi teendők:
1. Jelenj meg 8:00-ra a recepción a személyi igazolványoddal
2. A HR munkatárs átadja a belépőkártyát és a szálláshely kulcsát
3. Aláírod a munkaszerződést és a házirendet
4. Rövid körbejárás az épületben (konyha, mosókonyha, közös terek)
5. Telepítsd a mobilalkalmazást (HR-ERP App)
6. A felettesed bemutatja a csapatot és az első feladatokat

Szükséges dokumentumok: személyi igazolvány, TAJ kártya, bankszámlaszám, adóazonosító.',
   ARRAY['első', 'elso', 'munkanap', 'kezdés', 'kezdes', 'onboarding', 'belépés', 'belepes', 'kezdő', 'kezdo', 'új munkatárs', 'uj munkatars'],
   15),

  (v_contractor_id, cat_onboarding,
   'Hogyan telepítem a mobilalkalmazást?',
   'A HR-ERP mobilalkalmazás telepítése:

iPhone (iOS):
1. Nyisd meg az App Store-t
2. Keresd: "HR-ERP"
3. Telepítsd és nyisd meg
4. Jelentkezz be a kapott e-mail címmel és jelszóval

Android:
1. Nyisd meg a Google Play-t
2. Keresd: "HR-ERP"
3. Telepítsd és nyisd meg
4. Jelentkezz be a kapott e-mail címmel és jelszóval

Ha nem kaptál bejelentkezési adatokat, keresd a HR osztályt.',
   ARRAY['mobilalkalmazás', 'mobilalkalmazas', 'alkalmazás', 'alkalmazas', 'telepítés', 'telepites', 'app', 'letöltés', 'letoltes', 'telefon', 'mobil', 'install'],
   15);

  -- ═══════════════════════════════════════════════════════════════
  -- TECHNIKAI (Technical / Admin)
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_technikai,
   'Hogyan állítok be új felhasználót?',
   'Új felhasználó beállítása (admin jogosultsággal):
1. Menj az Adminisztráció → Felhasználók menüpontra
2. Kattints az "Új felhasználó" gombra
3. Töltsd ki: név, e-mail, szerepkör (admin/task_owner/employee)
4. Válaszd ki a kivitelezőt (contractor)
5. Kattints a Mentés gombra
6. A felhasználó automatikusan kap egy meghívó e-mailt jelszó beállításhoz

Jogosultságok finomhangolása: Felhasználók → Jogosultságok menüpont.',
   ARRAY['felhasználó', 'felhasznalo', 'regisztráció', 'regisztracio', 'fiók', 'fiok', 'admin', 'beállítás', 'beallitas', 'user', 'account', 'hozzáadás', 'hozzaadas'],
   15),

  (v_contractor_id, cat_technikai,
   'Hogyan hozok létre hibajegyet?',
   'Hibajegy létrehozása:
1. Kattints a Hibajegyek menüpontra a felső sávban
2. Nyomd meg az "Új hibajegy" gombot
3. Töltsd ki:
   - Cím: rövid összefoglaló
   - Kategória: válaszd ki (Szálláshely, IT, Általános stb.)
   - Prioritás: alacsony / normál / magas / kritikus
   - Leírás: részletes probléma leírás
4. Ha van, csatolj képet vagy dokumentumot
5. Kattints a "Beküldés" gombra

A hibajegy automatikusan kiosztásra kerül a megfelelő kezelőnek.',
   ARRAY['hibajegy', 'ticket', 'bejelentés', 'bejelentes', 'probléma', 'problema', 'hiba', 'létrehozás', 'letrehozas', 'panasz'],
   15);

  -- ═══════════════════════════════════════════════════════════════
  -- FIZETÉS extra
  -- ═══════════════════════════════════════════════════════════════

  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, cat_fizetes,
   'Hogyan nézhetem meg a fizetési papíromat?',
   'A bérjegyzék (fizetési papír) megtekintése:
1. Jelentkezz be a webes felületre vagy a mobilalkalmazásba
2. Menj a Profilom / Pénzügy menüpontra
3. Válaszd a "Bérjegyzékek" fület
4. Az aktuális havi és korábbi bérjegyzékek PDF-ben letölthetők

Ha nem látod a bérjegyzékedet, keresd a HR osztályt.',
   ARRAY['bérjegyzék', 'berjegyzek', 'fizetési papír', 'fizetesi papir', 'fizetés', 'fizetes', 'bér', 'ber', 'kimutatás', 'kimutatas', 'payslip'],
   12);

END $$;
