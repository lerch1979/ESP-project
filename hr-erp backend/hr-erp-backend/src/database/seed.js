require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('./connection');
const { logger } = require('../utils/logger');

/**
 * Database seed — idempotent, safe to re-run.
 * Creates: contractors, users (admin/manager/employee), departments,
 *          tickets, projects, tasks, invoices, cost centers, salary bands.
 */
async function seedDatabase() {
  try {
    logger.info('🌱 Adatbázis seed indítása...');

    // ─── 1. Contractors ─────────────────────────────────────────────
    logger.info('Alvállalkozók...');
    await query(`
      INSERT INTO contractors (name, slug, email, phone, is_active)
      VALUES
        ('ABC Kereskedelmi Kft.', 'abc-kft', 'info@abc-kft.hu', '+36 1 234 5678', true),
        ('XYZ Szolgáltató Zrt.', 'xyz-zrt', 'info@xyz-zrt.hu', '+36 1 987 6543', true)
      ON CONFLICT (slug) DO NOTHING
    `);

    const contractorResult = await query(`SELECT id, slug FROM contractors WHERE slug IN ('abc-kft', 'xyz-zrt') ORDER BY slug`);
    const contractor1Id = contractorResult.rows.find(t => t.slug === 'abc-kft').id;
    const contractor2Id = contractorResult.rows.find(t => t.slug === 'xyz-zrt').id;
    logger.info(`✓ Alvállalkozók (${contractorResult.rows.length})`);

    // ─── 2. Roles ───────────────────────────────────────────────────
    await query(`
      INSERT INTO roles (name, slug, description, is_system)
      VALUES ('Szállásolt Munkavállaló', 'accommodated_employee', 'Szállásolt munkavállaló', true)
      ON CONFLICT (slug) DO NOTHING
    `);

    const rolesResult = await query('SELECT id, slug FROM roles');
    const roles = {};
    rolesResult.rows.forEach(r => { roles[r.slug] = r.id; });
    logger.info(`✓ Szerepkörök (${rolesResult.rows.length})`);

    // ─── 3. Users (admin, manager, employee, contractor) ────────────
    logger.info('Felhasználók...');
    const passwordHash = await bcrypt.hash('password123', 10);

    const userDefs = [
      // Superadmin
      { cid: contractor1Id, email: 'admin@hr-erp.com', fn: 'Admin', ln: 'User', role: 'superadmin' },
      // ABC Kft — admin + manager + employees
      { cid: contractor1Id, email: 'kiss.janos@abc-kft.hu', fn: 'Kiss', ln: 'János', role: 'admin' },
      { cid: contractor1Id, email: 'nagy.eva@abc-kft.hu', fn: 'Nagy', ln: 'Éva', role: 'task_owner' },
      { cid: contractor1Id, email: 'toth.anna@abc-kft.hu', fn: 'Tóth', ln: 'Anna', role: 'user' },
      { cid: contractor1Id, email: 'szabo.bela@abc-kft.hu', fn: 'Szabó', ln: 'Béla', role: 'user' },
      // XYZ Zrt
      { cid: contractor2Id, email: 'kovacs.peter@xyz-zrt.hu', fn: 'Kovács', ln: 'Péter', role: 'admin' },
      { cid: contractor2Id, email: 'szabo.maria@xyz-zrt.hu', fn: 'Szabó', ln: 'Mária', role: 'user' },
      // Contractors
      { cid: contractor1Id, email: 'vizvezetek@example.com', fn: 'Vízvezeték', ln: 'Kft.', role: 'contractor' },
      { cid: contractor1Id, email: 'it-support@example.com', fn: 'IT', ln: 'Support', role: 'contractor' },
      // Accommodated employees
      { cid: contractor1Id, email: 'horvath.gabor@employee.com', fn: 'Horváth', ln: 'Gábor', phone: '+36 30 123 4567', role: 'accommodated_employee' },
      { cid: contractor1Id, email: 'molnar.zsuzsanna@employee.com', fn: 'Molnár', ln: 'Zsuzsanna', phone: '+36 30 234 5678', role: 'accommodated_employee' },
      { cid: contractor1Id, email: 'varga.istvan@employee.com', fn: 'Varga', ln: 'István', phone: '+36 30 345 6789', role: 'accommodated_employee' },
      { cid: contractor1Id, email: 'farkas.katalin@employee.com', fn: 'Farkas', ln: 'Katalin', phone: '+36 30 456 7890', role: 'accommodated_employee' },
    ];

    const usersMap = {};
    for (const u of userDefs) {
      await query(`
        INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, phone, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (email) DO NOTHING
      `, [u.cid, u.email, passwordHash, u.fn, u.ln, u.phone || null]);

      const res = await query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (res.rows.length === 0) continue;
      usersMap[u.email] = res.rows[0].id;

      if (roles[u.role]) {
        await query(`
          INSERT INTO user_roles (user_id, role_id, contractor_id)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
        `, [res.rows[0].id, roles[u.role], u.cid]);
      }
    }
    logger.info(`✓ Felhasználók (${Object.keys(usersMap).length})`);

    const adminId = usersMap['admin@hr-erp.com'];
    const kissId = usersMap['kiss.janos@abc-kft.hu'];
    const nagyId = usersMap['nagy.eva@abc-kft.hu'];
    const tothId = usersMap['toth.anna@abc-kft.hu'];
    const szaboBelaId = usersMap['szabo.bela@abc-kft.hu'];
    const vizvezetekId = usersMap['vizvezetek@example.com'];
    const itSupportId = usersMap['it-support@example.com'];

    // ─── 4. Departments (organizational_units) ──────────────────────
    logger.info('Szervezeti egységek...');
    const deptDefs = [
      { name: 'Vezetőség', code: 'MGMT' },
      { name: 'HR osztály', code: 'HR' },
      { name: 'IT osztály', code: 'IT' },
      { name: 'Pénzügy', code: 'FIN' },
      { name: 'Üzemeltetés', code: 'OPS' },
    ];

    for (const d of deptDefs) {
      await query(`
        INSERT INTO organizational_units (contractor_id, name, description, is_active)
        SELECT $1::uuid, $2::varchar, $3::text, true
        WHERE NOT EXISTS (
          SELECT 1 FROM organizational_units WHERE contractor_id = $1::uuid AND name = $2::varchar
        )
      `, [contractor1Id, d.name, `${d.name} — ${d.code}`]);
    }

    const deptRes = await query('SELECT id, name FROM organizational_units WHERE contractor_id = $1', [contractor1Id]);
    const depts = {};
    deptRes.rows.forEach(d => { depts[d.name] = d.id; });
    logger.info(`✓ Szervezeti egységek (${deptRes.rows.length})`);

    // ─── 5. Ticket categories ───────────────────────────────────────
    logger.info('Ticket kategóriák...');
    await query(`
      INSERT INTO ticket_categories (contractor_id, name, slug, color, icon)
      VALUES
        ($1, 'HR', 'hr', '#3730a3', '👥'),
        ($1, 'Technikai', 'technical', '#5b21b6', '🔧'),
        ($1, 'Pénzügyi', 'finance', '#831843', '💰'),
        ($1, 'Általános', 'general', '#64748b', '📋')
      ON CONFLICT (slug, contractor_id) DO NOTHING
    `, [contractor1Id]);

    const catRes = await query('SELECT id, slug FROM ticket_categories WHERE contractor_id = $1', [contractor1Id]);
    const categories = {};
    catRes.rows.forEach(c => { categories[c.slug] = c.id; });

    const priRes = await query('SELECT id, slug FROM priorities');
    const priorities = {};
    priRes.rows.forEach(p => { priorities[p.slug] = p.id; });

    const stRes = await query('SELECT id, slug FROM ticket_statuses');
    const statuses = {};
    stRes.rows.forEach(s => { statuses[s.slug] = s.id; });

    // ─── 6. Tickets ─────────────────────────────────────────────────
    logger.info('Ticketek...');
    const ticketDefs = [
      { number: '#1243', title: 'Vízvezeték javítás - A épület', desc: 'Az A épület 2. emeletén a mosdóban szivárgás észlelhető.', cat: 'technical', status: 'in_progress', pri: 'urgent', by: tothId, to: vizvezetekId },
      { number: '#1242', title: 'HR dokumentum igénylés', desc: 'Kérném az elmúlt 3 hónap bérszámfejtésének összesítését.', cat: 'hr', status: 'new', pri: 'normal', by: tothId, to: null },
      { number: '#1241', title: 'Számítógép javítás', desc: 'A számítógép nem indul el, fekete képernyő jelenik meg.', cat: 'technical', status: 'completed', pri: 'normal', by: tothId, to: itSupportId },
      { number: '#1240', title: 'Bútor csere - B iroda', desc: 'Az irodai székek cseréje szükséges.', cat: 'technical', status: 'waiting_material', pri: 'normal', by: tothId, to: vizvezetekId },
      { number: '#1239', title: 'Fizetési probléma', desc: 'Az utolsó havi fizetés nem érkezett meg időben.', cat: 'finance', status: 'new', pri: 'urgent', by: szaboBelaId, to: null },
      { number: '#1238', title: 'Wifi lassulás', desc: 'A 3. emeleten rendszeresen lassú a wifi.', cat: 'technical', status: 'in_progress', pri: 'low', by: szaboBelaId, to: itSupportId },
    ];

    for (const t of ticketDefs) {
      await query(`
        INSERT INTO tickets (contractor_id, ticket_number, title, description, category_id, status_id, priority_id, created_by, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (ticket_number) DO NOTHING
      `, [contractor1Id, t.number, t.title, t.desc, categories[t.cat], statuses[t.status], priorities[t.pri], t.by, t.to]);
    }
    logger.info(`✓ Ticketek (${ticketDefs.length})`);

    // Ticket comments
    const firstTicket = await query("SELECT id FROM tickets WHERE ticket_number = '#1243'");
    if (firstTicket.rows.length > 0) {
      const tid = firstTicket.rows[0].id;
      const cnt = await query('SELECT COUNT(*) as c FROM ticket_comments WHERE ticket_id = $1', [tid]);
      if (parseInt(cnt.rows[0].c) === 0) {
        await query(`
          INSERT INTO ticket_comments (ticket_id, user_id, comment) VALUES
            ($1, $2, 'Jegy átadva a Vízvezeték Kft.-nek. Sürgősen foglalkozzanak vele!'),
            ($1, $3, 'Holnap reggel 9-kor kimegyünk felmérni.'),
            ($1, $3, 'Csövet kell cserélni, alkatrészt rendeltem. 2-3 nap.')
        `, [tid, kissId, vizvezetekId]);
      }
    }

    // ─── 7. Cost Centers ────────────────────────────────────────────
    logger.info('Költséghelyek...');
    const ccDefs = [
      { code: 'CC-MAIN', name: 'Központi költséghely', budget: 50000000 },
      { code: 'CC-IT', name: 'IT költséghely', budget: 15000000 },
      { code: 'CC-HR', name: 'HR költséghely', budget: 8000000 },
      { code: 'CC-OPS', name: 'Üzemeltetési költséghely', budget: 20000000 },
      { code: 'CC-PROJ', name: 'Projekt költséghely', budget: 25000000 },
    ];

    for (const cc of ccDefs) {
      await query(`
        INSERT INTO cost_centers (contractor_id, code, name, budget, is_active, level, created_by)
        SELECT $1::uuid, $2::varchar, $3::varchar, $4::decimal, true, 1, $5::uuid
        WHERE NOT EXISTS (SELECT 1 FROM cost_centers WHERE code = $2::varchar)
      `, [contractor1Id, cc.code, cc.name, cc.budget, adminId]);
    }

    const ccRes = await query("SELECT id, code FROM cost_centers WHERE code LIKE 'CC-%'");
    const costCenters = {};
    ccRes.rows.forEach(c => { costCenters[c.code] = c.id; });
    logger.info(`✓ Költséghelyek (${ccRes.rows.length})`);

    // ─── 8. Invoice Categories ──────────────────────────────────────
    logger.info('Számla kategóriák...');
    await query(`
      INSERT INTO invoice_categories (name, icon, color, is_active)
      VALUES
        ('Szolgáltatás', '🔧', '#3b82f6', true),
        ('Anyag', '📦', '#10b981', true),
        ('Szoftver', '💻', '#8b5cf6', true),
        ('Bérleti díj', '🏢', '#f59e0b', true)
      ON CONFLICT DO NOTHING
    `);

    const icRes = await query('SELECT id, name FROM invoice_categories');
    const invCats = {};
    icRes.rows.forEach(c => { invCats[c.name] = c.id; });

    // ─── 9. Invoices ────────────────────────────────────────────────
    logger.info('Számlák...');
    const invDefs = [
      { num: 'INV-2026-001', vendor: 'Dell Kft.', amount: 450000, vat: 121500, total: 571500, cat: 'Szoftver', cc: 'CC-IT', status: 'paid', date: '2026-01-15', due: '2026-02-15' },
      { num: 'INV-2026-002', vendor: 'Takarítás Zrt.', amount: 180000, vat: 48600, total: 228600, cat: 'Szolgáltatás', cc: 'CC-OPS', status: 'sent', date: '2026-02-01', due: '2026-03-01' },
      { num: 'INV-2026-003', vendor: 'Office Depot', amount: 95000, vat: 25650, total: 120650, cat: 'Anyag', cc: 'CC-MAIN', status: 'draft', date: '2026-02-20', due: '2026-03-20' },
      { num: 'INV-2026-004', vendor: 'AWS Hungary', amount: 320000, vat: 86400, total: 406400, cat: 'Szoftver', cc: 'CC-IT', status: 'sent', date: '2026-03-01', due: '2026-04-01' },
      { num: 'INV-2026-005', vendor: 'Irodabérleti Kft.', amount: 850000, vat: 229500, total: 1079500, cat: 'Bérleti díj', cc: 'CC-MAIN', status: 'paid', date: '2026-01-01', due: '2026-01-15' },
    ];

    for (const inv of invDefs) {
      await query(`
        INSERT INTO invoices (invoice_number, vendor_name, amount, vat_amount, total_amount, category_id, cost_center_id, payment_status, invoice_date, due_date, contractor_id, created_by)
        SELECT $1::varchar, $2::varchar, $3::decimal, $4::decimal, $5::decimal, $6::uuid, $7::uuid, $8::varchar, $9::date, $10::date, $11::uuid, $12::uuid
        WHERE NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = $1::varchar)
      `, [inv.num, inv.vendor, inv.amount, inv.vat, inv.total, invCats[inv.cat], costCenters[inv.cc], inv.status, inv.date, inv.due, contractor1Id, kissId]);
    }
    logger.info(`✓ Számlák (${invDefs.length})`);

    // ─── 10. Projects ───────────────────────────────────────────────
    logger.info('Projektek...');
    const projDefs = [
      { code: 'PROJ-001', name: 'Iroda felújítás', desc: 'Az A épület teljes felújítása', status: 'active', budget: 5000000, pct: 35, cc: 'CC-OPS' },
      { code: 'PROJ-002', name: 'HR rendszer bevezetés', desc: 'Új HR-ERP rendszer bevezetése és oktatás', status: 'active', budget: 3000000, pct: 70, cc: 'CC-IT' },
      { code: 'PROJ-003', name: 'Éves audit', desc: '2026-os belső pénzügyi audit', status: 'planning', budget: 1500000, pct: 0, cc: 'CC-MAIN' },
    ];

    for (const p of projDefs) {
      await query(`
        INSERT INTO projects (code, name, description, status, budget, completion_percentage, cost_center_id, project_manager_id, contractor_id, created_by, start_date)
        SELECT $1::varchar, $2::varchar, $3::text, $4::varchar, $5::decimal, $6::int, $7::uuid, $8::uuid, $9::uuid, $10::uuid, CURRENT_DATE
        WHERE NOT EXISTS (SELECT 1 FROM projects WHERE code = $1::varchar)
      `, [p.code, p.name, p.desc, p.status, p.budget, p.pct, costCenters[p.cc], kissId, contractor1Id, adminId]);
    }

    const projRes = await query("SELECT id, code FROM projects WHERE code LIKE 'PROJ-%'");
    const projects = {};
    projRes.rows.forEach(p => { projects[p.code] = p.id; });
    logger.info(`✓ Projektek (${projRes.rows.length})`);

    // ─── 11. Tasks ──────────────────────────────────────────────────
    logger.info('Feladatok...');
    const taskDefs = [
      // PROJ-001 tasks
      { proj: 'PROJ-001', title: 'Felmérés és árajánlatok bekérése', status: 'done', pri: 'high', to: nagyId, hours: 8, progress: 100 },
      { proj: 'PROJ-001', title: 'Bontási munkálatok', status: 'in_progress', pri: 'medium', to: vizvezetekId, hours: 40, progress: 60 },
      { proj: 'PROJ-001', title: 'Festés és burkolás', status: 'todo', pri: 'medium', to: null, hours: 80, progress: 0 },
      { proj: 'PROJ-001', title: 'Bútorozás', status: 'todo', pri: 'low', to: null, hours: 16, progress: 0 },
      // PROJ-002 tasks
      { proj: 'PROJ-002', title: 'Szerver telepítés', status: 'done', pri: 'high', to: itSupportId, hours: 16, progress: 100 },
      { proj: 'PROJ-002', title: 'Adatbázis migráció', status: 'done', pri: 'critical', to: itSupportId, hours: 24, progress: 100 },
      { proj: 'PROJ-002', title: 'Felhasználói tesztelés', status: 'in_progress', pri: 'high', to: tothId, hours: 40, progress: 50 },
      { proj: 'PROJ-002', title: 'Oktatás szervezése', status: 'todo', pri: 'medium', to: nagyId, hours: 20, progress: 0 },
      // PROJ-003 tasks
      { proj: 'PROJ-003', title: 'Audit terv készítés', status: 'todo', pri: 'high', to: kissId, hours: 8, progress: 0 },
      { proj: 'PROJ-003', title: 'Dokumentumok összegyűjtése', status: 'todo', pri: 'medium', to: tothId, hours: 16, progress: 0 },
    ];

    for (const t of taskDefs) {
      if (!projects[t.proj]) continue;
      await query(`
        INSERT INTO tasks (project_id, title, status, priority, assigned_to, estimated_hours, progress, contractor_id, created_by)
        SELECT $1::uuid, $2::varchar, $3::varchar, $4::varchar, $5::uuid, $6::decimal, $7::int, $8::uuid, $9::uuid
        WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE project_id = $1::uuid AND title = $2::varchar)
      `, [projects[t.proj], t.title, t.status, t.pri, t.to, t.hours, t.progress, contractor1Id, adminId]);
    }
    logger.info(`✓ Feladatok (${taskDefs.length})`);

    // ─── 12. Salary Bands ───────────────────────────────────────────
    logger.info('Fizetési sávok...');
    const salaryDefs = [
      { pos: 'Junior fejlesztő', dept: 'IT', level: 'junior', min: 450000, max: 650000, med: 550000 },
      { pos: 'Senior fejlesztő', dept: 'IT', level: 'senior', min: 750000, max: 1200000, med: 950000 },
      { pos: 'HR asszisztens', dept: 'HR', level: 'junior', min: 350000, max: 500000, med: 420000 },
      { pos: 'HR vezető', dept: 'HR', level: 'lead', min: 700000, max: 1000000, med: 850000 },
      { pos: 'Pénzügyi elemző', dept: 'Pénzügy', level: 'medior', min: 550000, max: 800000, med: 680000 },
      { pos: 'Üzemeltetési mérnök', dept: 'Üzemeltetés', level: 'medior', min: 500000, max: 750000, med: 620000 },
    ];

    // Only seed if salary_bands table exists (migration 037)
    try {
      for (const s of salaryDefs) {
        await query(`
          INSERT INTO salary_bands (position_name, department, level, min_salary, max_salary, median_salary, currency)
          SELECT $1::varchar, $2::varchar, $3::varchar, $4::decimal, $5::decimal, $6::decimal, 'HUF'
          WHERE NOT EXISTS (SELECT 1 FROM salary_bands WHERE position_name = $1::varchar AND department = $2::varchar)
        `, [s.pos, s.dept, s.level, s.min, s.max, s.med]);
      }
      logger.info(`✓ Fizetési sávok (${salaryDefs.length})`);
    } catch (err) {
      if (err.message.includes('salary_bands') && err.message.includes('does not exist')) {
        logger.warn('⚠ salary_bands tábla nem létezik — fizetési sávok kihagyva (futtasd: npm run db:migrate)');
      } else {
        throw err;
      }
    }

    // ─── Done ───────────────────────────────────────────────────────
    logger.info('');
    logger.info('✅ Seed befejezve!');
    logger.info('');
    logger.info('📝 Teszt bejelentkezési adatok:');
    logger.info('─'.repeat(45));
    logger.info('Szuperadmin:  admin@hr-erp.com / password123');
    logger.info('Admin:        kiss.janos@abc-kft.hu / password123');
    logger.info('Manager:      nagy.eva@abc-kft.hu / password123');
    logger.info('Employee:     toth.anna@abc-kft.hu / password123');
    logger.info('Contractor:   vizvezetek@example.com / password123');
    logger.info('─'.repeat(45));

  } catch (error) {
    logger.error('❌ Seed hiba:', error);
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => { process.exit(0); })
    .catch(() => { process.exit(1); });
}

module.exports = { seedDatabase };
