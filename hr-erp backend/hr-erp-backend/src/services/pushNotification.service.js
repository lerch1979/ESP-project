/**
 * Push notification delivery via the Expo Push Service.
 *
 * One public entry point — sendToUser(userId, payload) — looks up the user's
 * registered device tokens + their preferred language, localizes the title/body
 * per recipient, sends in chunks, and prunes any token Expo reports as
 * DeviceNotRegistered. Entirely best-effort: every failure is swallowed so a
 * push problem can never break the calling workflow (mirrors inAppNotification).
 *
 * Requires FCM credentials configured in the Expo project for Android delivery
 * (standalone APK). Without them the send is accepted by Expo but not delivered;
 * the code path is unaffected.
 */
const { Expo } = require('expo-server-sdk');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const expo = new Expo();

// Localized push copy per notification type + language. Falls back to the
// caller-supplied fallbackTitle/fallbackBody (Hungarian) when a type/lang has
// no template. Keep these SHORT — they show on the lock screen.
const LANGS = ['hu', 'en', 'uk', 'tl', 'de'];

const TEMPLATES = {
  // video_announcement — the ONE type whose copy is not a fixed template.
  // A video's title and description are free text written by staff, so there is nothing
  // to hardcode. The caller (videoAnnounce.service) has already run the text through
  // translation.service for THIS recipient's language, so every language simply reads the
  // supplied vars. Keeping it in the map (rather than leaning on fallbackTitle) makes the
  // type explicit and keeps localize() the single place push copy is decided.
  video_announcement: Object.fromEntries(
    LANGS.map((l) => [l, (v) => ({ title: v.title || '', body: v.body || '' })]),
  ),

  ticket_message: {
    hu: (v) => ({ title: `Új üzenet — ${v.ticketNumber || 'hibajegy'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'Új üzenet érkezett') }),
    en: (v) => ({ title: `New message — ${v.ticketNumber || 'ticket'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'You have a new message') }),
    uk: (v) => ({ title: `Нове повідомлення — ${v.ticketNumber || 'заявка'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'Нове повідомлення') }),
    tl: (v) => ({ title: `Bagong mensahe — ${v.ticketNumber || 'ticket'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'May bagong mensahe ka') }),
    de: (v) => ({ title: `Neue Nachricht — ${v.ticketNumber || 'Ticket'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'Neue Nachricht erhalten') }),
  },
  // ÚJ JEGY AZ ÉRINTETT LAKÓNAK. Akkor megy ki, ha az IRODA nyitott jegyet a lakó
  // nevében — addig a lakó nem tudta, hogy az ügyével foglalkozunk. Öt nyelven, mert a
  // lakók fele nem magyar, és egy magyar push ugyanannyit mond nekik, mint a semmi.
  ticket_created: {
    hu: (v) => ({ title: `Új hibajegy — ${v.ticketNumber || ''}`.trim(),
                  body: v.title ? `${v.title}` : 'Hibajegy készült az ügyedben' }),
    en: (v) => ({ title: `New ticket — ${v.ticketNumber || ''}`.trim(),
                  body: v.title ? `${v.title}` : 'A ticket was opened for you' }),
    uk: (v) => ({ title: `Нова заявка — ${v.ticketNumber || ''}`.trim(),
                  body: v.title ? `${v.title}` : 'Для вас створено заявку' }),
    tl: (v) => ({ title: `Bagong ticket — ${v.ticketNumber || ''}`.trim(),
                  body: v.title ? `${v.title}` : 'May ticket na binuksan para sa iyo' }),
    de: (v) => ({ title: `Neues Ticket — ${v.ticketNumber || ''}`.trim(),
                  body: v.title ? `${v.title}` : 'Für dich wurde ein Ticket angelegt' }),
  },
  // TEENDŐ A LAKÓNAK (mig 172). Csak a NEKI szóló feladatról megy ki — a lakóRÓL szóló
  // belső teendő soha nem érinti a telefonját.
  task_assigned: {
    hu: (v) => ({ title: 'Új teendőd van', body: v.dueDate ? `${v.title} — határidő: ${v.dueDate}` : v.title }),
    en: (v) => ({ title: 'You have a new task', body: v.dueDate ? `${v.title} — due: ${v.dueDate}` : v.title }),
    uk: (v) => ({ title: 'У вас нове завдання', body: v.dueDate ? `${v.title} — до: ${v.dueDate}` : v.title }),
    tl: (v) => ({ title: 'May bago kang gawain', body: v.dueDate ? `${v.title} — hanggang: ${v.dueDate}` : v.title }),
    de: (v) => ({ title: 'Du hast eine neue Aufgabe', body: v.dueDate ? `${v.title} — Frist: ${v.dueDate}` : v.title }),
  },
  expiry_alert: {
    hu: (v) => ({ title: v.field === 'visa' ? 'Vízum lejárat' : 'Szerződés lejárat', body: expiryBody(v, { soon: (n) => `A ${who(v, 'hu')} ${n} nap múlva lejár.`, today: () => `A ${who(v, 'hu')} ma lejár.`, past: (n) => `A ${who(v, 'hu')} ${n} napja lejárt.` }) }),
    en: (v) => ({ title: v.field === 'visa' ? 'Visa expiry' : 'Contract expiry', body: expiryBody(v, { soon: (n) => `Your ${who(v, 'en')} expires in ${n} days.`, today: () => `Your ${who(v, 'en')} expires today.`, past: (n) => `Your ${who(v, 'en')} expired ${n} days ago.` }) }),
    uk: (v) => ({ title: v.field === 'visa' ? 'Закінчення візи' : 'Закінчення договору', body: expiryBody(v, { soon: (n) => `Ваш(а) ${who(v, 'uk')} закінчується через ${n} дн.`, today: () => `Ваш(а) ${who(v, 'uk')} закінчується сьогодні.`, past: (n) => `Ваш(а) ${who(v, 'uk')} закінчився(лась) ${n} дн. тому.` }) }),
    tl: (v) => ({ title: v.field === 'visa' ? 'Pag-expire ng visa' : 'Pag-expire ng kontrata', body: expiryBody(v, { soon: (n) => `Mag-e-expire ang iyong ${who(v, 'tl')} sa ${n} araw.`, today: () => `Mag-e-expire ang iyong ${who(v, 'tl')} ngayon.`, past: (n) => `Nag-expire ang iyong ${who(v, 'tl')} ${n} araw na ang nakalipas.` }) }),
    de: (v) => ({ title: v.field === 'visa' ? 'Visum-Ablauf' : 'Vertragsende', body: expiryBody(v, { soon: (n) => `Dein ${who(v, 'de')} läuft in ${n} Tagen ab.`, today: () => `Dein ${who(v, 'de')} läuft heute ab.`, past: (n) => `Dein ${who(v, 'de')} ist vor ${n} Tagen abgelaufen.` }) }),
  },
};

const WHO = {
  hu: { visa: 'vízumod', contract: 'szerződésed' },
  en: { visa: 'visa', contract: 'contract' },
  uk: { visa: 'віза', contract: 'договір' },
  tl: { visa: 'visa', contract: 'kontrata' },
  de: { visa: 'Visum', contract: 'Vertrag' },
};
function who(v, lang) { return (WHO[lang] || WHO.hu)[v.field] || v.field; }
function expiryBody(v, copy) {
  const n = Number(v.days);
  if (Number.isNaN(n)) return copy.soon('?');
  if (n > 0) return copy.soon(n);
  if (n === 0) return copy.today();
  return copy.past(Math.abs(n));
}

function localize(type, lang, vars, fallbackTitle, fallbackBody) {
  const byType = TEMPLATES[type];
  const fn = byType && (byType[lang] || byType.hu);
  if (fn) {
    try { return fn(vars || {}); } catch { /* fall through */ }
  }
  return { title: fallbackTitle, body: fallbackBody };
}

/**
 * Send a push to ALL of a user's devices, localized to their language.
 * payload: { type, vars, fallbackTitle, fallbackBody, data }
 */
async function sendToUser(userId, { type, vars = {}, fallbackTitle = '', fallbackBody = '', data = {} } = {}) {
  if (!userId) return { sent: 0 };
  let rows;
  try {
    const r = await query(
      `SELECT pt.expo_push_token AS token, COALESCE(u.preferred_language, 'hu') AS lang
         FROM user_push_tokens pt
         JOIN users u ON u.id = pt.user_id
        WHERE pt.user_id = $1`,
      [userId]
    );
    rows = r.rows;
  } catch (e) {
    logger.error('[push.sendToUser] token lookup failed:', e.message);
    return { sent: 0 };
  }
  if (!rows.length) return { sent: 0 };

  const messages = [];
  for (const row of rows) {
    if (!Expo.isExpoPushToken(row.token)) continue;
    const lang = LANGS.includes(row.lang) ? row.lang : 'hu';
    const { title, body } = localize(type, lang, vars, fallbackTitle, fallbackBody);
    messages.push({ to: row.token, sound: 'default', title, body, data: { type, ...data }, channelId: 'default' });
  }
  if (!messages.length) return { sent: 0 };

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    try {
      const res = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...res);
    } catch (e) {
      logger.warn('[push.sendToUser] chunk send failed:', e.message);
      // pad so ticket/message index alignment is preserved
      for (let i = 0; i < chunk.length; i++) tickets.push(null);
    }
  }

  // Prune dead tokens: Expo returns status:'error' with details.error
  // 'DeviceNotRegistered' for tokens that should never be used again.
  const dead = [];
  tickets.forEach((tk, i) => {
    if (tk && tk.status === 'error' && tk.details && tk.details.error === 'DeviceNotRegistered') {
      dead.push(messages[i].to);
    }
  });
  if (dead.length) {
    try {
      await query('DELETE FROM user_push_tokens WHERE expo_push_token = ANY($1)', [dead]);
      logger.info(`[push] pruned ${dead.length} dead token(s)`);
    } catch (e) {
      logger.warn('[push] dead-token prune failed:', e.message);
    }
  }

  // ── A KÜLDÉS NYOMA (mig 175) ─────────────────────────────────────────────
  // Minden üzenetről sor keletkezik, mert enélkül a receipt később nem kérdezhető le:
  // a ticket-azonosító csak itt, a válaszban létezik, és sehol máshol nem őrződik meg.
  // Az írás best-effort: ha elszáll, a push attól még elment.
  await Promise.all(tickets.map((tk, i) => {
    if (!tk) return Promise.resolve();
    const hibas = tk.status === 'error';
    return query(
      `INSERT INTO push_deliveries
         (user_id, expo_push_token, ticket_id, notification_type, status, error_code, error_message, checked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, messages[i].to, hibas ? null : (tk.id || null), type || null,
       hibas ? 'hibas' : 'atveve',
       hibas ? (tk.details && tk.details.error) || null : null,
       hibas ? tk.message || null : null,
       hibas ? new Date() : null]
    ).catch((e) => logger.warn(`[push] kézbesítési nyom nem íródott: ${e.message}`));
  }));

  const ok = tickets.filter((tk) => tk && tk.status === 'ok').length;
  // ⚠️ `accepted`, NEM `sent`. Az Expo átvette — a telefon még nem feltétlenül kapta meg.
  // A régi `sent` kulcs megmarad, hogy a meglévő hívók ne törjenek el, de a jelentése
  // ugyanez: átvétel, nem kézbesítés.
  return { sent: ok, accepted: ok, rejected: tickets.filter((tk) => tk && tk.status === 'error').length };
}

/**
 * NYUGTA-LEKÉRDEZÉS — itt derül ki, hogy a push TÉNYLEGESEN megérkezett-e.
 *
 * Az Expo a receipteket a küldés után néhány másodperccel kezdi kiadni, és korlátozott
 * ideig őrzi. Ezért ez rendszeresen fut, nem a küldés útjában: egy szinkron várakozás a
 * jegy-létrehozást lassítaná el, egy elmaradt lekérdezés viszont csak késve derít fényt
 * a hibára — a kettő közül az utóbbi a jó irány.
 *
 * `DeviceNotRegistered` esetén a tokent töröljük: az eszköz leiratkozott vagy törölte az
 * appot, és a további küldés oda csak zajt termel.
 */
async function checkReceipts({ limit = 200, minAgeSeconds = 15 } = {}) {
  const { rows } = await query(
    `SELECT id, ticket_id, expo_push_token FROM push_deliveries
      WHERE status = 'atveve' AND ticket_id IS NOT NULL
        AND created_at < NOW() - ($2 || ' seconds')::interval
      ORDER BY created_at LIMIT $1`, [limit, String(minAgeSeconds)]);
  if (rows.length === 0) return { checked: 0, delivered: 0, failed: 0 };

  const byTicket = new Map(rows.map((r) => [r.ticket_id, r]));
  const receipts = {};
  for (const chunk of expo.chunkPushNotificationReceiptIds([...byTicket.keys()])) {
    try { Object.assign(receipts, await expo.getPushNotificationReceiptsAsync(chunk)); }
    catch (e) { logger.warn(`[push.receipts] lekérdezés: ${e.message}`); }
  }

  let delivered = 0; let failed = 0; const dead = [];
  for (const [ticketId, r] of Object.entries(receipts)) {
    const sor = byTicket.get(ticketId);
    if (!sor) continue;
    const hibas = r.status === 'error';
    const kod = hibas ? (r.details && r.details.error) || null : null;
    if (hibas) { failed++; if (kod === 'DeviceNotRegistered') dead.push(sor.expo_push_token); }
    else delivered++;
    await query(
      `UPDATE push_deliveries SET status=$2, error_code=$3, error_message=$4, checked_at=NOW()
        WHERE id=$1`,
      [sor.id, hibas ? 'hibas' : 'kezbesitve', kod, hibas ? r.message || null : null]
    ).catch(() => {});
  }

  if (dead.length) {
    await query('DELETE FROM user_push_tokens WHERE expo_push_token = ANY($1)', [dead])
      .catch((e) => logger.warn(`[push.receipts] halott token törlése: ${e.message}`));
    logger.info(`[push.receipts] ${dead.length} halott token törölve`);
  }

  if (failed > 0) {
    // HANGOSAN: egy sorozatos kézbesítési hiba rendszerint konfigurációs ok (hiányzó
    // APNs/FCM hitelesítés), és a felhasználók számára NÉMA — semmi nem jelzi nekik,
    // hogy nem kapnak értesítést.
    logger.error(`[push.receipts] ${failed} push NEM ért célba (${delivered} igen)`);
    try {
      const { alertOps } = require('../utils/opsAlert');
      alertOps(`[PUSH] ${failed} értesítés nem ért célba. `
        + 'Nézd meg a push_deliveries tábla hibás sorait — sorozatos hiba esetén '
        + 'rendszerint az APNs/FCM hitelesítés hiányzik az Expo-projektben.');
    } catch { /* a riasztás hiánya nem állíthatja meg az ellenőrzést */ }
  }
  return { checked: rows.length, delivered, failed };
}

/** A kézbesítés állapota — a felület ebből tud visszajelezni. */
async function deliveryStats({ days = 7 } = {}) {
  const r = await query(
    `SELECT status, count(*)::int AS db, count(DISTINCT user_id)::int AS erintett
       FROM push_deliveries WHERE created_at > NOW() - ($1 || ' days')::interval
      GROUP BY status`, [String(days)]);
  const ki = { atveve: 0, kezbesitve: 0, hibas: 0 };
  for (const x of r.rows) ki[x.status] = x.db;
  const hibak = await query(
    `SELECT error_code, count(*)::int AS db FROM push_deliveries
      WHERE status='hibas' AND created_at > NOW() - ($1 || ' days')::interval
      GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [String(days)]);
  return { ...ki, top_hibak: hibak.rows };
}

module.exports = { sendToUser, checkReceipts, deliveryStats };
