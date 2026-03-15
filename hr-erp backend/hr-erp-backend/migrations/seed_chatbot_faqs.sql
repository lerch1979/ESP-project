-- ============================================================================
-- Seed: Chatbot FAQ Data (100+ entries in Hungarian)
-- Categories: szabadsag, fizetes, lakas, onboarding, szabalyok, kozosseg
-- ============================================================================

-- Get or create contractor ID (use first contractor)
DO $$
DECLARE
  v_contractor_id UUID;
  v_cat_szabadsag UUID;
  v_cat_fizetes UUID;
  v_cat_lakas UUID;
  v_cat_onboarding UUID;
  v_cat_szabalyok UUID;
  v_cat_kozosseg UUID;
  v_cat_munka UUID;
  v_cat_egeszseg UUID;
BEGIN
  -- Get first contractor
  SELECT id INTO v_contractor_id FROM contractors LIMIT 1;
  IF v_contractor_id IS NULL THEN
    RAISE NOTICE 'No contractor found, skipping chatbot seed';
    RETURN;
  END IF;

  -- ========== FAQ Categories ==========
  INSERT INTO chatbot_faq_categories (id, contractor_id, name, slug, description, icon, color, sort_order)
  VALUES
    (gen_random_uuid(), v_contractor_id, 'Szabadság & Távollét', 'szabadsag', 'Szabadság igénylés, betegszabadság, távollét', 'calendar', '#10b981', 1),
    (gen_random_uuid(), v_contractor_id, 'Fizetés & Juttatások', 'fizetes', 'Bérszámfejtés, juttatások, adózás', 'wallet', '#f59e0b', 2),
    (gen_random_uuid(), v_contractor_id, 'Szálláshely', 'lakas', 'Szállás, lakhatás, bejelentkezés', 'home', '#3b82f6', 3),
    (gen_random_uuid(), v_contractor_id, 'Beilleszkedés', 'onboarding', 'Kezdés, orientáció, dokumentumok', 'rocket', '#8b5cf6', 4),
    (gen_random_uuid(), v_contractor_id, 'Szabályok & Irányelvek', 'szabalyok', 'Házirendek, munkavédelmi előírások', 'shield', '#ef4444', 5),
    (gen_random_uuid(), v_contractor_id, 'Közösség & Események', 'kozosseg', 'Programok, közösségi élet', 'users', '#ec4899', 6),
    (gen_random_uuid(), v_contractor_id, 'Munkavégzés', 'munka', 'Munkaidő, túlóra, beosztás', 'briefcase', '#6366f1', 7),
    (gen_random_uuid(), v_contractor_id, 'Egészség & Biztonság', 'egeszseg', 'Orvosi vizsgálatok, munkabiztonság', 'heart', '#14b8a6', 8)
  ON CONFLICT DO NOTHING;

  -- Get category IDs
  SELECT id INTO v_cat_szabadsag FROM chatbot_faq_categories WHERE slug = 'szabadsag' AND contractor_id = v_contractor_id LIMIT 1;
  SELECT id INTO v_cat_fizetes FROM chatbot_faq_categories WHERE slug = 'fizetes' AND contractor_id = v_contractor_id LIMIT 1;
  SELECT id INTO v_cat_lakas FROM chatbot_faq_categories WHERE slug = 'lakas' AND contractor_id = v_contractor_id LIMIT 1;
  SELECT id INTO v_cat_onboarding FROM chatbot_faq_categories WHERE slug = 'onboarding' AND contractor_id = v_contractor_id LIMIT 1;
  SELECT id INTO v_cat_szabalyok FROM chatbot_faq_categories WHERE slug = 'szabalyok' AND contractor_id = v_contractor_id LIMIT 1;
  SELECT id INTO v_cat_kozosseg FROM chatbot_faq_categories WHERE slug = 'kozosseg' AND contractor_id = v_contractor_id LIMIT 1;
  SELECT id INTO v_cat_munka FROM chatbot_faq_categories WHERE slug = 'munka' AND contractor_id = v_contractor_id LIMIT 1;
  SELECT id INTO v_cat_egeszseg FROM chatbot_faq_categories WHERE slug = 'egeszseg' AND contractor_id = v_contractor_id LIMIT 1;

  -- ========== SZABADSÁG (15 entries) ==========
  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority) VALUES
  (v_contractor_id, v_cat_szabadsag, 'Hogyan kérhetek szabadságot?',
   'A szabadságot a mobilalkalmazásban tudod igényelni. Menj a Profil menübe, válaszd a Szabadság opciót, add meg a dátumokat és küldd el jóváhagyásra a vezetődnek. Rendszerint 24 órán belül választ kapsz.',
   ARRAY['szabadság', 'vakáció', 'szabadnap', 'leave', 'igénylés', 'kérés'], 10),

  (v_contractor_id, v_cat_szabadsag, 'Hány nap szabadság jár nekem?',
   'Az éves szabadságod 20 alapnap + életkor szerinti pótszabadság. 25 év alatt: +0, 25-28 év: +1, 28-31 év: +2, 31-33 év: +3, 33-35 év: +4, 35-37 év: +5, 37-39 év: +6, 39-41 év: +7, 41-43 év: +8, 43-45 év: +9, 45 felett: +10 nap. A pontos egyenleged az alkalmazásban látod.',
   ARRAY['szabadság', 'napok', 'mennyi', 'hány', 'jár', 'pótszabadság', 'éves'], 10),

  (v_contractor_id, v_cat_szabadsag, 'Mi történik ha beteg vagyok?',
   'Betegség esetén azonnal értesítsd a művezetődet telefonon vagy üzenetben. Orvosi igazolást kell hoznod, ami a táppénz alapja. Az első 15 napra a munkáltató fizet 70%-os táppénzt, utána az OEP veszi át. Az igazolást 3 napon belül add le.',
   ARRAY['beteg', 'betegség', 'táppénz', 'betegszabadság', 'orvos', 'igazolás'], 10),

  (v_contractor_id, v_cat_szabadsag, 'Lehet-e előre kivenni szabadságot?',
   'Igen, de maximum 5 napot. Az előre kivett szabadság a következő évi keretedből vonódik le. Ha a munkaviszonyod előbb megszűnik, a ki nem dolgozott napokat visszafizetned kell.',
   ARRAY['előre', 'előleg', 'szabadság', 'előrehozni'], 5),

  (v_contractor_id, v_cat_szabadsag, 'Hogyan kérjek rendkívüli szabadságot?',
   'Rendkívüli szabadság igényléséhez beszélj a művezetőddel. Jogszabály szerinti esetek: házasságkötés (2 nap), gyermek születése (5 nap), közeli hozzátartozó halála (2 nap), költözés (1 nap). Igazolást minden esetben csatolni kell.',
   ARRAY['rendkívüli', 'különleges', 'házasság', 'születés', 'haláleset', 'költözés', 'pótszabadság'], 8),

  (v_contractor_id, v_cat_szabadsag, 'Mikor kapom meg a szabadságom jóváhagyását?',
   'A szabadság jóváhagyása általában 24 órán belül megtörténik. Ha sürgős, kérd meg a művezetődet, hogy nézze meg az igényedet. A jóváhagyásról push értesítést kapsz.',
   ARRAY['jóváhagyás', 'elfogadás', 'szabadság', 'mikor', 'értesítés'], 5),

  (v_contractor_id, v_cat_szabadsag, 'Visszavonhatom a szabadságkérelmet?',
   'Igen, amíg nem hagyták jóvá, bármikor visszavonhatod az alkalmazásban. Jóváhagyás után a művezetőddel kell egyeztetned a visszavonásról.',
   ARRAY['visszavon', 'törlés', 'mégse', 'lemondás', 'szabadság'], 3),

  (v_contractor_id, v_cat_szabadsag, 'Mi a szabadság kiadásának szabálya?',
   'A szabadság egynegyedét (5 napot) a munkavállaló kérésére kell kiadni, a többit a munkáltató osztja be. Összefüggő 14 nap egybefüggő pihenőt biztosítani kell évente. A szabadságot tárgyév végéig kell kiadni.',
   ARRAY['kiadás', 'szabály', 'beosztás', 'tervezés', 'éves'], 5),

  (v_contractor_id, v_cat_szabadsag, 'Átvihetek szabadságot a következő évre?',
   'Alapesetben nem, a szabadságot tárgyévben ki kell adni. Kivételes esetben (pl. betegség) március 31-ig lehet átvinni. Erről a HR-rel kell egyeztetned.',
   ARRAY['átvitel', 'következő', 'év', 'maradék', 'szabadság'], 5),

  (v_contractor_id, v_cat_szabadsag, 'Fizetik a szabadságot?',
   'Igen, a szabadság idejére távolléti díj jár, ami az alapbérednek és a rendszeres pótlékaidnak az átlaga. Ez általában megegyezik vagy közel áll a normál fizetésedhez.',
   ARRAY['fizetés', 'pénz', 'távolléti', 'díj', 'szabadság', 'bér'], 8),

  (v_contractor_id, v_cat_szabadsag, 'Kaphatok szülési szabadságot?',
   'Igen, a várandós nők 24 hét szülési szabadságot kapnak, amiből 4 hetet a szülés előtt kötelező kivenni. A CSED (Csecsemőgondozási díj) a fizetésed 70%-a. Részletekért keresd a HR osztályt.',
   ARRAY['szülés', 'szülési', 'CSED', 'terhesség', 'várandós', 'baba', 'gyermek'], 8),

  (v_contractor_id, v_cat_szabadsag, 'Van apasági szabadság?',
   'Igen, az apa 10 munkanap apasági pótszabadságot kap a gyermek születésekor. Ezt a születéstől számított 2 hónapon belül kell kivenni. A díjazás a távolléti díj 100%-a (első 5 nap) és 40%-a (második 5 nap).',
   ARRAY['apa', 'apasági', 'születés', 'gyerek', 'pótszabadság'], 8),

  (v_contractor_id, v_cat_szabadsag, 'Hogyan jelentem a táppénzes papírt?',
   'Az orvosi igazolást (táppénzes papír) a munkahelyre visszatérésedkor azonnal add le a művezetődnek. Ha 3 napnál hosszabb a távollét, szkenneld be és küldd el emailben is: hr@company.hu. A táppénz feldolgozása 5 munkanapot vesz igénybe.',
   ARRAY['táppénz', 'orvosi', 'igazolás', 'papír', 'beteg', 'leadás'], 7),

  (v_contractor_id, v_cat_szabadsag, 'Tanulmányi szabadság jár nekem?',
   'Ha a munkáltató érdekében tanulsz, tanulmányi szabadság jár: vizsgánként 4 nap, államvizsgára 8 nap, diplomamunkára 10 nap. Ezt a HR-nél kell igényelni az iskola igazolásával.',
   ARRAY['tanulmányi', 'szabadság', 'vizsga', 'iskola', 'tanulás'], 5),

  (v_contractor_id, v_cat_szabadsag, 'Mi a teendő ha külföldön beteg leszek?',
   'Azonnal értesítsd a művezetődet. Ha EU országban vagy, az Európai Egészségbiztosítási Kártyával (EEK) tudsz orvoshoz menni. A külföldi orvosi igazolást is el kell fogadnunk, de magyar fordítás szükséges lehet.',
   ARRAY['külföld', 'beteg', 'orvos', 'EEK', 'külföldi', 'igazolás'], 5),

  -- ========== FIZETÉS (15 entries) ==========
  (v_contractor_id, v_cat_fizetes, 'Mikor kapom a fizetésemet?',
   'A fizetés minden hónap 10-éig érkezik a bankszámládra. Ha a 10-e hétvégére vagy ünnepnapra esik, az azt megelőző utolsó munkanapon. A bérjegyzéked az alkalmazásban elérhető a Fizetés menüben.',
   ARRAY['fizetés', 'bér', 'mikor', 'bankszámla', 'átutalás', 'pénz'], 10),

  (v_contractor_id, v_cat_fizetes, 'Hogyan nézhetem meg a bérjegyzékemet?',
   'A bérjegyzéket az alkalmazás Fizetés menüjében találod. Minden hónapban automatikusan feltöltjük. PDF formátumban is letöltheted. Ha kérdésed van a tételekről, fordulj a bérszámfejtéshez.',
   ARRAY['bérjegyzék', 'fizetés', 'levonás', 'megtekintés', 'papír', 'kivonat'], 10),

  (v_contractor_id, v_cat_fizetes, 'Mi van ha hibás a fizetésem?',
   'Ha eltérést találsz, azonnal jelezd a HR-nek emailben (hr@company.hu) vagy a hibajegyrendszerben. Írd le pontosan milyen eltérést tapasztalsz. A korrekciót a következő bérszámfejtéskor pótoljuk, sürgős esetben rendkívüli átutalással.',
   ARRAY['hiba', 'hibás', 'fizetés', 'kevesebb', 'eltérés', 'korrekció', 'reklamáció'], 10),

  (v_contractor_id, v_cat_fizetes, 'Hogyan változtatom meg a bankszámlámat?',
   'Bankszámla módosítását írásban, a HR osztályon kell jelezned. Hozd magaddal a bankszámlakivonatod másolatát. A változás a következő bérszámfejtéstől lép érvénybe. Online az alkalmazásban is módosítható a Profil/Bankadatok menüben.',
   ARRAY['bankszámla', 'módosítás', 'változtatás', 'számla', 'bank'], 8),

  (v_contractor_id, v_cat_fizetes, 'Kapok túlórapénzt?',
   'Igen, a túlórákért pótlék jár: hétköznap +50%, hétvégén +100%, ünnepnapon +100%. A túlórát a művezetőnek kell rögzítenie a rendszerben. A pótlék a következő havi bérrel együtt kerül kifizetésre.',
   ARRAY['túlóra', 'pótlék', 'hétvége', 'ünnepnap', 'többlet', 'extra'], 8),

  (v_contractor_id, v_cat_fizetes, 'Van cafeteria juttatás?',
   'Igen, havi 10.000 Ft SZÉP-kártya juttatás jár a Szálláshely alszámlára. Ezt a bérszámfejtéssel együtt havonta utaljuk. Ha még nincs SZÉP-kártyád, a HR segít az igénylésben.',
   ARRAY['cafeteria', 'SZÉP', 'kártya', 'juttatás', 'kedvezmény', 'szálláshely'], 8),

  (v_contractor_id, v_cat_fizetes, 'Mennyi a minimálbér?',
   'A 2026-os garantált bérminimum (szakmunkás minimum) havi bruttó 326.000 Ft. Az általános minimálbér havi bruttó 266.800 Ft. Az aktuális béredet a bérjegyzékedben találod.',
   ARRAY['minimálbér', 'bérminimum', 'minimum', 'összeg', 'bruttó'], 5),

  (v_contractor_id, v_cat_fizetes, 'Hogyan kapom meg az éves adóigazolást?',
   'Az éves jövedelemigazolást (M30-as) minden év január 31-ig megkapod emailben és az alkalmazásban. Ha korábbra van szükséged (pl. hiteligényléshez), kérd a HR-től.',
   ARRAY['adóigazolás', 'jövedelem', 'igazolás', 'M30', 'éves', 'adó', 'NAV'], 5),

  (v_contractor_id, v_cat_fizetes, 'Van bérelőleg lehetőség?',
   'Igen, maximum az aktuális havi béred 50%-áig kérhetsz bérelőleget. Ezt a HR-nél kell igényelned, és a következő havi bérből automatikusan levonásra kerül. Évente maximum 3 alkalommal vehető igénybe.',
   ARRAY['bérelőleg', 'előleg', 'kölcsön', 'pénz', 'sürgős'], 8),

  (v_contractor_id, v_cat_fizetes, 'Milyen levonások vannak a béremből?',
   'A bruttó bérből levonásra kerül: TB járulék (18.5%), személyi jövedelemadó (15%). A nettó fizetésed ezek levonása után alakul ki. A részletes bontást a bérjegyzékedben látod.',
   ARRAY['levonás', 'adó', 'járulék', 'TB', 'SZJA', 'nettó', 'bruttó'], 8),

  (v_contractor_id, v_cat_fizetes, 'Mikor van béremelés?',
   'A béremelés általában évente egyszer, januárban történik. Az emelés mértéke függ a gazdasági helyzettől, a teljesítménytől és a minimálbér változásától. Egyéni béremelést a művezetőd vagy a HR kezdeményezhet.',
   ARRAY['béremelés', 'emelés', 'fizetésemelés', 'több', 'bér'], 5),

  (v_contractor_id, v_cat_fizetes, 'Hogyan igényelhetem a családi adókedvezményt?',
   'A családi adókedvezmény igényléséhez töltsd ki az adóelőleg-nyilatkozatot a HR-nél. Szükséges: gyermek(ek) TAJ száma, házastárs adatai. Az igénylés a következő hónaptól érvényes.',
   ARRAY['családi', 'adókedvezmény', 'kedvezmény', 'gyerek', 'nyilatkozat'], 7),

  (v_contractor_id, v_cat_fizetes, 'Mi az a kiküldetési napidíj?',
   'Ha a munkáltató kiküldetésbe küld, napi 3.000 Ft napidíj jár adómentesen (belföld). Külföldi kiküldetés esetén az országtól függő EUR összeg. A kiküldetési rendelvényt előre ki kell tölteni.',
   ARRAY['kiküldetés', 'napidíj', 'utazás', 'külföldi', 'diéta'], 5),

  (v_contractor_id, v_cat_fizetes, 'Hogyan kezeljem a prémiumot/bónuszt?',
   'A prémium a teljesítményértékelés alapján jár, általában negyedévente. Az összeg a bérjegyzéken külön tételként jelenik meg. A prémium ugyanúgy adóköteles, mint a normál bér.',
   ARRAY['prémium', 'bónusz', 'jutalom', 'teljesítmény', 'extra'], 5),

  (v_contractor_id, v_cat_fizetes, 'Mi történik a fizetéssel felmondáskor?',
   'Felmondáskor a ki nem fizetett bért, arányos szabadságot és felmondási időre járó díjat az utolsó munkanapon számfejtjük. Az igazolásokat (M30, TB igazolás, munkáltatói igazolás) 5 munkanapon belül postázzuk.',
   ARRAY['felmondás', 'végszámfejtés', 'kilépés', 'utolsó', 'bér', 'igazolások'], 8),

  -- ========== SZÁLLÁSHELY (15 entries) ==========
  (v_contractor_id, v_cat_lakas, 'Hogyan kapok szállást?',
   'Szállás igénylését a munkaszerződés aláírásakor jelezd. A szálláshelyet az érkezésed előtt 3 nappal osztjuk ki. A szállásodon ágynemű, alapbútorok és konyhahasználat biztosított. Részletekért keresd a szálláskezelőt.',
   ARRAY['szállás', 'lakás', 'szoba', 'elhelyezés', 'igénylés', 'kap'], 10),

  (v_contractor_id, v_cat_lakas, 'Mennyibe kerül a szállás?',
   'A szállásdíj az elhelyezés típusától függ: többágyas szoba ~30.000-40.000 Ft/hó, kétágyas ~45.000-55.000 Ft/hó, egyágyas ~60.000-75.000 Ft/hó. A pontos összeget a szerződésben találod. A díj a béredből levonásra kerül.',
   ARRAY['szállásdíj', 'ár', 'mennyibe', 'költség', 'lakbér', 'fizetés'], 10),

  (v_contractor_id, v_cat_lakas, 'Mit tegyek ha elromlik valami a szálláson?',
   'Hibát az alkalmazásban a Hibajegy menüben jelezd, válaszd a Szálláshely kategóriát. Sürgős esetben (víz, gáz, áram) hívd a 24 órás segélyvonalat: +36-1-234-5678. Normál hibákat 48 órán belül javítunk.',
   ARRAY['hiba', 'elromlott', 'javítás', 'karbantartás', 'szállás', 'probléma'], 10),

  (v_contractor_id, v_cat_lakas, 'Mikor van takarítás?',
   'A közös helyiségeket hetente kétszer takarítjuk (hétfő, csütörtök). A saját szobádat magadnak kell rendben tartanod. Takarítószereket a raktárból tudsz kérni. Rendkívüli takarítást hibajegyként kérhetsz.',
   ARRAY['takarítás', 'tisztaság', 'rend', 'mosás', 'közös'], 5),

  (v_contractor_id, v_cat_lakas, 'Van WiFi a szálláson?',
   'Igen, minden szálláson van ingyenes WiFi. A hálózat neve és jelszó a szobádban lévő tájékoztatóban van. Ha lassú az internet vagy nem működik, jelezd hibajegyként.',
   ARRAY['WiFi', 'internet', 'hálózat', 'wifi', 'jelszó', 'net'], 8),

  (v_contractor_id, v_cat_lakas, 'Hozhatok vendéget a szállásra?',
   'Vendéget előzetes engedéllyel hozhatsz, maximum 1 éjszakára. Szólj a szálláskezelőnek legalább 24 órával korábban. Éjszakai vendéglátás 22:00 és 06:00 között tilos a házirend szerint.',
   ARRAY['vendég', 'látogató', 'barát', 'hozhat', 'szállás'], 5),

  (v_contractor_id, v_cat_lakas, 'Hogyan kérhetek szobaváltást?',
   'Szobaváltási kérelmet az alkalmazásban a Szállás menüben adhatod le. Indokold meg a kérést (pl. zajos szomszéd, magasabb emelet kérése). A váltást a lehetőségekhez mérten 1-2 héten belül oldjuk meg.',
   ARRAY['szobaváltás', 'csere', 'költözés', 'másik', 'szoba'], 5),

  (v_contractor_id, v_cat_lakas, 'Mi a szállás házirendje?',
   'Főbb szabályok: csend 22:00-06:00, dohányzás csak kijelölt helyen, alkoholfogyasztás mértékkel, vendéglátás előzetes engedéllyel, közös terek rendben tartása, szemét szelektív gyűjtése. A teljes házirendet a szálláson kihelyeztük.',
   ARRAY['házirend', 'szabály', 'csend', 'dohányzás', 'rend'], 8),

  (v_contractor_id, v_cat_lakas, 'Van mosási lehetőség?',
   'Igen, minden szálláson van mosógép és szárítógép a közös helyiségben. Használat ingyenes. Kérjük, 30 percen belül pakold ki a kész mosást. Mosóport a raktárból kérhetsz.',
   ARRAY['mosás', 'mosógép', 'szárító', 'ruha', 'mosószer'], 5),

  (v_contractor_id, v_cat_lakas, 'Ki a szálláskezelő?',
   'A szálláskezelő neve és elérhetősége a szálláson lévő hirdetőtáblán és az alkalmazás Kapcsolatok menüjében található. Munkaidő: H-P 8:00-16:00. Sürgős esetben a 24 órás segélyvonal érhető el.',
   ARRAY['szálláskezelő', 'felügyelő', 'gondnok', 'elérhetőség', 'kapcsolat'], 5),

  (v_contractor_id, v_cat_lakas, 'Főzhetek a szálláson?',
   'Igen, a közös konyhát szabadon használhatod. Kérjük, főzés után takaríts magad után. Saját edényeket hoznod kell, alapfelszerelés (tűzhely, mikró, hűtő) biztosított. A hűtőben jelöld meg az ételedet.',
   ARRAY['főzés', 'konyha', 'étel', 'hűtő', 'mikró', 'edény'], 5),

  (v_contractor_id, v_cat_lakas, 'Van parkoló a szállásnál?',
   'Nem minden szállásnál van parkoló. Az elérhető parkolók listáját a szálláskezelőtől kérheted. Parkolóhely igénylése az alkalmazásban lehetséges, havi díja 5.000-10.000 Ft.',
   ARRAY['parkoló', 'autó', 'parkolás', 'kocsi', 'gépjármű'], 3),

  (v_contractor_id, v_cat_lakas, 'Mi történik ha elvesztem a szoba kulcsát?',
   'Kulcsvesztés esetén azonnal szólj a szálláskezelőnek. Pótkulcs kiadása: 5.000 Ft. Munkaidőn kívül a biztonsági őr tud segíteni. Javasoljuk, hogy mindig vidd magaddal a kulcsod.',
   ARRAY['kulcs', 'elveszett', 'zárt', 'pótkulcs', 'nyitás'], 8),

  (v_contractor_id, v_cat_lakas, 'Mikor kell kiköltöznöm ha felmondok?',
   'A munkaszerződés megszűnésekor a kiköltözés az utolsó munkanaptól számított 3 napon belül szükséges. A szobakulcsot a szálláskezelőnek add le, és töltsd ki a kiköltözési jegyzőkönyvet.',
   ARRAY['kiköltözés', 'felmondás', 'elköltözés', 'mikor', 'szállás'], 8),

  (v_contractor_id, v_cat_lakas, 'Van biztosítás a szálláson tárolt holmikra?',
   'A munkáltató nem vállal felelősséget a személyes tárgyakért. Értékesebb dolgaidat zárd el. A szobában van szekrényes tároló. Javasoljuk saját utasbiztosítás kötését értéktárgyakra.',
   ARRAY['biztosítás', 'holmi', 'tárgyak', 'felelősség', 'lopás', 'értéktárgy'], 3),

  -- ========== ONBOARDING (12 entries) ==========
  (v_contractor_id, v_cat_onboarding, 'Mik az első napi teendőim?',
   'Első nap: 1) Regisztrálj az alkalmazásban a kapott QR kóddal 2) Menj az orientációs tájékoztatóra (helyszín: recepció, 9:00) 3) Kapj munkavédelmi oktatást 4) Vedd át a munkaruhádat 5) Ismerd meg a művezetődet. Az orientáció kb. 4 órát vesz igénybe.',
   ARRAY['első', 'nap', 'kezdés', 'teendő', 'orientáció', 'indulás', 'start'], 10),

  (v_contractor_id, v_cat_onboarding, 'Milyen dokumentumokra van szükség?',
   'Szükséges dokumentumok: 1) Érvényes útlevél/személyi 2) TAJ kártya 3) Adókártya 4) Lakcímkártya 5) Bankszámlaszám igazolás 6) 2 db igazolványkép 7) Iskolai végzettség igazolása. Külföldi munkavállalóknak: munkavállalási engedély és vízum.',
   ARRAY['dokumentum', 'papír', 'irat', 'szükséges', 'igazolvány', 'hozni'], 10),

  (v_contractor_id, v_cat_onboarding, 'Hogyan regisztrálok az alkalmazásba?',
   'Az alkalmazás letölthető az App Store-ból (iOS) vagy Google Play-ből (Android). A regisztrációs kódot emailben kapod, vagy az első napi orientáción adj meg. A kódot az alkalmazás nyitóképernyőjén kell beírni.',
   ARRAY['regisztráció', 'alkalmazás', 'app', 'letöltés', 'belépés', 'kód'], 10),

  (v_contractor_id, v_cat_onboarding, 'Van próbaidő?',
   'Igen, a próbaidő 3 hónap. Ez alatt bármelyik fél azonnali hatállyal felmondhat. A próbaidő nem hosszabbítható. A próbaidő alatt ugyanazok a jogok és juttatások járnak.',
   ARRAY['próbaidő', 'próba', 'hónap', 'felmondás', 'azonnali'], 8),

  (v_contractor_id, v_cat_onboarding, 'Mikor kapom meg a munkaruhámat?',
   'A munkaruha az első napi orientáción kerül kiosztásra. Kapni fogsz: 2 póló, 1 nadrág, 1 munkacipő, 1 kabát. A munkavédelmi felszerelést (sisak, kesztyű, stb.) a munkaterületen veszed át.',
   ARRAY['munkaruha', 'ruha', 'cipő', 'felszerelés', 'öltözet', 'védőruha'], 8),

  (v_contractor_id, v_cat_onboarding, 'Ki a művezetőm?',
   'A művezetődet az első napon ismered meg. Az alkalmazásban a Csapatom menüben látod a művezetőd nevét és elérhetőségét. Ha nem tudod ki a művezetőd, kérdezd a recepciót.',
   ARRAY['művezető', 'vezető', 'főnök', 'felettes', 'ki', 'csapat'], 8),

  (v_contractor_id, v_cat_onboarding, 'Milyen képzéseken kell részt vennem?',
   'Kötelező képzések: 1) Munkavédelmi oktatás (1. nap) 2) Tűzvédelmi oktatás (1. nap) 3) GDPR adatvédelmi tájékoztató (1. hét) 4) Szakmai betanulás (1-2 hét). A képzések időpontjait az alkalmazásban látod.',
   ARRAY['képzés', 'oktatás', 'betanulás', 'tanfolyam', 'kötelező', 'tréning'], 8),

  (v_contractor_id, v_cat_onboarding, 'Hol ebédelhetek?',
   'Munkahelyi étkezde áll rendelkezésre H-P 11:30-13:30 között. Az ebéd ára kedvezményes: 1.200 Ft/adag. Az étlapot hetente előre közzétesszük az alkalmazásban. Saját ételt a közös konyhában melegíthetsz.',
   ARRAY['ebéd', 'étkezde', 'étel', 'konyha', 'enni', 'menza'], 5),

  (v_contractor_id, v_cat_onboarding, 'Hogyan jutok el a munkahelyre?',
   'Transzferszolgáltatás: a céges busz minden reggel 6:30 és 7:00-kor indul a szállásoktól. Visszafelé a műszak végén. A pontos menetrendet az alkalmazásban találod. Saját közlekedés esetén BKK bérlet támogatás igényelhető.',
   ARRAY['közlekedés', 'busz', 'transzfer', 'eljutás', 'menetrend', 'utazás'], 8),

  (v_contractor_id, v_cat_onboarding, 'Van mentorprogram?',
   'Igen, minden új munkavállalóhoz egy tapasztalt kollégát rendelünk mentorként az első 2 hónapra. A mentor segít a beilleszkedésben, kérdéseidre válaszol és bemutat a csapatnak.',
   ARRAY['mentor', 'segítség', 'betanulás', 'kolléga', 'beilleszkedés'], 5),

  (v_contractor_id, v_cat_onboarding, 'Hogyan tudom felvenni a kapcsolatot a HR-rel?',
   'A HR elérhetőségei: Email: hr@company.hu | Telefon: +36-1-234-5670 | Személyesen: irodaház, 2. emelet | Alkalmazásban: Kapcsolatok menü. Fogadóóra: H-P 9:00-12:00 és 13:00-15:00.',
   ARRAY['HR', 'kapcsolat', 'elérhetőség', 'telefon', 'email', 'iroda'], 10),

  (v_contractor_id, v_cat_onboarding, 'Mi a teendő ha elvesztem a belépőkártyámat?',
   'Azonnal jelezd a recepción vagy a HR-nél. Pótlás díja: 3.000 Ft. Amíg nem kapsz újat, ideiglenesen vendégbelépővel tudsz bejutni. A régi kártya automatikusan letiltásra kerül.',
   ARRAY['belépőkártya', 'kártya', 'elveszett', 'pót', 'belépés'], 8),

  -- ========== SZABÁLYOK (13 entries) ==========
  (v_contractor_id, v_cat_szabalyok, 'Mi a dohányzási szabály?',
   'Dohányzás kizárólag a kijelölt dohányzóhelyeken megengedett. Az épületen belül és a szálláson tilos. A kijelölt helyek az épület előtti területen találhatók, jelzőtáblával jelölve. Szabálysértés esetén figyelmeztetés, ismétlés esetén fegyelmi.',
   ARRAY['dohányzás', 'cigaretta', 'füstöl', 'tilos', 'szabad', 'hely'], 8),

  (v_contractor_id, v_cat_szabalyok, 'Mi az alkohol szabály?',
   'A munkaterületen és munkaidőben alkoholfogyasztás TILOS. A szálláson mérsékelt fogyasztás megengedett, de nem eredményezhet rendbontást. Alkoholos befolyásoltság a munkahelyen azonnali felmondási ok.',
   ARRAY['alkohol', 'ital', 'sör', 'bor', 'részeg', 'ittas', 'tilos'], 10),

  (v_contractor_id, v_cat_szabalyok, 'Mi történik ha elkések?',
   'Késéseket a rendszer rögzíti. Havi 3 alkalomnál kevesebb késés szóbeli figyelmeztetés. 3 felett írásbeli figyelmeztetés. Rendszeres késés fegyelmi eljárást von maga után. Ha előre tudod, hogy késel, értesítsd a művezetődet.',
   ARRAY['késés', 'elkéste', 'pontosság', 'idő', 'felment', 'figyelmeztetés'], 8),

  (v_contractor_id, v_cat_szabalyok, 'Milyen munkavédelmi szabályok vannak?',
   'Kötelező: 1) Védőfelszerelés viselése a munkaterületen 2) Biztonsági oktatáson való részvétel 3) Balesetek azonnali jelentése 4) Védőital fogyasztása forróságban 5) Emelési szabályok betartása. Részletek a munkavédelmi szabályzatban.',
   ARRAY['munkavédelem', 'biztonság', 'védőfelszerelés', 'baleset', 'szabály'], 10),

  (v_contractor_id, v_cat_szabalyok, 'Van öltözködési előírás?',
   'Munkaterületen kötelező a cég által kiadott munkaruha és védőfelszerelés viselése. Az öltözőben civil ruhába át lehet öltözni. A szálláson nincs öltözködési előírás. A munkaruhát hetente 1x mosathatod a mosodában.',
   ARRAY['öltözék', 'ruha', 'munkaruha', 'viselet', 'öltözködés'], 5),

  (v_contractor_id, v_cat_szabalyok, 'Mi a mobilhasználat szabálya?',
   'Munkaidőben a mobiltelefon használata a munkaterületen tilos (biztonsági okokból). Szünetben és a pihenőhelyeken szabadon használhatod. Sürgős hívás esetén szólj a művezetőnek.',
   ARRAY['mobil', 'telefon', 'használat', 'tilos', 'munkaidő'], 5),

  (v_contractor_id, v_cat_szabalyok, 'Hogyan jelentsek balesetet?',
   'Baleset esetén: 1) Azonnal szólj a legközelebbi kollégának 2) Hívd a művezetőt 3) Súlyos sérülésnél mentőt (104) 4) A baleseti jegyzőkönyvet 24 órán belül ki kell tölteni a HR-nél. Minden balesetet jelenteni KÖTELEZŐ!',
   ARRAY['baleset', 'sérülés', 'jelentés', 'mentő', 'segítség', 'sürgős'], 10),

  (v_contractor_id, v_cat_szabalyok, 'Mi a szankció fegyelmi vétség esetén?',
   'Fokozatok: 1) Szóbeli figyelmeztetés 2) Írásbeli figyelmeztetés 3) Megrovás 4) Rendkívüli felmondás. Súlyos vétség (lopás, verekedés, ittas munkavégzés) esetén azonnali rendkívüli felmondás. A fegyelmi eljárásról írásban értesítünk.',
   ARRAY['fegyelmi', 'szankció', 'büntetés', 'figyelmeztetés', 'felmondás'], 8),

  (v_contractor_id, v_cat_szabalyok, 'Van-e titoktartási kötelezettség?',
   'Igen, a munkaszerződés titoktartási záradékot tartalmaz. Céges információk, üzleti titkok, személyes adatok harmadik félnek nem adhatók ki. Ez a munkaviszony után is érvényes.',
   ARRAY['titoktartás', 'titok', 'adatvédelem', 'GDPR', 'bizalmas', 'információ'], 5),

  (v_contractor_id, v_cat_szabalyok, 'Mik a pihenőidő szabályai?',
   'Napi 6 óra munka után 20 perc, 9 óra után 25 perc szünet jár. A szünetet a műszak közepén kell kivenni. 11 óra pihenőidő jár két műszak között. Heti 2 pihenőnap jár, ebből az egyik vasárnap.',
   ARRAY['pihenő', 'szünet', 'break', 'szabály', 'idő', 'munkaóra'], 8),

  (v_contractor_id, v_cat_szabalyok, 'Mi a GDPR szabályzat?',
   'Személyes adataidat a GDPR (EU 2016/679) és a magyar adatvédelmi törvény szerint kezeljük. Jogod van tájékoztatást kérni, adataidat módosítani, töröltetni. Adatvédelmi kéréseket az adatvedelem@company.hu címre küldheted.',
   ARRAY['GDPR', 'adatvédelem', 'személyes', 'adat', 'jogok', 'törlés'], 5),

  (v_contractor_id, v_cat_szabalyok, 'Van-e panasztételi lehetőség?',
   'Igen, panaszt tehetsz: 1) A művezetődnél szóban 2) A HR-nél írásban 3) Az alkalmazásban anonim hibajegyként 4) Az etikai vonalon (ethics@company.hu). Minden panaszt 5 munkanapon belül kivizsgálunk. Megtorlás tilos.',
   ARRAY['panasz', 'reklamáció', 'bejelentés', 'etikai', 'probléma', 'elégedetlen'], 8),

  (v_contractor_id, v_cat_szabalyok, 'Szabad-e másodállást vállalni?',
   'Másodállás a munkáltató előzetes írásbeli engedélyével vállalható. Konkurens cégnél tilos. Az engedélykérelmet a HR-hez kell benyújtani. Az engedélyt bármikor visszavonhatjuk ha a főállásra kihat.',
   ARRAY['másodállás', 'mellékállás', 'munka', 'engedély', 'plusz'], 3),

  -- ========== KÖZÖSSÉG (10 entries) ==========
  (v_contractor_id, v_cat_kozosseg, 'Vannak közösségi programok?',
   'Igen, havi rendszerességgel szervezünk: 1) Filmestek a közösségi teremben 2) Sportprogramok (foci, ping-pong, futás) 3) Nemzeti ünnepek közös megünneplése 4) Grillezés nyáron 5) Karácsonyi parti. Az eseményeket az alkalmazásban hirdetjük.',
   ARRAY['program', 'esemény', 'közösség', 'szórakozás', 'csapat', 'rendezvény'], 8),

  (v_contractor_id, v_cat_kozosseg, 'Van sportolási lehetőség?',
   'Igen! Elérhető: 1) Edzőterem (szálláson belül) 2) Focipálya (szomszédos park) 3) Ping-pong asztalok (közösségi terem) 4) Futókör a környéken. Csütörtökönként 18:00-kor céges foci. Konditerem 6:00-22:00 között használható.',
   ARRAY['sport', 'edzés', 'foci', 'futás', 'konditerem', 'ping-pong'], 5),

  (v_contractor_id, v_cat_kozosseg, 'Hogyan csatlakozhatok a céges focicsapathoz?',
   'Szólj a sportfelelősnek (elérhetőség az alkalmazásban) vagy gyere el csütörtökön 18:00-ra a focipályára. Nincs szintfelmérő, mindenkit szívesen látunk! A cég biztosítja a labdákat.',
   ARRAY['foci', 'csapat', 'csatlakozás', 'sport', 'meccs', 'labda'], 3),

  (v_contractor_id, v_cat_kozosseg, 'Hol van a közösségi terem?',
   'A közösségi terem a szállásépület földszintjén található. Nyitvatartás: 6:00-23:00. Van benne: TV, társasjátékok, pingpongasztal, konyha, étkezősarok. A terem rendezvényekre is foglalható.',
   ARRAY['közösségi', 'terem', 'nappali', 'TV', 'szórakozás', 'hol'], 5),

  (v_contractor_id, v_cat_kozosseg, 'Van nyelvtanfolyam?',
   'Igen, heti 2x szervezünk magyar nyelvtanfolyamot (kezdő és haladó szinten). A tanfolyam ingyenes, H-Sz 17:00-18:30 a közösségi teremben. Jelentkezés az alkalmazásban vagy a HR-nél.',
   ARRAY['nyelv', 'tanfolyam', 'magyar', 'tanulás', 'óra', 'nyelvtanulás'], 8),

  (v_contractor_id, v_cat_kozosseg, 'Szervezhetek saját programot?',
   'Igen, örülünk a kezdeményezéseknek! Szólj a közösségi koordinátornak az alkalmazáson keresztül. A közösségi termet ingyenesen használhatod. Költségvetésre pályázhatsz a havi közösségi keretből (max 50.000 Ft/esemény).',
   ARRAY['szervezés', 'program', 'kezdeményezés', 'esemény', 'ötlet'], 3),

  (v_contractor_id, v_cat_kozosseg, 'Van kulturális program?',
   'Igen, havonta szervezünk kulturális programokat: múzeumlátogatás, várostúra, koncertlátogatás. Negyedévente szervezünk nagyobb kirándulást (pl. Balaton, Eger). Az információk az alkalmazásban a Közösség menüben.',
   ARRAY['kultúra', 'program', 'múzeum', 'kirándulás', 'túra', 'koncert'], 3),

  (v_contractor_id, v_cat_kozosseg, 'Hogyan kommunikálhatok a kollégáimmal?',
   'Kommunikációs csatornák: 1) Alkalmazás belső chat 2) Közösségi tábla a szálláson 3) Heti csapatmegbeszélés (péntek 15:00) 4) Email (ha van céges fiókod). Sürgős esetben: telefonon a művezetőn keresztül.',
   ARRAY['kommunikáció', 'chat', 'üzenet', 'kolléga', 'kapcsolat', 'beszélgetés'], 5),

  (v_contractor_id, v_cat_kozosseg, 'Van vallásos közösség?',
   'Tiszteletben tartjuk minden vallás gyakorlását. A legközelebbi templomok/imaházak címét a recepción kérheted. Imaszoba kialakítása igény esetén lehetséges. Vallási ünnepek figyelembevételét kérheted a műszakbeosztásnál.',
   ARRAY['vallás', 'templom', 'ima', 'egyház', 'istentisztelet'], 3),

  (v_contractor_id, v_cat_kozosseg, 'Hogyan kaphatok pszichológiai segítséget?',
   'Ingyenes, anonim pszichológiai tanácsadás érhető el: 1) Céges pszichológus: hétfőnként 14:00-18:00 (időpont foglalás a HR-nél) 2) Krízis vonal: 116-123 (0-24h) 3) Lelki Elsősegély: 116-111. Ne habozz segítséget kérni!',
   ARRAY['pszichológus', 'mentális', 'segítség', 'tanácsadás', 'lelki', 'probléma', 'depresszió'], 10),

  -- ========== MUNKAVÉGZÉS (12 entries) ==========
  (v_contractor_id, v_cat_munka, 'Milyen a munkaidő beosztás?',
   'A munkaidő általában 3 műszakban: reggeli (6:00-14:00), délutáni (14:00-22:00), éjszakai (22:00-6:00). A műszakbeosztást a hét elején kapod meg az alkalmazásban. Változás 48 órával előtte közölve.',
   ARRAY['munkaidő', 'műszak', 'beosztás', 'óra', 'mikor', 'reggel', 'este'], 10),

  (v_contractor_id, v_cat_munka, 'Hogyan cserélhetek műszakot?',
   'Műszakcserét a művezetőddel kell egyeztetned. Találj egy kollégát aki hajlandó cserélni, aztán mindketten jelezzétek a művezetőnek. A csere jóváhagyás után érvényes. Minimum 24 órával előbb kérjétek.',
   ARRAY['műszak', 'csere', 'váltás', 'kolléga', 'beosztás'], 8),

  (v_contractor_id, v_cat_munka, 'Mi a túlóra szabálya?',
   'Túlóra önkéntes, de szükség esetén rendelhető (max évi 250 óra). Hétköznapon max +4 óra, hétvégén max 12 óra. Túlóra után 11 óra pihenőidő jár. A pótlék: hétköznap +50%, hétvége/ünnepnap +100%.',
   ARRAY['túlóra', 'extra', 'plusz', 'óra', 'szabály', 'rendkívüli'], 8),

  (v_contractor_id, v_cat_munka, 'Hogyan rögzítsem a munkaidőmet?',
   'Munkaidő nyilvántartás a belépőkártyával történik: érkezéskor és távozáskor is kártyázz. Ha elfelejted, szólj a művezetőnek aki manuálisan rögzíti. Az alkalmazásban a Munkaidő menüben ellenőrizheted a nyilvántartásodat.',
   ARRAY['munkaidő', 'rögzítés', 'kártya', 'nyilvántartás', 'belépés', 'kilépés'], 8),

  (v_contractor_id, v_cat_munka, 'Mi történik ha nem tudok bejönni dolgozni?',
   'Azonnal értesítsd a művezetődet (telefonon, nem SMS-ben). Betegség esetén orvosi igazolás szükséges. Egyéb ok esetén szabadság igényelhető. Igazolatlan távollét fegyelmi eljárást von maga után.',
   ARRAY['hiányzás', 'nem', 'tudok', 'bejönni', 'igazolatlan', 'távollét'], 10),

  (v_contractor_id, v_cat_munka, 'Van-e lehetőség belső áthelyezésre?',
   'Igen, belső pályázat útján kérhetsz áthelyezést más területre/pozícióba. A belső álláshirdetéseket az alkalmazásban a Karrier menüben látod. Az áthelyezés a művezetőd és a HR jóváhagyásával lehetséges.',
   ARRAY['áthelyezés', 'belső', 'másik', 'pozíció', 'terület', 'karrier'], 5),

  (v_contractor_id, v_cat_munka, 'Hogyan mondhatok fel?',
   'A felmondást írásban kell benyújtanod a HR-nek. A felmondási idő 30 nap (próbaidő alatt 0 nap). A felmondási idő alatt a munkavégzés kötelező. A végszámfejtés az utolsó munkanapon történik.',
   ARRAY['felmondás', 'kilépés', 'megszűnés', 'szerződés', 'idő'], 10),

  (v_contractor_id, v_cat_munka, 'Van éjszakai pótlék?',
   'Igen, 22:00 és 06:00 között végzett munkáért +15% éjszakai pótlék jár az alapbérhez. Ha az éjszakai munka meghaladja a havi 80 órát, kötelező orvosi alkalmassági vizsgálat szükséges.',
   ARRAY['éjszakai', 'pótlék', 'éjszaka', 'műszak', 'plusz'], 8),

  (v_contractor_id, v_cat_munka, 'Mi a hétvégi munka szabálya?',
   'Hétvégi munkáért +50% pótlék jár szombaton, +100% vasárnap. Vasárnapi munkavégzés után hétfőn pihenőnap jár. A hétvégi műszakot a heti beosztásban előre közöljük.',
   ARRAY['hétvége', 'szombat', 'vasárnap', 'pótlék', 'munkavégzés'], 8),

  (v_contractor_id, v_cat_munka, 'Hogyan kapok előléptetést?',
   'Előléptetés lehetőségek: műszakvezetővé, csoportvezetővé, szaktanácsadóvá. Az értékelés félévente történik. Kritériumok: teljesítmény, fegyelem, hozzáállás, szakmai tudás. Az előléptetéshez általában 6-12 hónap munkaviszony szükséges.',
   ARRAY['előléptetés', 'karrier', 'vezető', 'növekedés', 'pozíció'], 5),

  (v_contractor_id, v_cat_munka, 'Van teljesítményértékelés?',
   'Igen, negyedévente formális értékelés a művezetőddel. Szempontok: munkaminőség, hatékonyság, pontosság, csapatmunka, kezdeményezőkészség. Az értékelés befolyásolja a prémiumot és az előléptetési esélyeidet.',
   ARRAY['teljesítmény', 'értékelés', 'minősítés', 'visszajelzés', 'prémium'], 5),

  (v_contractor_id, v_cat_munka, 'Mik az ünnepnapok?',
   'Fizetett ünnepnapok 2026-ban: jan. 1, márc. 15, ápr. 6 (húsvét hétfő), máj. 1, máj. 25 (pünkösd hétfő), aug. 20, okt. 23, nov. 1, dec. 25-26. Ezeken a napokon nem kell dolgozni, vagy 100%-os pótlék jár.',
   ARRAY['ünnepnap', 'munkaszünet', 'szabad', 'fizetett', 'piros', 'nap'], 8),

  -- ========== EGÉSZSÉG (10 entries) ==========
  (v_contractor_id, v_cat_egeszseg, 'Mikor kell orvosi vizsgálatra mennem?',
   'Kötelező alkalmassági vizsgálat: belépéskor, majd évente egyszer. Éjszakai műszakosoknak félévente. Az időpontot a HR koordinálja, előre értesítünk. A vizsgálat munkaidőben történik, fizetett.',
   ARRAY['orvos', 'vizsgálat', 'alkalmassági', 'kötelező', 'egészségügyi'], 10),

  (v_contractor_id, v_cat_egeszseg, 'Mi a teendő munkahelyi baleset esetén?',
   'Azonnal: 1) Biztosítsd a sérültet 2) Szólj a művezetőnek 3) Hívj mentőt ha súlyos (104) 4) Ne mozdítsd a sérültet gerincsérülés gyanújánál. Utána: baleseti jegyzőkönyv a HR-nél 24 órán belül. MINDEN balesetet jelenteni kell!',
   ARRAY['baleset', 'sérülés', 'mentő', 'elsősegély', 'munkahelyi'], 10),

  (v_contractor_id, v_cat_egeszseg, 'Hol van az elsősegélydoboz?',
   'Elsősegélydoboz minden szinten megtalálható, piros jelzéssel. A szálláson a recepción és minden emeleti közös helyiségben van. Használat után jelezd a hiányt, hogy pótolhassuk.',
   ARRAY['elsősegély', 'doboz', 'kötszer', 'gyógyszer', 'sebesülés'], 8),

  (v_contractor_id, v_cat_egeszseg, 'Van céges orvos?',
   'Igen, a foglalkozás-egészségügyi orvos hetente 2x rendel a munkahelyen (kedd, csütörtök 10:00-14:00). Időpontot a recepción vagy az alkalmazásban foglalhatsz. Sürgős esetben azonnal fogad.',
   ARRAY['orvos', 'rendelés', 'céges', 'foglalkozás', 'egészségügyi', 'időpont'], 8),

  (v_contractor_id, v_cat_egeszseg, 'Mi a védőital szabály?',
   '+33°C felett a munkáltató köteles védőitalt (víz, ásványvíz) biztosítani. A kiosztás helye a munkaterületi vízadagolóknál. Forróságban 2 órás szünetek jöhetnek szóba. Figyeld a hirdetőtáblát.',
   ARRAY['védőital', 'víz', 'meleg', 'hőség', 'forróság', 'nyár'], 5),

  (v_contractor_id, v_cat_egeszseg, 'Hogyan kérhetek szemüveg támogatást?',
   'Ha a munkád képernyő előtt végzed (napi 4+ óra), kérhetsz szemüveg támogatást. A foglalkozás-egészségügyi orvos igazolásával max 50.000 Ft-ig támogatjuk. Kérelmet a HR-nél add le.',
   ARRAY['szemüveg', 'szem', 'látás', 'támogatás', 'monitor', 'képernyő'], 3),

  (v_contractor_id, v_cat_egeszseg, 'Van stresszkezelő program?',
   'Igen: 1) Heti relaxációs foglalkozás (szerda 17:00) 2) Pszichológiai tanácsadás (hétfő 14:00-18:00) 3) Stresszkezelő workshop negyedévente. Jelentkezés az alkalmazásban vagy a HR-nél. Minden ingyenes és bizalmas.',
   ARRAY['stressz', 'kiégés', 'mentális', 'egészség', 'relaxáció', 'jóga'], 5),

  (v_contractor_id, v_cat_egeszseg, 'Milyen védőfelszerelést kell viselnem?',
   'Munkaterülettől függ: 1) Alapfelszerelés: védőcipő, láthatósági mellény 2) Építkezésen: sisak, kesztyű 3) Vegyszereknél: védőszemüveg, maszk 4) Magasban: biztonsági hám. A pontos előírást a művezetőd mondja meg.',
   ARRAY['védőfelszerelés', 'sisak', 'kesztyű', 'cipő', 'mellény', 'biztonság'], 8),

  (v_contractor_id, v_cat_egeszseg, 'Mi a teendő fertőző betegség esetén?',
   'Fertőző betegség (Covid, influenza, stb.) esetén TILOS munkahelyre jönni. Azonnal értesítsd a művezetődet és menj orvoshoz. A karanténidőt a hatóság határozza meg. A táppénz jár a betegség idejére.',
   ARRAY['fertőző', 'betegség', 'Covid', 'influenza', 'karantén', 'járvány'], 10),

  (v_contractor_id, v_cat_egeszseg, 'Hol a legközelebbi kórház?',
   'A legközelebbi sürgősségi betegellátás: [város] Kórház Sürgősségi Osztály. Cím és telefonszám a szálláson és az alkalmazás Kapcsolatok/Vészhelyzet menüjében. Életveszélynél hívd a 112-t!',
   ARRAY['kórház', 'sürgősség', 'vészhelyzet', 'mentő', '112', 'orvos'], 10)

  ON CONFLICT DO NOTHING;

  -- ========== Chatbot config ==========
  INSERT INTO chatbot_config (contractor_id, welcome_message, fallback_message, escalation_message, keyword_threshold)
  VALUES (
    v_contractor_id,
    'Üdvözlöm! Miben segíthetek? Kérdezzen bátran szabadsággal, fizetéssel, szállással vagy bármilyen munkahelyi témával kapcsolatban.',
    'Sajnos erre a kérdésre nem találtam választ az adatbázisomban. Szeretné, ha továbbítanám kérdését egy HR munkatársnak?',
    'Kérdését továbbítottam a HR csapatnak hibajegy formájában. Hamarosan felvesszük Önnel a kapcsolatot. A hibajegy számát üzenetben megkapja.',
    1
  )
  ON CONFLICT (contractor_id) DO UPDATE SET
    welcome_message = EXCLUDED.welcome_message,
    fallback_message = EXCLUDED.fallback_message,
    escalation_message = EXCLUDED.escalation_message;

  RAISE NOTICE 'Chatbot FAQ seed completed for contractor %', v_contractor_id;
END $$;
