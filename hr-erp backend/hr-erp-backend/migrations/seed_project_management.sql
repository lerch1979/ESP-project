-- ============================================
-- Seed data for Project Management System
-- ============================================

-- Get first available contractor, user IDs and cost center for seeding
DO $$
DECLARE
  v_contractor_id UUID;
  v_user1_id UUID;
  v_user2_id UUID;
  v_user3_id UUID;
  v_cost_center_id UUID;
  v_project1_id UUID;
  v_project2_id UUID;
  v_project3_id UUID;
  v_project4_id UUID;
  v_project5_id UUID;
  v_task_id UUID;
  v_prev_task_id UUID;
BEGIN
  -- Get contractor
  SELECT id INTO v_contractor_id FROM contractors LIMIT 1;
  IF v_contractor_id IS NULL THEN
    RAISE NOTICE 'No contractors found, skipping seed';
    RETURN;
  END IF;

  -- Get users
  SELECT id INTO v_user1_id FROM users WHERE contractor_id = v_contractor_id AND is_active = true ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user2_id FROM users WHERE contractor_id = v_contractor_id AND is_active = true AND id != v_user1_id ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user3_id FROM users WHERE contractor_id = v_contractor_id AND is_active = true AND id != v_user1_id AND id != v_user2_id ORDER BY created_at LIMIT 1;

  -- Fallback: use same user if only one exists
  IF v_user2_id IS NULL THEN v_user2_id := v_user1_id; END IF;
  IF v_user3_id IS NULL THEN v_user3_id := v_user1_id; END IF;

  -- Get cost center
  SELECT id INTO v_cost_center_id FROM cost_centers LIMIT 1;

  -- ============================================
  -- PROJECT 1: HR Rendszer Fejlesztés (Active)
  -- ============================================
  INSERT INTO projects (id, name, code, description, start_date, end_date, status, priority, budget, actual_cost, completion_percentage, cost_center_id, project_manager_id, contractor_id, created_by)
  VALUES (
    uuid_generate_v4(), 'HR Rendszer Fejlesztés', 'HR-DEV-2026',
    'Belső HR rendszer modernizálása és új funkciók fejlesztése',
    '2026-01-15', '2026-06-30', 'active', 'high',
    5000000, 1800000, 35, v_cost_center_id, v_user1_id, v_contractor_id, v_user1_id
  ) RETURNING id INTO v_project1_id;

  -- Team members
  INSERT INTO project_team_members (project_id, user_id, role) VALUES
    (v_project1_id, v_user1_id, 'project_manager'),
    (v_project1_id, v_user2_id, 'developer'),
    (v_project1_id, v_user3_id, 'developer')
  ON CONFLICT DO NOTHING;

  -- Tasks for Project 1
  INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, start_date, due_date, estimated_hours, actual_hours, progress, tags, contractor_id, created_by)
  VALUES (v_project1_id, 'Követelmény specifikáció', 'Részletes követelmények összegyűjtése és dokumentálása', 'done', 'high', v_user1_id, '2026-01-15', '2026-01-31', 40, 38, 100, ARRAY['docs','planning'], v_contractor_id, v_user1_id)
  RETURNING id INTO v_prev_task_id;

  INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, start_date, due_date, estimated_hours, actual_hours, progress, tags, contractor_id, created_by)
  VALUES (v_project1_id, 'Adatbázis tervezés', 'Adatmodell és migrációk készítése', 'done', 'high', v_user2_id, '2026-02-01', '2026-02-14', 30, 32, 100, ARRAY['database','backend'], v_contractor_id, v_user1_id)
  RETURNING id INTO v_task_id;

  INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type) VALUES (v_task_id, v_prev_task_id, 'finish_to_start');
  v_prev_task_id := v_task_id;

  INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, start_date, due_date, estimated_hours, actual_hours, progress, tags, contractor_id, created_by)
  VALUES (v_project1_id, 'Backend API fejlesztés', 'REST API endpointok implementálása', 'in_progress', 'high', v_user2_id, '2026-02-15', '2026-03-31', 80, 35, 45, ARRAY['backend','api'], v_contractor_id, v_user1_id)
  RETURNING id INTO v_task_id;

  INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type) VALUES (v_task_id, v_prev_task_id, 'finish_to_start');

  -- Subtasks for Backend API fejlesztés
  INSERT INTO tasks (project_id, parent_task_id, title, status, priority, assigned_to, estimated_hours, actual_hours, progress, tags, contractor_id, created_by) VALUES
    (v_project1_id, v_task_id, 'Auth modul implementálása', 'done', 'high', v_user2_id, 16, 14, 100, ARRAY['auth'], v_contractor_id, v_user1_id),
    (v_project1_id, v_task_id, 'Employee CRUD endpointok', 'done', 'medium', v_user2_id, 20, 18, 100, ARRAY['crud'], v_contractor_id, v_user1_id),
    (v_project1_id, v_task_id, 'Report generálás API', 'in_progress', 'medium', v_user3_id, 24, 10, 40, ARRAY['reports'], v_contractor_id, v_user1_id),
    (v_project1_id, v_task_id, 'Export funkciók', 'todo', 'low', v_user3_id, 20, 0, 0, ARRAY['export'], v_contractor_id, v_user1_id);

  INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, start_date, due_date, estimated_hours, progress, tags, contractor_id, created_by) VALUES
    (v_project1_id, 'Frontend fejlesztés', 'React frontend komponensek', 'in_progress', 'high', v_user3_id, '2026-02-20', '2026-04-30', 120, 20, ARRAY['frontend','react'], v_contractor_id, v_user1_id),
    (v_project1_id, 'Tesztelés', 'Unit és integrációs tesztek', 'todo', 'medium', v_user2_id, '2026-04-01', '2026-05-15', 60, 0, ARRAY['testing'], v_contractor_id, v_user1_id),
    (v_project1_id, 'Dokumentáció', 'API és felhasználói dokumentáció', 'todo', 'low', v_user1_id, '2026-05-01', '2026-06-15', 30, 0, ARRAY['docs'], v_contractor_id, v_user1_id),
    (v_project1_id, 'UAT és élesítés', 'Felhasználói tesztelés és deployment', 'todo', 'high', v_user1_id, '2026-06-01', '2026-06-30', 40, 0, ARRAY['deployment'], v_contractor_id, v_user1_id),
    (v_project1_id, 'Teljesítmény optimalizálás', 'DB lekérdezések és API válaszidők optimalizálása', 'todo', 'medium', v_user2_id, '2026-05-15', '2026-06-15', 25, 0, ARRAY['optimization'], v_contractor_id, v_user1_id),
    (v_project1_id, 'Biztonsági audit', 'OWASP alapú biztonsági ellenőrzés', 'todo', 'critical', v_user1_id, '2026-06-01', '2026-06-20', 20, 0, ARRAY['security'], v_contractor_id, v_user1_id);

  -- ============================================
  -- PROJECT 2: Iroda Felújítás (Active)
  -- ============================================
  INSERT INTO projects (id, name, code, description, start_date, end_date, status, priority, budget, actual_cost, completion_percentage, cost_center_id, project_manager_id, contractor_id, created_by)
  VALUES (
    uuid_generate_v4(), 'Iroda Felújítás', 'OFF-REN-2026',
    'Központi iroda felújítása és modern munkakörnyezet kialakítása',
    '2026-02-01', '2026-05-31', 'active', 'medium',
    12000000, 4500000, 30, v_cost_center_id, v_user1_id, v_contractor_id, v_user1_id
  ) RETURNING id INTO v_project2_id;

  INSERT INTO project_team_members (project_id, user_id, role) VALUES
    (v_project2_id, v_user1_id, 'project_manager'),
    (v_project2_id, v_user2_id, 'coordinator')
  ON CONFLICT DO NOTHING;

  INSERT INTO tasks (project_id, title, description, status, priority, assigned_to, start_date, due_date, estimated_hours, actual_hours, progress, contractor_id, created_by) VALUES
    (v_project2_id, 'Tervek elkészítése', 'Építészeti és belsőépítészeti tervek', 'done', 'high', v_user1_id, '2026-02-01', '2026-02-15', 30, 28, 100, v_contractor_id, v_user1_id),
    (v_project2_id, 'Engedélyek beszerzése', 'Szükséges építési engedélyek', 'done', 'high', v_user1_id, '2026-02-10', '2026-02-28', 20, 22, 100, v_contractor_id, v_user1_id),
    (v_project2_id, 'Bontási munkálatok', 'Régi berendezések és falak bontása', 'in_progress', 'medium', v_user2_id, '2026-03-01', '2026-03-15', 40, 15, 40, v_contractor_id, v_user1_id),
    (v_project2_id, 'Elektromos hálózat', 'Teljes elektromos hálózat felújítása', 'todo', 'high', v_user2_id, '2026-03-10', '2026-03-31', 60, 0, 0, v_contractor_id, v_user1_id),
    (v_project2_id, 'Festés és burkolás', 'Falak festése és padlóburkolat cseréje', 'todo', 'medium', v_user2_id, '2026-04-01', '2026-04-20', 50, 0, 0, v_contractor_id, v_user1_id),
    (v_project2_id, 'Bútorok beszerzése', 'Irodai bútorok rendelése és beszerelése', 'todo', 'medium', v_user1_id, '2026-03-15', '2026-04-30', 20, 0, 0, v_contractor_id, v_user1_id),
    (v_project2_id, 'IT infrastruktúra', 'Hálózat és szerverszoba kiépítése', 'todo', 'high', v_user3_id, '2026-04-15', '2026-05-10', 45, 0, 0, v_contractor_id, v_user1_id),
    (v_project2_id, 'Klíma telepítés', 'Klímaberendezések telepítése', 'todo', 'medium', v_user2_id, '2026-04-20', '2026-05-05', 25, 0, 0, v_contractor_id, v_user1_id),
    (v_project2_id, 'Tűzvédelmi rendszer', 'Tűzjelző és sprinkler rendszer', 'todo', 'critical', v_user2_id, '2026-04-01', '2026-04-25', 30, 0, 0, v_contractor_id, v_user1_id),
    (v_project2_id, 'Végső átvétel', 'Munkálatok átvétele és dokumentálás', 'todo', 'high', v_user1_id, '2026-05-15', '2026-05-31', 15, 0, 0, v_contractor_id, v_user1_id);

  -- ============================================
  -- PROJECT 3: Marketing Kampány (Planning)
  -- ============================================
  INSERT INTO projects (id, name, code, description, start_date, end_date, status, priority, budget, actual_cost, completion_percentage, project_manager_id, contractor_id, created_by)
  VALUES (
    uuid_generate_v4(), 'Q2 Marketing Kampány', 'MKT-Q2-2026',
    'Második negyedéves marketing kampány tervezése és végrehajtása',
    '2026-04-01', '2026-06-30', 'planning', 'medium',
    3000000, 0, 0, v_user1_id, v_contractor_id, v_user1_id
  ) RETURNING id INTO v_project3_id;

  INSERT INTO project_team_members (project_id, user_id, role) VALUES
    (v_project3_id, v_user1_id, 'project_manager')
  ON CONFLICT DO NOTHING;

  INSERT INTO tasks (project_id, title, status, priority, assigned_to, start_date, due_date, estimated_hours, contractor_id, created_by) VALUES
    (v_project3_id, 'Kampány stratégia kidolgozása', 'todo', 'high', v_user1_id, '2026-04-01', '2026-04-10', 20, v_contractor_id, v_user1_id),
    (v_project3_id, 'Célcsoport elemzés', 'todo', 'high', v_user1_id, '2026-04-05', '2026-04-15', 15, v_contractor_id, v_user1_id),
    (v_project3_id, 'Kreatív anyagok készítése', 'todo', 'medium', v_user2_id, '2026-04-15', '2026-05-05', 40, v_contractor_id, v_user1_id),
    (v_project3_id, 'Social media tartalom', 'todo', 'medium', v_user3_id, '2026-04-20', '2026-06-15', 50, v_contractor_id, v_user1_id),
    (v_project3_id, 'Email kampány beállítás', 'todo', 'medium', v_user2_id, '2026-04-25', '2026-05-10', 20, v_contractor_id, v_user1_id),
    (v_project3_id, 'PPC hirdetések', 'todo', 'high', v_user1_id, '2026-05-01', '2026-06-20', 30, v_contractor_id, v_user1_id),
    (v_project3_id, 'Eredmények elemzése', 'todo', 'medium', v_user1_id, '2026-06-15', '2026-06-30', 15, v_contractor_id, v_user1_id),
    (v_project3_id, 'Landing page készítés', 'todo', 'high', v_user3_id, '2026-04-10', '2026-04-25', 30, v_contractor_id, v_user1_id),
    (v_project3_id, 'SEO optimalizálás', 'todo', 'medium', v_user2_id, '2026-04-15', '2026-05-15', 25, v_contractor_id, v_user1_id),
    (v_project3_id, 'Influencer együttműködések', 'todo', 'low', v_user1_id, '2026-05-01', '2026-06-15', 20, v_contractor_id, v_user1_id);

  -- ============================================
  -- PROJECT 4: Belső Képzési Program (Completed)
  -- ============================================
  INSERT INTO projects (id, name, code, description, start_date, end_date, status, priority, budget, actual_cost, completion_percentage, project_manager_id, contractor_id, created_by)
  VALUES (
    uuid_generate_v4(), 'Belső Képzési Program', 'TRAIN-2025',
    '2025-ös évi belső szakmai képzési program lebonyolítása',
    '2025-09-01', '2025-12-15', 'completed', 'medium',
    2000000, 1850000, 100, v_user1_id, v_contractor_id, v_user1_id
  ) RETURNING id INTO v_project4_id;

  INSERT INTO tasks (project_id, title, status, priority, assigned_to, start_date, due_date, estimated_hours, actual_hours, progress, completed_at, contractor_id, created_by) VALUES
    (v_project4_id, 'Képzési igényfelmérés', 'done', 'high', v_user1_id, '2025-09-01', '2025-09-15', 15, 12, 100, '2025-09-14', v_contractor_id, v_user1_id),
    (v_project4_id, 'Tananyag fejlesztés', 'done', 'high', v_user2_id, '2025-09-15', '2025-10-15', 40, 45, 100, '2025-10-16', v_contractor_id, v_user1_id),
    (v_project4_id, 'Előadók felkérése', 'done', 'medium', v_user1_id, '2025-09-20', '2025-10-05', 10, 8, 100, '2025-10-03', v_contractor_id, v_user1_id),
    (v_project4_id, 'Helyszín és logisztika', 'done', 'medium', v_user3_id, '2025-10-01', '2025-10-20', 15, 14, 100, '2025-10-19', v_contractor_id, v_user1_id),
    (v_project4_id, 'Résztvevők regisztrálása', 'done', 'medium', v_user1_id, '2025-10-15', '2025-10-31', 10, 8, 100, '2025-10-30', v_contractor_id, v_user1_id),
    (v_project4_id, 'Képzések lebonyolítása', 'done', 'high', v_user2_id, '2025-11-01', '2025-11-30', 60, 58, 100, '2025-11-28', v_contractor_id, v_user1_id),
    (v_project4_id, 'Értékelés és visszajelzés', 'done', 'medium', v_user1_id, '2025-12-01', '2025-12-10', 10, 10, 100, '2025-12-09', v_contractor_id, v_user1_id),
    (v_project4_id, 'Zárójelentés készítése', 'done', 'low', v_user1_id, '2025-12-05', '2025-12-15', 8, 7, 100, '2025-12-14', v_contractor_id, v_user1_id),
    (v_project4_id, 'Tanúsítványok kiadása', 'done', 'medium', v_user3_id, '2025-12-10', '2025-12-15', 5, 4, 100, '2025-12-13', v_contractor_id, v_user1_id),
    (v_project4_id, 'Online tananyag archiválás', 'done', 'low', v_user2_id, '2025-12-05', '2025-12-15', 8, 6, 100, '2025-12-12', v_contractor_id, v_user1_id);

  -- ============================================
  -- PROJECT 5: Ügyfél Portál (On Hold)
  -- ============================================
  INSERT INTO projects (id, name, code, description, start_date, end_date, status, priority, budget, actual_cost, completion_percentage, project_manager_id, contractor_id, created_by)
  VALUES (
    uuid_generate_v4(), 'Ügyfél Portál Fejlesztés', 'PORTAL-2026',
    'Ügyfél self-service portál fejlesztése',
    '2026-01-10', '2026-08-31', 'on_hold', 'low',
    8000000, 900000, 12, v_user2_id, v_contractor_id, v_user1_id
  ) RETURNING id INTO v_project5_id;

  INSERT INTO project_team_members (project_id, user_id, role) VALUES
    (v_project5_id, v_user2_id, 'project_manager'),
    (v_project5_id, v_user3_id, 'developer')
  ON CONFLICT DO NOTHING;

  INSERT INTO tasks (project_id, title, status, priority, assigned_to, start_date, due_date, estimated_hours, actual_hours, progress, contractor_id, created_by) VALUES
    (v_project5_id, 'Piackutatás és versenytárs elemzés', 'done', 'high', v_user2_id, '2026-01-10', '2026-01-25', 20, 18, 100, v_contractor_id, v_user1_id),
    (v_project5_id, 'UX kutatás és wireframe', 'in_progress', 'high', v_user3_id, '2026-01-20', '2026-02-10', 30, 12, 40, v_contractor_id, v_user1_id),
    (v_project5_id, 'Technológia kiválasztás', 'done', 'high', v_user2_id, '2026-01-15', '2026-01-30', 10, 10, 100, v_contractor_id, v_user1_id),
    (v_project5_id, 'Backend architektúra', 'blocked', 'high', v_user2_id, '2026-02-01', '2026-03-15', 60, 0, 0, v_contractor_id, v_user1_id),
    (v_project5_id, 'Frontend implementáció', 'blocked', 'high', v_user3_id, '2026-02-15', '2026-04-30', 100, 0, 0, v_contractor_id, v_user1_id),
    (v_project5_id, 'Regisztrációs modul', 'todo', 'medium', v_user3_id, '2026-03-01', '2026-03-20', 30, 0, 0, v_contractor_id, v_user1_id),
    (v_project5_id, 'Fizetési integráció', 'todo', 'high', v_user2_id, '2026-04-01', '2026-05-15', 50, 0, 0, v_contractor_id, v_user1_id),
    (v_project5_id, 'Dokumentum kezelés', 'todo', 'medium', v_user3_id, '2026-05-01', '2026-06-15', 40, 0, 0, v_contractor_id, v_user1_id),
    (v_project5_id, 'Tesztelés és QA', 'todo', 'high', v_user2_id, '2026-06-01', '2026-07-31', 50, 0, 0, v_contractor_id, v_user1_id),
    (v_project5_id, 'Deploy és go-live', 'todo', 'critical', v_user2_id, '2026-08-01', '2026-08-31', 30, 0, 0, v_contractor_id, v_user1_id);

  -- ============================================
  -- Sample Comments
  -- ============================================
  INSERT INTO task_comments (task_id, user_id, comment)
  SELECT t.id, v_user1_id, 'Ez a feladat kiemelt prioritású, kérlek az ütemterv szerint haladjunk.'
  FROM tasks t WHERE t.project_id = v_project1_id AND t.title = 'Backend API fejlesztés' LIMIT 1;

  INSERT INTO task_comments (task_id, user_id, comment)
  SELECT t.id, v_user2_id, 'Az auth modul elkészült, most a CRUD endpointokon dolgozom.'
  FROM tasks t WHERE t.project_id = v_project1_id AND t.title = 'Backend API fejlesztés' LIMIT 1;

  INSERT INTO task_comments (task_id, user_id, comment)
  SELECT t.id, v_user1_id, 'A bontási munkák az ütemterv szerint haladnak.'
  FROM tasks t WHERE t.project_id = v_project2_id AND t.title = 'Bontási munkálatok' LIMIT 1;

  -- ============================================
  -- Sample Timesheets
  -- ============================================
  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user2_id, 8, '2026-02-17', 'API endpointok tervezése'
  FROM tasks t WHERE t.project_id = v_project1_id AND t.title = 'Backend API fejlesztés' LIMIT 1;

  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user2_id, 7.5, '2026-02-18', 'Auth middleware implementálás'
  FROM tasks t WHERE t.project_id = v_project1_id AND t.title = 'Backend API fejlesztés' LIMIT 1;

  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user2_id, 6, '2026-02-19', 'Employee CRUD endpointok'
  FROM tasks t WHERE t.project_id = v_project1_id AND t.title = 'Backend API fejlesztés' LIMIT 1;

  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user3_id, 8, '2026-02-20', 'React komponensek tervezése'
  FROM tasks t WHERE t.project_id = v_project1_id AND t.title = 'Frontend fejlesztés' LIMIT 1;

  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user3_id, 7, '2026-02-21', 'Dashboard layout implementálás'
  FROM tasks t WHERE t.project_id = v_project1_id AND t.title = 'Frontend fejlesztés' LIMIT 1;

  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user2_id, 6, '2026-02-20', 'Bontási munkák felügyelete'
  FROM tasks t WHERE t.project_id = v_project2_id AND t.title = 'Bontási munkálatok' LIMIT 1;

  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user2_id, 8, '2026-02-21', 'Villamossági tervek egyeztetése'
  FROM tasks t WHERE t.project_id = v_project2_id AND t.title = 'Bontási munkálatok' LIMIT 1;

  INSERT INTO timesheets (task_id, user_id, hours, work_date, description)
  SELECT t.id, v_user1_id, 5, '2026-02-15', 'Tervek véglegesítése'
  FROM tasks t WHERE t.project_id = v_project2_id AND t.title = 'Tervek elkészítése' LIMIT 1;

  RAISE NOTICE 'Project management seed data created successfully';
END $$;
