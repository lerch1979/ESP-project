#!/usr/bin/env node
/**
 * A MOSTANI gazdátlan jegyek hozzárendelése az alapértelmezett felelőshöz.
 *
 * Élesben ma két ilyen jegy van (#19, #20 — Eszti mobilos jegyei). Mindkettő azért
 * maradt szignálatlan, mert a lánc minden ága feltételes volt (lásd mig 170 fejléce).
 * A mig 170 óta új jegy már nem maradhat gazdátlan; ez a szkript a MÁR MEGLÉVŐKET
 * rendezi, a szignálási láncon átvezetve — nem kézi UPDATE-tel, hogy ugyanaz a logika
 * döntsön, mint egy új jegynél.
 *
 * Száraz futás alapból; írni `--apply` kell.
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const svc = require('../src/services/ticketAssignment.service');
const inApp = require('../src/services/inAppNotification.service');

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(...a);

(async () => {
  log(`\n${APPLY ? '⚠️  ÉLES FUTÁS (--apply)' : '🔍 SZÁRAZ FUTÁS — semmi nem íródik. Írás: --apply'}\n`);

  const cfg = await svc.getConfig();
  log(`── Alapértelmezett felelős: ${cfg?.default_assignee_name || 'NINCS BEÁLLÍTVA'} `
    + `(${cfg?.default_assignee_email || '—'})`);
  if (!cfg?.default_assignee_id) {
    log('\n❌ Nincs beállított alapértelmezett felelős — előbb a ticket_assignment_config-ot töltsd ki.\n');
    process.exit(1);
  }

  const arvak = (await query(`
    SELECT t.id, t.ticket_number, t.title, t.created_at::date AS nap,
           coalesce(u.email,'?') AS letrehozo
      FROM tickets t
      JOIN ticket_statuses s ON s.id = t.status_id
      LEFT JOIN users u ON u.id = t.created_by
     WHERE t.assigned_to IS NULL AND coalesce(s.is_final,false) = false
     ORDER BY t.created_at`)).rows;

  log(`\n── ${arvak.length} gazdátlan, nyitott jegy\n`);
  for (const j of arvak) {
    const d = await svc.resolveAssignee(j.id);
    log(`   ${j.ticket_number.padEnd(6)} ${String(j.title).slice(0, 34).padEnd(36)} ${j.nap}  `
      + `→ ${d.reason}`);
    if (!APPLY) continue;

    await query('UPDATE tickets SET assigned_to=$2, updated_at=NOW() WHERE id=$1 AND assigned_to IS NULL',
      [j.id, d.userId]);
    // A felelős akkor is kapjon értesítést, ha a jegy napok óta ült — épp ezért ült.
    await inApp.notify({
      userId: d.userId,
      type: 'ticket_created',
      title: 'Korábbi, szignálatlan hibajegy',
      message: `${j.ticket_number} — ${j.title} (${j.nap} óta gazdátlan volt)`,
      link: `/tickets/${j.id}`,
      data: { ticket_id: j.id, backfill: true },
    }).catch(() => {});
  }

  log(`\n${APPLY ? '✅ kész' : '↩️  száraz futás — semmi nem íródott'}\n`);
  process.exit(0);
})();
