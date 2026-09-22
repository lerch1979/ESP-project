/**
 * NYILVÁNOS hibajegy-nézet a szállásadónak — belépés nélkül, lejáró linken.
 *
 * ⚠️ EZ AZ EGYETLEN ÚTVONAL A RENDSZERBEN, AMI HITELESÍTÉS NÉLKÜL AD JEGY-ADATOT.
 * Ezért minden válasz SZŰKÍTETT: a szállásadó a hibát látja, nem a lakót. Se név, se
 * telefonszám, se belső megjegyzés, se a jegy előzménye nem megy ki — a karbantartáshoz
 * a hiba leírása és a helyszín kell, semmi több.
 *
 * A token feloldása az EGYESÍTETT `share_links` táblán megy (mig 170), ugyanazon a
 * `resolve()`-on, mint a könyvelői és az elszámoló-lapi linkek. Nem épült negyedik
 * mechanizmus — a lejárat és a visszavonás egy helyen dől el mind a négyre.
 */
const express = require('express');
const router = express.Router();
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const shareLinks = require('../services/shareLink.service');
const landlordNotice = require('../services/ticketLandlordNotice.service');
const inApp = require('../services/inAppNotification.service');

const ip = (req) => (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

/** A jegy a szállásadó szemével. */
router.get('/:token', async (req, res) => {
  try {
    const r = await shareLinks.resolve(req.params.token, { targetType: 'ticket', ip: ip(req) });
    if (r.error) return res.status(r.status).json({ success: false, message: r.error });

    // A SELECT szándékosan szűk: a lakó neve és elérhetősége NEM szerepel benne.
    const t = await query(`
      SELECT t.id, t.ticket_number, t.title, t.description, t.created_at,
             t.landlord_status, t.landlord_responded_at,
             tc.name AS category, p.name AS priority,
             a.name AS accommodation_name, a.address AS accommodation_address
        FROM tickets t
        LEFT JOIN ticket_categories tc ON tc.id = t.category_id
        LEFT JOIN priorities p ON p.id = t.priority_id
        LEFT JOIN employees e ON e.id = t.linked_employee_id
        LEFT JOIN accommodations a ON a.id = e.accommodation_id
       WHERE t.id = $1`, [r.data.target_id]);
    if (t.rows.length === 0) return res.status(404).json({ success: false, message: 'A jegy nem található' });

    res.json({ success: true, data: { ticket: t.rows[0], expires_at: r.data.expires_at } });
  } catch (e) {
    logger.error('[publicTicket.get]', e.message);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
});

/** Visszajelzés: megkaptam / folyamatban / javitva. */
router.post('/:token/response', async (req, res) => {
  try {
    const r = await shareLinks.resolve(req.params.token, { targetType: 'ticket', ip: ip(req) });
    if (r.error) return res.status(r.status).json({ success: false, message: r.error });

    const out = await landlordNotice.recordResponse(r.data.target_id, req.body?.status);
    if (out.error) return res.status(out.status).json({ success: false, message: out.error });

    // A visszajelzés NEM kerül a jegy üzenet-idővonalára, és ez szándékos: a
    // `ticket_messages.sender_id` kötelező, a szállásadó viszont nem felhasználónk.
    // Bármelyik létező user azonosítójával beírni azt jelentené, hogy egy kollégánk
    // nevében jelenik meg egy üzenet, amit nem ő írt — egy vitában ez rosszabb, mint ha
    // a bejegyzés nincs is ott. A visszajelzés ezért a jegy SAJÁT mezőiben él
    // (landlord_status + landlord_responded_at), és onnan jelenik meg a felületen.
    //
    // Ami viszont azonnal kell: a NÁLUNK kijelölt felelős tudja meg, hogy mozdult valami.
    const CIMKE = { megkaptam: 'Megkaptam', folyamatban: 'Folyamatban', javitva: 'Javítva' };
    const jegy = await query(
      'SELECT assigned_to, contractor_id, ticket_number, title FROM tickets WHERE id = $1',
      [r.data.target_id]);
    const j = jegy.rows[0];
    if (j?.assigned_to) {
      inApp.notify({
        userId: j.assigned_to,
        contractorId: j.contractor_id,
        type: 'ticket_created',
        title: `Szállásadói visszajelzés: ${CIMKE[req.body.status]}`,
        message: `${j.ticket_number} — ${j.title}`,
        link: `/tickets/${r.data.target_id}`,
        data: { ticket_id: r.data.target_id, landlord_status: req.body.status },
      }).catch((e) => logger.warn('[publicTicket] értesítés:', e.message));
    }

    res.json({ success: true, message: 'Köszönjük a visszajelzést', data: out.data });
  } catch (e) {
    logger.error('[publicTicket.response]', e.message);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
});

module.exports = router;
