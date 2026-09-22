/**
 * PUSH-DIAGNOSZTIKA — hol akad el az értesítés.
 *
 * MIÉRT KELL: a `sendToUser` ma a PUSH TICKET-et nézi, és `status:'ok'` esetén sikert
 * jelent. De az Expo ticketje csak annyit mond, hogy ÁTVETTE a küldést — a tényleges
 * kézbesítés eredménye a RECEIPT-ben van, amit külön kell lekérdezni, és ahol az APNs
 * hibák megjelennek (hiányzó hitelesítés, rossz bundle, letiltott eszköz).
 *
 * Emiatt a `{"sent":1}` válasz megtévesztő: úgy néz ki, mint siker, miközben a telefon
 * semmit nem kapott. Ez a szkript végigmegy a teljes láncon és megmondja, hol áll meg.
 *
 *   node scripts/push-diagnose.js <email>
 */
require('dotenv').config();
const { Expo } = require('expo-server-sdk');
const { query } = require('../src/database/connection');

const EMAIL = process.argv[2] || 'eszti.teszt@housingsolutions.hu';
const expo = new Expo();

(async () => {
  console.log(`\n══ PUSH-DIAGNOSZTIKA — ${EMAIL} ═══════════════════════════\n`);

  // ── 1. Van-e token ────────────────────────────────────────────────────
  const t = await query(`
    SELECT pt.expo_push_token AS token, pt.platform, pt.device_name,
           COALESCE(u.preferred_language,'hu') AS lang, u.id AS user_id
      FROM user_push_tokens pt JOIN users u ON u.id = pt.user_id
     WHERE u.email = $1`, [EMAIL]);
  console.log(`1. TOKEN: ${t.rows.length} db`);
  for (const r of t.rows) {
    console.log(`   ${r.platform}/${r.device_name}  ${r.token.slice(0, 32)}…  nyelv: ${r.lang}`);
    console.log(`   érvényes Expo-token formátum: ${Expo.isExpoPushToken(r.token) ? 'IGEN' : 'NEM'}`);
  }
  if (t.rows.length === 0) { console.log('\n   → nincs token, itt megáll.\n'); process.exit(0); }

  // ── 2. Küldés → TICKET ────────────────────────────────────────────────
  const uzenetek = t.rows.map((r) => ({
    to: r.token,
    sound: 'default',
    title: 'Push-diagnosztika',
    body: 'Ha ezt látod a telefonon, a lánc végig működik.',
    data: { diagnostic: true },
  }));
  const tickets = [];
  for (const chunk of expo.chunkPushNotifications(uzenetek)) {
    try { tickets.push(...await expo.sendPushNotificationsAsync(chunk)); }
    catch (e) { console.log(`   KÜLDÉSI HIBA: ${e.message}`); }
  }
  console.log(`\n2. TICKET (az Expo átvette-e):`);
  for (const tk of tickets) {
    console.log(`   status=${tk.status}${tk.id ? `  id=${tk.id}` : ''}`);
    if (tk.status === 'error') {
      console.log(`   ⚠️ ${tk.message}`);
      console.log(`      details: ${JSON.stringify(tk.details || {})}`);
    }
  }

  const ids = tickets.filter((x) => x.status === 'ok' && x.id).map((x) => x.id);
  if (ids.length === 0) { console.log('\n   → nincs ticket-azonosító, a nyugta nem kérdezhető le.\n'); process.exit(0); }

  // ── 3. RECEIPT — ITT derül ki az APNs-hiba ────────────────────────────
  console.log(`\n3. RECEIPT (a tényleges kézbesítés) — várakozás az Expo feldolgozására…`);
  await new Promise((r) => setTimeout(r, 6000));
  const receipts = {};
  for (const chunk of expo.chunkPushNotificationReceiptIds(ids)) {
    try { Object.assign(receipts, await expo.getPushNotificationReceiptsAsync(chunk)); }
    catch (e) { console.log(`   NYUGTA-LEKÉRÉSI HIBA: ${e.message}`); }
  }
  if (Object.keys(receipts).length === 0) {
    console.log('   (még nincs feldolgozva — ez normális lehet, de ismételt üres nyugta gyanús)');
  }
  for (const [id, r] of Object.entries(receipts)) {
    console.log(`   ${id}: status=${r.status}`);
    if (r.status === 'error') {
      console.log(`   ⚠️ ${r.message}`);
      console.log(`      details: ${JSON.stringify(r.details || {})}`);
      const kod = r.details?.error;
      const MAGYARAZAT = {
        DeviceNotRegistered: 'Az eszköz leiratkozott vagy törölte az appot — a token halott.',
        MessageTooBig: 'Túl nagy az üzenet.',
        MessageRateExceeded: 'Túl sok üzenet rövid idő alatt.',
        MismatchSenderId: 'ANDROID: az FCM sender-id nem egyezik — rossz google-services.json.',
        InvalidCredentials: 'APNS/FCM HITELESÍTÉS HIÁNYZIK VAGY ROSSZ az Expo-projektben. '
          + 'Ez a leggyakoribb ok, ha a ticket ok, de a telefon néma.',
      };
      if (kod && MAGYARAZAT[kod]) console.log(`      → ${MAGYARAZAT[kod]}`);
    }
  }
  console.log();
  process.exit(0);
})();
