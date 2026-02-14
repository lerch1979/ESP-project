require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('./connection');
const { logger } = require('../utils/logger');

/**
 * Adatbázis feltöltése tesztadatokkal
 * Idempotens: biztonságosan újrafuttatható, meglévő adatokat nem duplikálja
 */
async function seedDatabase() {
  try {
    logger.info('🌱 Adatbázis seed indítása...');

    // 1. Alvállalkozók létrehozása (ON CONFLICT skip)
    logger.info('Alvállalkozók létrehozása...');
    await query(`
      INSERT INTO contractors (name, slug, email, phone, is_active)
      VALUES
        ('ABC Kereskedelmi Kft.', 'abc-kft', 'info@abc-kft.hu', '+36 1 234 5678', true),
        ('XYZ Szolgáltató Zrt.', 'xyz-zrt', 'info@xyz-zrt.hu', '+36 1 987 6543', true)
      ON CONFLICT (slug) DO NOTHING
    `);

    const contractorResult = await query(`SELECT id, name, slug FROM contractors WHERE slug IN ('abc-kft', 'xyz-zrt') ORDER BY slug`);
    const contractor1Id = contractorResult.rows.find(t => t.slug === 'abc-kft').id;
    const contractor2Id = contractorResult.rows.find(t => t.slug === 'xyz-zrt').id;
    logger.info(`✓ Alvállalkozók rendben (${contractorResult.rows.length} db)`);

    // 2. Szerepkörök - accommodated_employee hozzáadása ha hiányzik
    await query(`
      INSERT INTO roles (name, slug, description, is_system)
      VALUES ('Szállásolt Munkavállaló', 'accommodated_employee', 'Szállásolt munkavállaló', true)
      ON CONFLICT (slug) DO NOTHING
    `);

    const rolesResult = await query('SELECT id, slug FROM roles');
    const roles = {};
    rolesResult.rows.forEach(role => {
      roles[role.slug] = role.id;
    });
    logger.info(`✓ Szerepkörök rendben (${rolesResult.rows.length} db)`);

    // 3. Felhasználók létrehozása
    logger.info('Felhasználók létrehozása...');
    const passwordHash = await bcrypt.hash('password123', 10);

    const userDefs = [
      // Szuperadmin
      { contractorId: contractor1Id, email: 'admin@hr-erp.com', firstName: 'Admin', lastName: 'User', role: 'superadmin' },
      // ABC Kft. felhasználók
      { contractorId: contractor1Id, email: 'kiss.janos@abc-kft.hu', firstName: 'Kiss', lastName: 'János', role: 'admin' },
      { contractorId: contractor1Id, email: 'nagy.eva@abc-kft.hu', firstName: 'Nagy', lastName: 'Éva', role: 'task_owner' },
      { contractorId: contractor1Id, email: 'toth.anna@abc-kft.hu', firstName: 'Tóth', lastName: 'Anna', role: 'user' },
      // XYZ Zrt. felhasználók
      { contractorId: contractor2Id, email: 'kovacs.peter@xyz-zrt.hu', firstName: 'Kovács', lastName: 'Péter', role: 'admin' },
      { contractorId: contractor2Id, email: 'szabo.maria@xyz-zrt.hu', firstName: 'Szabó', lastName: 'Mária', role: 'user' },
      // Külső alvállalkozók
      { contractorId: contractor1Id, email: 'vizvezetek@example.com', firstName: 'Vízvezeték', lastName: 'Kft.', role: 'contractor' },
      { contractorId: contractor1Id, email: 'it-support@example.com', firstName: 'IT', lastName: 'Support', role: 'contractor' },
      // Szállásolt munkavállalók (ABC Kft.)
      { contractorId: contractor1Id, email: 'horvath.gabor@employee.com', firstName: 'Horváth', lastName: 'Gábor', phone: '+36 30 123 4567', role: 'accommodated_employee' },
      { contractorId: contractor1Id, email: 'molnar.zsuzsanna@employee.com', firstName: 'Molnár', lastName: 'Zsuzsanna', phone: '+36 30 234 5678', role: 'accommodated_employee' },
      { contractorId: contractor1Id, email: 'varga.istvan@employee.com', firstName: 'Varga', lastName: 'István', phone: '+36 30 345 6789', role: 'accommodated_employee' },
      { contractorId: contractor1Id, email: 'farkas.katalin@employee.com', firstName: 'Farkas', lastName: 'Katalin', phone: '+36 30 456 7890', role: 'accommodated_employee' },
    ];

    for (const u of userDefs) {
      // Insert user if not exists
      await query(`
        INSERT INTO users (contractor_id, email, password_hash, first_name, last_name, phone, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (email) DO NOTHING
      `, [u.contractorId, u.email, passwordHash, u.firstName, u.lastName, u.phone || null]);

      // Get user id
      const userRes = await query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (userRes.rows.length === 0) continue;
      const userId = userRes.rows[0].id;

      // Assign role if not already assigned
      if (roles[u.role]) {
        await query(`
          INSERT INTO user_roles (user_id, role_id, contractor_id)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [userId, roles[u.role], u.contractorId]);
      }
    }

    logger.info(`✓ Felhasználók és szerepkörök rendben`);

    // Fetch user IDs for ticket seeding
    const usersMap = {};
    for (const u of userDefs) {
      const res = await query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (res.rows.length > 0) usersMap[u.email] = res.rows[0].id;
    }

    const tothAnnaId = usersMap['toth.anna@abc-kft.hu'];
    const kissJanosId = usersMap['kiss.janos@abc-kft.hu'];
    const vizvezetekId = usersMap['vizvezetek@example.com'];
    const itSupportId = usersMap['it-support@example.com'];

    // 5. Ticket kategóriák létrehozása
    logger.info('Ticket kategóriák létrehozása...');
    await query(`
      INSERT INTO ticket_categories (contractor_id, name, slug, color, icon)
      VALUES
        ($1, 'HR', 'hr', '#3730a3', '👥'),
        ($1, 'Technikai', 'technical', '#5b21b6', '🔧'),
        ($1, 'Pénzügyi', 'finance', '#831843', '💰'),
        ($1, 'Általános', 'general', '#64748b', '📋')
      ON CONFLICT (slug, contractor_id) DO NOTHING
    `, [contractor1Id]);

    const categoriesResult = await query(
      'SELECT id, slug FROM ticket_categories WHERE contractor_id = $1', [contractor1Id]
    );
    const categories = {};
    categoriesResult.rows.forEach(cat => {
      categories[cat.slug] = cat.id;
    });
    logger.info('✓ Kategóriák rendben');

    // 6. Prioritások és státuszok lekérése
    const prioritiesResult = await query('SELECT id, slug FROM priorities');
    const priorities = {};
    prioritiesResult.rows.forEach(p => {
      priorities[p.slug] = p.id;
    });

    const statusesResult = await query('SELECT id, slug FROM ticket_statuses');
    const statuses = {};
    statusesResult.rows.forEach(s => {
      statuses[s.slug] = s.id;
    });

    // 7. Ticketek létrehozása
    logger.info('Ticketek létrehozása...');

    const ticketDefs = [
      {
        number: '#1243', title: 'Vízvezeték javítás - A épület',
        description: 'Az A épület 2. emeletén a mosdóban szivárgás észlelhető. A csap alatt folyamatosan csöpög a víz.',
        category: 'technical', status: 'in_progress', priority: 'urgent',
        createdBy: tothAnnaId, assignedTo: vizvezetekId,
      },
      {
        number: '#1242', title: 'HR dokumentum igénylés',
        description: 'Kérném az elmúlt 3 hónap bérszámfejtésének összesítését.',
        category: 'hr', status: 'new', priority: 'normal',
        createdBy: tothAnnaId, assignedTo: null,
      },
      {
        number: '#1241', title: 'Számítógép javítás',
        description: 'A számítógép nem indul el, fekete képernyő jelenik meg.',
        category: 'technical', status: 'completed', priority: 'normal',
        createdBy: tothAnnaId, assignedTo: itSupportId,
      },
      {
        number: '#1240', title: 'Bútor csere - B iroda',
        description: 'Az irodai székek cseréje szükséges, ergonómiai problémák miatt.',
        category: 'technical', status: 'waiting_material', priority: 'normal',
        createdBy: tothAnnaId, assignedTo: vizvezetekId,
      },
    ];

    for (const t of ticketDefs) {
      await query(`
        INSERT INTO tickets (
          contractor_id, ticket_number, title, description,
          category_id, status_id, priority_id, created_by, assigned_to
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (ticket_number) DO NOTHING
      `, [
        contractor1Id, t.number, t.title, t.description,
        categories[t.category], statuses[t.status], priorities[t.priority],
        t.createdBy, t.assignedTo,
      ]);
    }

    logger.info('✓ Ticketek rendben');

    // 8. Megjegyzések hozzáadása
    logger.info('Megjegyzések hozzáadása...');
    const ticketsResult = await query(
      'SELECT id, ticket_number FROM tickets WHERE contractor_id = $1 ORDER BY created_at',
      [contractor1Id]
    );

    if (ticketsResult.rows.length > 0) {
      const firstTicketId = ticketsResult.rows.find(t => t.ticket_number === '#1243')?.id;
      if (firstTicketId) {
        // Only add comments if none exist yet for this ticket
        const existingComments = await query(
          'SELECT COUNT(*) as cnt FROM ticket_comments WHERE ticket_id = $1', [firstTicketId]
        );
        if (parseInt(existingComments.rows[0].cnt) === 0) {
          await query(`
            INSERT INTO ticket_comments (ticket_id, user_id, comment)
            VALUES
              ($1, $2, 'Jegy átadva a Vízvezeték Kft.-nek. Kérem, foglalkozzanak vele sürgősen!'),
              ($1, $3, 'Holnap reggel 9-kor kimegyünk a helyszínt felmérni. 📸'),
              ($1, $3, 'Helyszíni szemle kész. Csövet kell cserélni, alkatrészt rendeltem. Várható megoldás: 2-3 nap.')
          `, [firstTicketId, kissJanosId, vizvezetekId]);
        }
      }
    }

    logger.info('✓ Megjegyzések rendben');

    // 9. Ticket history bejegyzések
    logger.info('Ticket történet bejegyzések...');
    for (const ticket of ticketsResult.rows) {
      const existingHistory = await query(
        'SELECT COUNT(*) as cnt FROM ticket_history WHERE ticket_id = $1', [ticket.id]
      );
      if (parseInt(existingHistory.rows[0].cnt) === 0) {
        await query(`
          INSERT INTO ticket_history (ticket_id, user_id, action, new_value)
          VALUES ($1, $2, 'created', $3)
        `, [ticket.id, tothAnnaId, ticket.ticket_number]);
      }
    }

    logger.info('✓ Történet bejegyzések rendben');

    logger.info('✅ Seed befejezve!');
    logger.info('');
    logger.info('📝 Teszt bejelentkezési adatok:');
    logger.info('-----------------------------------');
    logger.info('Szuperadmin:');
    logger.info('  Email: admin@hr-erp.com');
    logger.info('  Jelszó: password123');
    logger.info('');
    logger.info('ABC Kft. Admin:');
    logger.info('  Email: kiss.janos@abc-kft.hu');
    logger.info('  Jelszó: password123');
    logger.info('');
    logger.info('Felhasználó:');
    logger.info('  Email: toth.anna@abc-kft.hu');
    logger.info('  Jelszó: password123');
    logger.info('');
    logger.info('Alvállalkozó:');
    logger.info('  Email: vizvezetek@example.com');
    logger.info('  Jelszó: password123');
    logger.info('');
    logger.info('Szállásolt munkavállalók:');
    logger.info('  Email: horvath.gabor@employee.com');
    logger.info('  Email: molnar.zsuzsanna@employee.com');
    logger.info('  Email: varga.istvan@employee.com');
    logger.info('  Email: farkas.katalin@employee.com');
    logger.info('  Jelszó: password123');
    logger.info('-----------------------------------');

  } catch (error) {
    logger.error('❌ Seed hiba:', error);
    throw error;
  }
}

// Futtatás, ha közvetlenül hívjuk
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seed sikeresen befejezve');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Seed sikertelen:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
