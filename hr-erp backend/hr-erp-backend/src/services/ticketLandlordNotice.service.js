/**
 * Szállásadói továbbítás — ahol a szerződés szerint a SZÁLLÁSADÓ intézi a karbantartást.
 *
 * A FOLYAMAT
 * ----------
 * Nem minden szállásadónak lesz app-hozzáférése, ezért a jegy e-mailben megy, egy LEJÁRÓ
 * linkkel, amin belépés nélkül látja a jegyet és visszajelezhet (megkaptam / folyamatban
 * / javítva). A link az EGYESÍTETT `share_links` táblán ül — nem épült negyedik
 * megosztási mechanizmus.
 *
 * ⚠️ A TOVÁBBÍTÁS NEM HELYETTESÍTI A SZIGNÁLÁST. A jegy nálunk is felelőshöz kerül, aki
 * követi, hogy a szállásadó megcsinálja-e. Ha ezt elhagynánk, a jegy átkerülne egy olyan
 * félhez, aki felett nincs eszközünk, és senki nem venné észre, ha nem történik semmi.
 *
 * ⚠️ AMI HIÁNYZIK, AZ LÁTSZIK, NEM ELNYELŐDIK. Ha nincs SMTP, vagy nincs a szállásadónak
 * e-mail címe, a szabály AKKOR IS lefut: a jegy megkapja a jelölést és a felelőst, és a
 * hiány a jegyen marad látható. A csendes elnyelés a rosszabb — ugyanaz az elv, mint az
 * áfa-blokkolásnál a bérbeadói rezsi-jelzésnél.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const shareLinks = require('./shareLink.service');

/** Be van-e egyáltalán állítva a levélküldés. Enélkül az e-mailes rész nem él. */
const smtpConfigured = () => Boolean(
  (process.env.SMTP_USER && process.env.SMTP_PASS) || (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD),
);

/**
 * Ki intézi ezt a jegyet: mi vagy a szállásadó?
 *
 * A kategóriára szóló sor ERŐSEBB a házszintűnél — életszerűen a kazán a szállásadóé, a
 * villanykörte a miénk. Ahol nincs sor, az alapértelmezés 'mi': a korábbi viselkedés.
 */
async function handledBy(accommodationId, categoryId) {
  if (!accommodationId) return { handled_by: 'mi', source: 'nincs szállás' };
  const r = await query(`
    SELECT handled_by, category_id
      FROM accommodation_maintenance_rules
     WHERE accommodation_id = $1 AND (category_id = $2 OR category_id IS NULL)
     ORDER BY category_id NULLS LAST
     LIMIT 1`, [accommodationId, categoryId || null]);
  if (r.rows.length === 0) return { handled_by: 'mi', source: 'nincs szabály (alapértelmezés)' };
  return {
    handled_by: r.rows[0].handled_by,
    source: r.rows[0].category_id ? 'kategória-szintű szabály' : 'ház-szintű szabály',
  };
}

/** A szállásadó ELSŐDLEGES kapcsolattartója — az ő e-mail címére megy a továbbítás. */
async function primaryContact(accommodationId) {
  const r = await query(`
    SELECT pc.name, pc.email, pc.phone, c.name AS landlord_name, c.id AS landlord_id,
           c.email AS landlord_email
      FROM accommodations a
      JOIN contractors c ON c.id = a.current_contractor_id
      LEFT JOIN partner_contacts pc
             ON pc.contractor_id = c.id AND pc.is_primary AND pc.is_active
     WHERE a.id = $1
     LIMIT 1`, [accommodationId]);
  const x = r.rows[0];
  if (!x) return null;
  // Ha nincs kapcsolattartó e-mail, a partner saját címe a tartalék.
  return { ...x, effective_email: x.email || x.landlord_email || null };
}

/**
 * A továbbítás elvégzése. Mindig visszaad egy állapotot — a hívó ebből tudja, mi hiányzik.
 * Soha nem dob: a jegy létrejötte a fontosabb.
 */
async function forwardIfNeeded(ticketId, { accommodationId, categoryId, userId = null } = {}) {
  try {
    const dontes = await handledBy(accommodationId, categoryId);
    if (dontes.handled_by !== 'szallasado') {
      return { forwarded: false, reason: 'mi intézzük', ...dontes };
    }

    const kapcsolat = await primaryContact(accommodationId);
    const cfg = (await query('SELECT share_link_days FROM ticket_assignment_config LIMIT 1')).rows[0];
    const napok = cfg?.share_link_days || 30;

    // A LINK AKKOR IS ELKÉSZÜL, ha most nem tudjuk elküldeni: így amint megvan a cím
    // vagy az SMTP, a levél kimehet anélkül, hogy bárki újra végigmenne a jegyeken.
    const link = await shareLinks.mint({
      targetType: 'ticket', targetId: ticketId,
      context: { landlord_id: kapcsolat?.landlord_id || null },
      expiresInDays: napok, createdBy: userId,
      notes: `Szállásadói továbbítás — ${kapcsolat?.landlord_name || 'ismeretlen szállásadó'}`,
    });

    const cim = kapcsolat?.effective_email || null;
    const kuldheto = Boolean(cim) && smtpConfigured();

    await query(
      `UPDATE tickets
          SET landlord_notified_at = CASE WHEN $2::boolean THEN NOW() ELSE NULL END,
              landlord_contact_email = $3, updated_at = NOW()
        WHERE id = $1`, [ticketId, kuldheto, cim]);

    if (!kuldheto) {
      // NEM hiba, hanem hiányzó előfeltétel — ezért figyelmeztetés, és a jegyen látható.
      const mi = !cim ? 'nincs e-mail címe a szállásadó kapcsolattartójának'
        : 'az SMTP nincs beállítva élesben';
      logger.warn(`[landlordNotice] ${ticketId}: a szállásadó intézné, DE ${mi} — `
        + 'a link elkészült, a levél nem ment ki');
      return { forwarded: false, reason: mi, link_ready: true, token: link.data?.token,
               landlord: kapcsolat?.landlord_name || null, ...dontes };
    }

    // A tényleges levélküldés a generikus e-mail-küldő megépüléséig itt áll meg — ma az
    // email.service csak számlaküldést tud. A link és a jelölés viszont már kész.
    return { forwarded: true, link_ready: true, token: link.data?.token,
             email: cim, landlord: kapcsolat?.landlord_name || null, ...dontes };
  } catch (e) {
    logger.error('[landlordNotice] hiba:', e.message);
    return { forwarded: false, reason: `hiba: ${e.message}` };
  }
}

/**
 * Azok a jegyek, ahol a szállásadót értesítettük, de X napja nincs visszajelzés.
 * A nálunk kijelölt felelősnek szól — ő az, akinek lépnie kell.
 */
async function overdueWithoutResponse() {
  const r = await query(`
    SELECT t.id, t.ticket_number, t.title, t.assigned_to, t.landlord_notified_at,
           t.landlord_contact_email, t.landlord_reminded_at,
           EXTRACT(DAY FROM NOW() - t.landlord_notified_at)::int AS napja,
           c.landlord_notice_days
      FROM tickets t
      JOIN ticket_statuses s ON s.id = t.status_id
      CROSS JOIN (SELECT landlord_notice_days FROM ticket_assignment_config LIMIT 1) c
     WHERE t.landlord_notified_at IS NOT NULL
       AND t.landlord_status IS NULL
       AND COALESCE(s.is_final, false) = false
       AND t.landlord_notified_at < NOW() - (c.landlord_notice_days || ' days')::interval
     ORDER BY t.landlord_notified_at`);
  return r.rows;
}

/** A szállásadó visszajelzése a lejáró linken keresztül. */
async function recordResponse(ticketId, status) {
  if (!['megkaptam', 'folyamatban', 'javitva'].includes(status)) {
    return { error: 'Érvénytelen visszajelzés', status: 400 };
  }
  const r = await query(
    `UPDATE tickets SET landlord_status = $2, landlord_responded_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING id, ticket_number, landlord_status`, [ticketId, status]);
  if (r.rows.length === 0) return { error: 'Jegy nem található', status: 404 };
  return { data: r.rows[0] };
}

module.exports = { handledBy, primaryContact, forwardIfNeeded, overdueWithoutResponse,
                   recordResponse, smtpConfigured };
