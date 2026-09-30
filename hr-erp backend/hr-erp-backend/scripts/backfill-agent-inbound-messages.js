#!/usr/bin/env node
/**
 * Backfill: meglévő hibajegyek és jegy-üzenetek → inbound_messages.
 *
 * MIÉRT KELL, ÉS MIÉRT `status='ignored'`
 * ---------------------------------------
 * A Triage Agent méréséhez golden set kell (spec 7.1: min. 200 kézzel címkézett valós
 * minta), és ahhoz valós szövegek kellenek. Ezek megvannak — a meglévő jegyekben és
 * chat-üzenetekben. Ez a script átmásolja őket az `inbound_messages` táblába, hogy a
 * címkéző felület (`/admin/agent/eval`) legyen mit címkéznie.
 *
 * DE: ezek RÉGI üzenetek. Ha `status='new'`-val kerülnének be, az agent feldolgozná
 * őket — és egy hónapokkal ezelőtti "elhagytam a kulcsomat" bejelentésre MA nyitna
 * jegyet, értesítené a szállásfelelőst, és visszaigazolást küldene a lakónak egy
 * problémára, amit már megoldottak. Ezért `status='ignored'`: bekerül, címkézhető,
 * de a feldolgozó sor nem nyúl hozzá.
 *
 * KÉT FORRÁS
 * ----------
 *   • tickets         → channel='ticket_form', a body a cím + leírás
 *   • ticket_messages → channel='chat'
 *
 * Amit NEM hoz át:
 *   • törölt üzenetet (`deleted_at IS NOT NULL`) — ha valaki törölte, annak oka volt,
 *   • üres szöveget — címkézni nincs mit rajta.
 *
 * ÚJRAFUTTATHATÓ: a `source_hash` UNIQUE indexe miatt a második futás nem duplikál.
 * Nem a script vigyáz erre, hanem az adatbázis.
 *
 *   node scripts/backfill-agent-inbound-messages.js           # próbafutás (alapértelmezés)
 *   node scripts/backfill-agent-inbound-messages.js --apply   # írás
 */
require('dotenv').config();
const { query } = require('../src/database/connection');
const { normalize } = require('../src/agent/normalizer');
const { sourceHash } = require('../src/agent/dedup');

const APPLY = process.argv.includes('--apply');

/**
 * A küldő típusa. Ahol nem állapítható meg, `unknown` — NEM tippelünk 'resident'-re.
 * Egy staff-üzenet lakóként címkézve elrontaná a golden setet, és a mérés pont arról
 * szól, hogy a valóságot tükrözze.
 */
function senderType(szerep, vanEmployee) {
  if (!szerep && vanEmployee) return 'resident';
  if (!szerep) return 'unknown';
  const sz = String(szerep).toLowerCase();
  if (sz.includes('accommodated') || sz === 'resident' || sz === 'employee') return 'resident';
  if (['admin', 'superadmin', 'manager', 'hr', 'accommodation_manager', 'staff'].some((k) => sz.includes(k))) {
    return 'staff';
  }
  if (sz.includes('partner') || sz.includes('client')) return 'partner';
  if (sz.includes('landlord')) return 'landlord';
  return 'unknown';
}

async function beszur(sor) {
  const n = normalize({ channel: sor.channel, source_id: sor.source_id, body: sor.body, subject: sor.subject });
  if (!n.body) return { skipped: 'üres szöveg' };
  const hash = sourceHash({ channel: n.channel, source_id: n.source_id, body: n.body });

  if (!APPLY) return { dry: true, lang: n.lang, hash };

  const r = await query(
    `INSERT INTO inbound_messages
       (channel, source_id, source_hash, sender_type, sender_ref, received_at,
        lang, subject, body, attachments, status)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,'ignored')
     ON CONFLICT (source_hash) DO NOTHING
     RETURNING id`,
    [n.channel, n.source_id, hash, sor.sender_type, sor.received_at,
      n.lang, n.subject, n.body, JSON.stringify(sor.attachments || [])]
  );
  return r.rows.length ? { inserted: r.rows[0].id, lang: n.lang } : { duplicate: true };
}

async function main() {
  console.log(`\n=== inbound_messages backfill — ${APPLY ? 'ÍRÁS' : 'PRÓBAFUTÁS (--apply nélkül nem ír)'} ===\n`);

  const stat = { jegy: 0, chat: 0, dup: 0, ures: 0, nyelv: {} };
  const szamol = (r) => {
    if (r.skipped) { stat.ures++; return; }
    if (r.duplicate) { stat.dup++; return; }
    if (r.lang) stat.nyelv[r.lang] = (stat.nyelv[r.lang] || 0) + 1;
  };

  // ── 1. Hibajegyek ─────────────────────────────────────────────────────────
  // A body a CÍM ÉS A LEÍRÁS együtt: a triage a kettőt együtt látná egy bejövő
  // bejelentésnél is, és a cím gyakran a lényeg ("Nincs melegvíz").
  const jegyek = await query(
    `SELECT t.id, t.title, t.description, t.created_at, t.language,
            r.name AS szerep, (e.id IS NOT NULL) AS van_employee
       FROM tickets t
       LEFT JOIN users u ON u.id = t.created_by
       LEFT JOIN roles r ON r.id = u.role_id
       LEFT JOIN employees e ON e.user_id = t.created_by
      ORDER BY t.created_at`
  );
  for (const j of jegyek.rows) {
    const r = await beszur({
      channel: 'ticket_form',
      source_id: `ticket:${j.id}`,
      subject: j.title,
      body: [j.title, j.description].filter(Boolean).join('\n'),
      received_at: j.created_at,
      sender_type: senderType(j.szerep, j.van_employee),
    });
    szamol(r);
    if (r.inserted || r.dry) stat.jegy++;
  }

  // ── 2. Jegy-üzenetek (chat) ───────────────────────────────────────────────
  const uzenetek = await query(
    `SELECT m.id, m.message, m.created_at, m.sender_role, m.attachments,
            (e.id IS NOT NULL) AS van_employee
       FROM ticket_messages m
       LEFT JOIN employees e ON e.user_id = m.sender_id
      WHERE m.deleted_at IS NULL AND m.message IS NOT NULL AND btrim(m.message) <> ''
      ORDER BY m.created_at`
  );
  for (const u of uzenetek.rows) {
    const r = await beszur({
      channel: 'chat',
      source_id: `ticket_message:${u.id}`,
      subject: null,
      body: u.message,
      received_at: u.created_at,
      sender_type: senderType(u.sender_role, u.van_employee),
      attachments: u.attachments,
    });
    szamol(r);
    if (r.inserted || r.dry) stat.chat++;
  }

  console.log(`  hibajegy:        ${stat.jegy} / ${jegyek.rows.length}`);
  console.log(`  chat-üzenet:     ${stat.chat} / ${uzenetek.rows.length}`);
  console.log(`  már bent volt:   ${stat.dup}`);
  console.log(`  üres, kihagyva:  ${stat.ures}`);
  console.log(`  nyelv-eloszlás:  ${JSON.stringify(stat.nyelv)}`);

  if (APPLY) {
    const ossz = await query(
      `SELECT status, count(*)::int c FROM inbound_messages GROUP BY 1 ORDER BY 1`);
    console.log(`\n  inbound_messages állapotok: ${JSON.stringify(ossz.rows)}`);
    // A GOLDEN SET MÉRETE a spec 7.1 szerint min. 200 minta. Ha ennél kevesebb van,
    // azt KI KELL MONDANI, nem elhallgatni: a mérés nélkül nincs élesítés, tehát
    // a hiányzó mennyiség egy konkrét, teljesítendő feltétel, nem részletkérdés.
    const n = await query("SELECT count(*)::int c FROM inbound_messages WHERE status='ignored'");
    const van = n.rows[0].c;
    console.log(`\n  golden-set alap: ${van} minta. A spec 7.1 minimuma 200 →`
      + (van >= 200 ? ' ELÉG.' : ` MÉG ${200 - van} KELL (email-csatorna + új forgalom).`));
  } else {
    console.log('\n  (próbafutás — semmi nem íródott. Írás: --apply)');
  }
  process.exit(0);
}

main().catch((e) => { console.error('HIBA:', e.message); process.exit(1); });
