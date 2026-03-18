-- ============================================================================
-- Comprehensive Seed Data for HR-ERP Platform
-- Populates: Accommodations, Rooms, Employees, FAQ, Calendar, Scheduled Reports
-- Idempotent: safe to re-run
-- ============================================================================

DO $$
DECLARE
  v_abc_id UUID;
  v_xyz_id UUID;
  v_epito_id UUID;
  v_admin_id UUID;
  v_kiss_id UUID;
  v_nagy_id UUID;
  v_szabo_b_id UUID;
  v_toth_id UUID;
  v_kovacs_id UUID;
  v_szabo_m_id UUID;
  v_farkas_id UUID;
  v_horvath_id UUID;
  v_molnar_id UUID;
  v_varga_id UUID;
  v_acc1_id UUID;
  v_acc2_id UUID;
  v_acc3_id UUID;
  v_acc4_id UUID;
  v_active_status UUID;
  v_paid_leave_status UUID;
  v_emp1_id UUID;
  v_emp2_id UUID;
BEGIN
  -- Get contractor IDs
  SELECT id INTO v_abc_id FROM contractors WHERE slug = 'abc-kft';
  SELECT id INTO v_xyz_id FROM contractors WHERE slug = 'xyz-zrt';
  SELECT id INTO v_epito_id FROM contractors WHERE slug = 'abc-epito-kft';

  -- Get user IDs
  SELECT id INTO v_admin_id FROM users WHERE email = 'admin@hr-erp.com';
  SELECT id INTO v_kiss_id FROM users WHERE email = 'kiss.janos@abc-kft.hu';
  SELECT id INTO v_nagy_id FROM users WHERE email = 'nagy.eva@abc-kft.hu';
  SELECT id INTO v_szabo_b_id FROM users WHERE email = 'szabo.bela@abc-kft.hu';
  SELECT id INTO v_toth_id FROM users WHERE email = 'toth.anna@abc-kft.hu';
  SELECT id INTO v_kovacs_id FROM users WHERE email = 'kovacs.peter@xyz-zrt.hu';
  SELECT id INTO v_szabo_m_id FROM users WHERE email = 'szabo.maria@xyz-zrt.hu';
  SELECT id INTO v_farkas_id FROM users WHERE email = 'farkas.katalin@employee.com';
  SELECT id INTO v_horvath_id FROM users WHERE email = 'horvath.gabor@employee.com';
  SELECT id INTO v_molnar_id FROM users WHERE email = 'molnar.zsuzsanna@employee.com';
  SELECT id INTO v_varga_id FROM users WHERE email = 'varga.istvan@employee.com';

  -- Get employee status types
  SELECT id INTO v_active_status FROM employee_status_types WHERE slug = 'active';
  SELECT id INTO v_paid_leave_status FROM employee_status_types WHERE slug = 'paid_leave';

  -- ========== 1. ACCOMMODATIONS (Szálláshelyek) ==========
  RAISE NOTICE 'Seeding accommodations...';

  INSERT INTO accommodations (id, name, address, type, capacity, current_contractor_id, status, monthly_rent, notes, is_active)
  VALUES
    (gen_random_uuid(), 'Budapest - Dózsa György út 42', 'Budapest, XIII. kerület, Dózsa György út 42.', 'apartment', 6, v_abc_id, 'occupied', 180000, '3 szobás lakás, felújított', true),
    (gen_random_uuid(), 'Budapest - Váci út 15', 'Budapest, XIII. kerület, Váci út 15.', 'apartment', 4, v_abc_id, 'occupied', 150000, '2 szobás lakás, központi helyen', true),
    (gen_random_uuid(), 'Debrecen - Kossuth u. 8', 'Debrecen, 4025 Kossuth u. 8.', 'house', 8, v_xyz_id, 'occupied', 220000, 'Családi ház, 4 szoba', true),
    (gen_random_uuid(), 'Győr - Baross u. 22', 'Győr, 9021 Baross u. 22.', 'studio', 2, v_epito_id, 'available', 90000, 'Garzonlakás, bútorozott', true),
    (gen_random_uuid(), 'Pécs - Rákóczi út 55', 'Pécs, 7621 Rákóczi út 55.', 'apartment', 4, NULL, 'maintenance', 130000, 'Felújítás alatt', true),
    (gen_random_uuid(), 'Szeged - Tisza Lajos krt. 3', 'Szeged, 6720 Tisza Lajos krt. 3.', 'apartment', 3, v_abc_id, 'occupied', 120000, '1.5 szobás, jó állapotú', true)
  ON CONFLICT DO NOTHING;

  -- Get accommodation IDs for rooms
  SELECT id INTO v_acc1_id FROM accommodations WHERE name LIKE '%Dózsa%' LIMIT 1;
  SELECT id INTO v_acc2_id FROM accommodations WHERE name LIKE '%Váci%' LIMIT 1;
  SELECT id INTO v_acc3_id FROM accommodations WHERE name LIKE '%Debrecen%' LIMIT 1;
  SELECT id INTO v_acc4_id FROM accommodations WHERE name LIKE '%Győr%' LIMIT 1;

  -- ========== 2. ACCOMMODATION ROOMS (Szobák) ==========
  RAISE NOTICE 'Seeding rooms...';

  IF v_acc1_id IS NOT NULL THEN
    INSERT INTO accommodation_rooms (accommodation_id, room_number, beds)
    VALUES
      (v_acc1_id, 'A-101', 2),
      (v_acc1_id, 'A-102', 2),
      (v_acc1_id, 'A-103', 2)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_acc2_id IS NOT NULL THEN
    INSERT INTO accommodation_rooms (accommodation_id, room_number, beds)
    VALUES
      (v_acc2_id, 'B-201', 2),
      (v_acc2_id, 'B-202', 2)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_acc3_id IS NOT NULL THEN
    INSERT INTO accommodation_rooms (accommodation_id, room_number, beds)
    VALUES
      (v_acc3_id, 'C-301', 2),
      (v_acc3_id, 'C-302', 2),
      (v_acc3_id, 'C-303', 2),
      (v_acc3_id, 'C-304', 2)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_acc4_id IS NOT NULL THEN
    INSERT INTO accommodation_rooms (accommodation_id, room_number, beds)
    VALUES
      (v_acc4_id, 'D-401', 2)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ========== 3. EMPLOYEES (Szállásolt munkavállalók) ==========
  RAISE NOTICE 'Seeding employees...';

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date, accommodation_id)
  SELECT v_abc_id, v_toth_id, 'EMP-0001', v_active_status, 'Adminisztrátor', '2025-06-01', v_acc1_id
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_toth_id) AND v_toth_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date, accommodation_id)
  SELECT v_abc_id, v_nagy_id, 'EMP-0002', v_active_status, 'HR koordinátor', '2025-03-15', v_acc1_id
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_nagy_id) AND v_nagy_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date, accommodation_id)
  SELECT v_abc_id, v_szabo_b_id, 'EMP-0003', v_active_status, 'Karbantartó', '2025-01-10', v_acc2_id
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_szabo_b_id) AND v_szabo_b_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date, accommodation_id)
  SELECT v_xyz_id, v_kovacs_id, 'EMP-0004', v_active_status, 'Villanyszerelő', '2024-11-01', v_acc3_id
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_kovacs_id) AND v_kovacs_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date, accommodation_id)
  SELECT v_xyz_id, v_szabo_m_id, 'EMP-0005', v_paid_leave_status, 'Takarító', '2025-02-20', v_acc3_id
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_szabo_m_id) AND v_szabo_m_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date, accommodation_id)
  SELECT v_abc_id, v_farkas_id, 'EMP-0006', v_active_status, 'Recepciós', '2025-04-01', v_acc2_id
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_farkas_id) AND v_farkas_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date)
  SELECT v_abc_id, v_horvath_id, 'EMP-0007', v_active_status, 'Festő', '2025-07-15'
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_horvath_id) AND v_horvath_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date)
  SELECT v_xyz_id, v_molnar_id, 'EMP-0008', v_active_status, 'Pénzügyi asszisztens', '2025-05-01'
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_molnar_id) AND v_molnar_id IS NOT NULL;

  INSERT INTO employees (contractor_id, user_id, employee_number, status_id, position, start_date, accommodation_id)
  SELECT v_epito_id, v_varga_id, 'EMP-0009', v_active_status, 'Kőműves', '2024-09-01', v_acc3_id
  WHERE NOT EXISTS (SELECT 1 FROM employees WHERE user_id = v_varga_id) AND v_varga_id IS NOT NULL;

  -- ========== 4. FAQ CATEGORIES + KNOWLEDGE BASE ==========
  RAISE NOTICE 'Seeding FAQ...';

  DELETE FROM chatbot_faq_categories WHERE contractor_id = v_abc_id;
  INSERT INTO chatbot_faq_categories (contractor_id, name, slug, description, icon, color, sort_order)
  VALUES
    (v_abc_id, 'Szabadság & Távollét', 'szabadsag', 'Szabadság igénylés, betegszabadság', 'calendar', '#10b981', 1),
    (v_abc_id, 'Fizetés & Juttatások', 'fizetes', 'Bérszámfejtés, juttatások, adózás', 'wallet', '#f59e0b', 2),
    (v_abc_id, 'Lakás & Szállás', 'lakas', 'Szálláshely szabályok, karbantartás', 'home', '#3b82f6', 3),
    (v_abc_id, 'Egészség & Biztonság', 'egeszseg', 'Orvosi ellátás, munkabiztonság', 'medkit', '#ef4444', 4),
    (v_abc_id, 'Munkaviszony', 'munka', 'Szerződés, munkaidő, túlóra', 'briefcase', '#8b5cf6', 5),
    (v_abc_id, 'Szabályzatok', 'szabalyok', 'Házirendek, viselkedési kódex', 'document-text', '#6b7280', 6),
    (v_abc_id, 'Onboarding', 'onboarding', 'Beilleszkedés, első napok', 'rocket', '#ec4899', 7),
    (v_abc_id, 'Technikai segítség', 'technikai', 'IT, applikáció, jelszó', 'settings', '#06b6d4', 8);

  -- Insert FAQ entries into knowledge_base
  INSERT INTO chatbot_knowledge_base (contractor_id, category_id, question, answer, keywords, priority)
  SELECT v_abc_id, c.id, q.question, q.answer, string_to_array(q.keywords, ', '), q.priority
  FROM chatbot_faq_categories c
  CROSS JOIN (VALUES
    ('szabadsag', 'Hány nap szabadság jár nekem?', 'Évi 20 munkanap alapszabadság jár, amely az életkor szerint növekszik. 25 év felett +1, 28 év felett +2, 31 év felett +3 nap. A szabadságot a HR koordinátorodtól igényelheted, legalább 3 munkanappal előre.', 'szabadság, nap, igénylés, éves', 10),
    ('szabadsag', 'Hogyan igényeljek betegszabadságot?', 'Betegség esetén a lehető leghamarabb értesítsd a közvetlen felettesed és a HR-t. Az orvosi igazolást 3 munkanapon belül küldd el. Betegszabadság az első 15 napban a munkáltató fizeti (70%).', 'betegszabadság, beteg, orvos, igazolás, táppénz', 10),
    ('szabadsag', 'Mi a távmunka szabályzat?', 'Jelenleg heti 2 nap távmunka engedélyezett az irodai pozíciókban, előzetes egyeztetéssel. A kérelmet a HR rendszeren keresztül kell benyújtani, minimum 2 nappal előre.', 'távmunka, home office, otthoni munka', 8),
    ('fizetes', 'Mikor érkezik a fizetésem?', 'A munkabér minden hónap 10-ig kerül átutalásra a megadott bankszámlára. Ha a 10-e hétvégére vagy ünnepnapra esik, az azt megelőző munkanapra.', 'fizetés, bér, átutalás, bankszámla, mikor', 10),
    ('fizetes', 'Hogyan nézzem meg a fizetési papíromat?', 'A bérjegyzéket a HR-ERP rendszeren keresztül érheted el: Dokumentumok → Fizetési papírok. PDF formátumban letöltheted vagy kinyomtathatod.', 'bérjegyzék, fizetési papír, bérlap', 9),
    ('fizetes', 'Milyen juttatások járnak?', 'Cafeteria keret: havi 15.000 Ft SZÉP kártyára. Étkezési hozzájárulás: napi 1.000 Ft. Közlekedési támogatás igényelhető. Éves bónusz a teljesítmény alapján.', 'juttatás, cafeteria, SZÉP, étkezés, bónusz', 9),
    ('lakas', 'Mi a szálláshely házirendje?', 'Csend 22:00-06:00 között. Vendég fogadása előzetes bejelentés után. Közös helyiségek tisztán tartása kötelező. Dohányzás kizárólag a kijelölt helyen. Háziállat nem tartható.', 'házirend, szállás, szabály, csend', 10),
    ('lakas', 'Hogyan jelentsek be karbantartási igényt?', 'A HR-ERP alkalmazásban: Ticketek → Új ticket → Kategória: Karbantartás. Részletes leírással és fotóval kérjük. Sürgős esetben (víz, gáz, áram): hívd a +36 1 555 0099-et.', 'karbantartás, javítás, bejelentés, hiba, ticket', 10),
    ('lakas', 'Mikor van takarítás a szálláson?', 'Hétfőn és csütörtökön 9:00-15:00 között. Közös helyiségek naponta takarítva. A szobádat te tartod rendben. Ágyneműcsere kéthetente, szerdánként.', 'takarítás, tisztaság, ágynemű', 8),
    ('egeszseg', 'Hol tudok orvoshoz menni?', 'Háziorvosi rendelés: H-P 8:00-12:00, Dr. Kovács, Budapest XIII. ker., Váci út 10. Foglalás: HR-ERP rendszeren keresztül vagy telefonon: +36 1 555 0123. Sürgősségi eset: 112.', 'orvos, rendelés, egészség, beteg, vizsgálat', 10),
    ('egeszseg', 'Van munkavédelmi oktatás?', 'Igen, minden új munkavállaló kötelező munkavédelmi oktatáson vesz részt az első héten. Évenként megismétlendő. Az oktatás a HR-ERP rendszerben is elérhető videó formátumban.', 'munkavédelem, oktatás, biztonság, kötelező', 9),
    ('munka', 'Mi a munkaidőm?', 'Alapmunkaidő: H-P 8:00-16:30, ebédszünet 12:00-12:30. Műszakos pozíciókban eltérő beosztás szerint. A pontos munkaidőt a munkaszerződésed tartalmazza.', 'munkaidő, óra, beosztás, műszak', 10),
    ('munka', 'Hogyan kérjek túlórát?', 'Túlóra csak előzetes felettesi jóváhagyással végezhető. A HR-ERP rendszerben a Munkaidő → Túlóra igénylés menüpontban. 50% pótlék hétköznap, 100% hétvégén és ünnepnap.', 'túlóra, pótlék, többletmunka', 9),
    ('szabalyok', 'Mi a dohányzási szabályzat?', 'Dohányzás kizárólag a kijelölt dohányzóhelyen engedélyezett. Az épületen belül és a bejárat 5 méteres körzetében tilos. E-cigaretta ugyanezen szabályok alá esik.', 'dohányzás, cigaretta, füstszünet', 8),
    ('onboarding', 'Mit kell hoznom az első napomon?', 'Személyi igazolvány vagy útlevél, lakcímkártya, TAJ kártya, adóigazolvány, bankszámlaszám, 1 db igazolványkép. A HR iroda mindent segít elintézni.', 'első nap, dokumentum, igazolvány, kezdés', 10),
    ('onboarding', 'Ki a mentorom?', 'Az első héten a HR koordinátorod mutat be mindent. Ezután a közvetlen felettesed lesz a mentorod. Kérdéseidet bármikor felteheted a HR-ERP chatbotnak is!', 'mentor, felettes, koordinátor, segítség', 8),
    ('technikai', 'Hogyan változtatom meg a jelszavam?', 'A HR-ERP alkalmazásban: Profil → Beállítások → Jelszó módosítás. Minimum 12 karakter, tartalmazzon kis- és nagybetűt, számot és speciális karaktert.', 'jelszó, módosítás, beállítás, profil', 10),
    ('technikai', 'Nem tudok bejelentkezni az alkalmazásba', 'Próbáld meg a jelszó visszaállítást a bejelentkezési oldalon. Ha nem sikerül, keresd az IT-t: it-support@example.com vagy a +36 1 555 0199 telefonszámon.', 'bejelentkezés, nem működik, hiba, IT', 10)
  ) AS q(cat_slug, question, answer, keywords, priority)
  WHERE c.slug = q.cat_slug AND c.contractor_id = v_abc_id
  ON CONFLICT DO NOTHING;

  -- ========== 5. CALENDAR / PERSONAL EVENTS ==========
  -- personal_events uses employee_id, event_date, event_type (birthday|meeting|reminder|holiday|other)
  RAISE NOTICE 'Seeding calendar events...';

  SELECT id INTO v_emp1_id FROM employees WHERE employee_number = 'EMP-0001';
  SELECT id INTO v_emp2_id FROM employees WHERE employee_number = 'EMP-0002';

  IF v_emp1_id IS NOT NULL THEN
      INSERT INTO personal_events (employee_id, event_date, event_time, event_type, title, description, all_day)
      VALUES
        (v_emp1_id, CURRENT_DATE + 1, '09:00', 'meeting', 'Heti HR megbeszélés', 'Heti rendszeres HR team meeting', false),
        (v_emp1_id, CURRENT_DATE + 3, '14:00', 'meeting', 'Munkavédelmi oktatás', 'Új munkavállalók számára', false),
        (v_emp1_id, CURRENT_DATE + 5, NULL, 'reminder', 'Havi zárás', 'Bérszámfejtés és jelentések', true),
        (v_emp1_id, CURRENT_DATE + 7, '10:00', 'other', 'Szállásellenőrzés - Budapest', 'Dózsa György út 42 ellenőrzés', false),
        (v_emp1_id, CURRENT_DATE + 14, NULL, 'other', 'Csapatépítő nap', 'Közös program a munkavállalóknak', true)
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_emp2_id IS NOT NULL THEN
      INSERT INTO personal_events (employee_id, event_date, event_time, event_type, title, description, all_day)
      VALUES
        (v_emp2_id, CURRENT_DATE + 2, '08:00', 'other', 'Orvosi vizsgálat', 'Éves kötelező szűrővizsgálat', false),
        (v_emp2_id, CURRENT_DATE + 21, NULL, 'holiday', 'Szabadság', 'Tervezett szabadság', true)
      ON CONFLICT DO NOTHING;
  END IF;

  -- ========== 6. SCHEDULED REPORTS ==========
  RAISE NOTICE 'Seeding scheduled reports...';

  INSERT INTO scheduled_reports (name, report_type, schedule_type, schedule_time, day_of_week, recipients, is_active, created_by)
  VALUES
    ('Heti foglaltság riport', 'occupancy', 'weekly', '08:00', 1, ARRAY['admin@hr-erp.com', 'kiss.janos@abc-kft.hu'], true, v_admin_id),
    ('Heti munkavállalói státusz', 'employees', 'weekly', '16:00', 5, ARRAY['admin@hr-erp.com', 'nagy.eva@abc-kft.hu'], true, v_admin_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO scheduled_reports (name, report_type, schedule_type, schedule_time, day_of_month, recipients, is_active, created_by)
  VALUES
    ('Havi ticket összesítő', 'tickets', 'monthly', '07:00', 1, ARRAY['admin@hr-erp.com'], true, v_admin_id),
    ('Havi költséghely összesítő', 'cost_centers', 'monthly', '09:00', 5, ARRAY['admin@hr-erp.com'], true, v_admin_id)
  ON CONFLICT DO NOTHING;

  -- ========== 7. CHATBOT CONFIG ==========
  RAISE NOTICE 'Seeding chatbot config...';

  INSERT INTO chatbot_config (contractor_id, welcome_message, fallback_message, escalation_message, keyword_threshold)
  VALUES (
    v_abc_id,
    'Üdvözöllek! 👋 Miben segíthetek ma?',
    'Sajnos nem találtam pontos választ. Szeretnéd, ha továbbítanám a kérdésedet egy HR munkatársnak?',
    'Kérdésedet továbbítottam a HR csapatnak. Hamarosan keresni fognak!',
    0.3
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ Comprehensive seed complete!';
END $$;
