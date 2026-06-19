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
  ticket_message: {
    hu: (v) => ({ title: `Új üzenet — ${v.ticketNumber || 'hibajegy'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'Új üzenet érkezett') }),
    en: (v) => ({ title: `New message — ${v.ticketNumber || 'ticket'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'You have a new message') }),
    uk: (v) => ({ title: `Нове повідомлення — ${v.ticketNumber || 'заявка'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'Нове повідомлення') }),
    tl: (v) => ({ title: `Bagong mensahe — ${v.ticketNumber || 'ticket'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'May bagong mensahe ka') }),
    de: (v) => ({ title: `Neue Nachricht — ${v.ticketNumber || 'Ticket'}`, body: v.sender ? `${v.sender}: ${v.preview || ''}` : (v.preview || 'Neue Nachricht erhalten') }),
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

  const ok = tickets.filter((tk) => tk && tk.status === 'ok').length;
  return { sent: ok };
}

module.exports = { sendToUser };
