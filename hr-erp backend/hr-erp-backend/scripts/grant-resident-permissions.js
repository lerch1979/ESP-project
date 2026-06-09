require('dotenv').config();
const { query } = require('../src/database/connection');

/**
 * Make `accommodated_employee` functional — SAFELY. Idempotent, safe to re-run.
 *
 * SECURITY DECISION (see scope audit 2026-06-09):
 *   The only permission granted is tickets.create (a self-owned WRITE — createTicket
 *   stamps created_by = req.user.id, contractor_id = req.user.contractorId).
 *
 *   The requested READ permissions are DELIBERATELY NOT granted because their
 *   controllers are NOT self-scoped (would leak other people's data):
 *     - tickets.view        → getTickets filters only by t.contractor_id (ALL the
 *                             contractor's tickets, not created_by = self)
 *     - accommodations.view → getAccommodations has NO contractor filter at all
 *                             (returns ALL accommodations, every contractor)
 *     - documents.view      → getDocuments has no self restriction
 *   These require row-level filtering (created_by=self / employee.user_id=self /
 *   a dedicated "my room" endpoint) BEFORE they can be granted. Left ungranted,
 *   a resident gets 403 on those endpoints — no cross-tenant leak possible.
 *
 *   notifications: /notification-center is auth-only (no permission) and already
 *   self-scoped (WHERE user_id = $1 OR user_id IS NULL) — nothing to grant.
 *
 * Also: seed a Hungarian starter ticket-category set for Housing Solutions Kft.
 */

const ROLE_SLUG = 'accommodated_employee';
const HS_CONTRACTOR_ID = 'dff75eff-506c-45fd-9115-011115956c38'; // Housing Solutions Kft

const GRANT = ['tickets.create'];
const DELIBERATELY_SKIPPED = ['tickets.view', 'accommodations.view', 'documents.view']; // not self-scoped

const CATEGORIES = [
  { name: 'Víz/csőtörés',       slug: 'viz-csotores',     color: '#2563eb', icon: '💧' },
  { name: 'Fűtés',              slug: 'futes',            color: '#dc2626', icon: '🔥' },
  { name: 'Elektromos',         slug: 'elektromos',       color: '#d97706', icon: '⚡' },
  { name: 'Bútor/berendezés',   slug: 'butor-berendezes', color: '#7c3aed', icon: '🛋️' },
  { name: 'Tisztaság',          slug: 'tisztasag',        color: '#059669', icon: '🧹' },
  { name: 'Egyéb',              slug: 'egyeb',            color: '#64748b', icon: '📋' },
];

async function run() {
  console.log('🔐 Granting resident permissions (READ-ONLY intent, write=tickets.create only)...\n');

  const { rows: [role] } = await query('SELECT id FROM roles WHERE slug = $1', [ROLE_SLUG]);
  if (!role) throw new Error(`Role '${ROLE_SLUG}' not found`);

  // ─── 1. Grant ONLY the safe write permission ────────────────────────
  for (const slug of GRANT) {
    const { rows: [perm] } = await query('SELECT id FROM permissions WHERE slug = $1', [slug]);
    if (!perm) { console.log(`  ⚠ permission '${slug}' not found — skipped`); continue; }
    await query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [role.id, perm.id]
    );
    console.log(`  ✓ GRANTED  ${slug}`);
  }
  for (const slug of DELIBERATELY_SKIPPED) {
    console.log(`  ⛔ SKIPPED ${slug}  (blanket/not self-scoped — needs row-level filtering first)`);
  }

  // ─── 2. Starter ticket categories for Housing Solutions Kft ─────────
  console.log('\n📂 Ticket categories for Housing Solutions Kft:');
  for (const c of CATEGORIES) {
    await query(
      `INSERT INTO ticket_categories (contractor_id, name, slug, color, icon)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contractor_id, slug) DO NOTHING`,
      [HS_CONTRACTOR_ID, c.name, c.slug, c.color, c.icon]
    );
    console.log(`  ✓ ${c.icon} ${c.name}`);
  }

  // ─── Summary ────────────────────────────────────────────────────────
  const { rows: granted } = await query(
    `SELECT p.slug FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = $1 ORDER BY p.slug`, [role.id]
  );
  const { rows: [{ count: catCount }] } = await query(
    `SELECT count(*)::int FROM ticket_categories WHERE contractor_id = $1`, [HS_CONTRACTOR_ID]
  );
  console.log(`\n✅ accommodated_employee now holds: [${granted.map(g => g.slug).join(', ')}]`);
  console.log(`✅ Housing Solutions Kft categories: ${catCount}`);
}

run().then(() => process.exit(0)).catch((err) => { console.error('❌ Failed:', err.message); process.exit(1); });
