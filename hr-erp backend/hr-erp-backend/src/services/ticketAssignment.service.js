/**
 * Hibajegy-szignálás — GAZDÁTLAN JEGY NEM MARADHAT.
 *
 * AMI EZT KIVÁLTOTTA
 * ------------------
 * Eszti két mobilos jegye (#19, #20) senkire nem került, és senki nem kapott róla
 * értesítést. Három független ok volt rá: a szabályok üres szerepkörökre mutattak
 * (`admin`, `facility_manager` — nulla aktív felhasználó), a prioritás-szótár nem egyezett
 * (`normal` vs `medium`/`low`), és a végfogás azonos `contractor_id`-jú admint keresett,
 * amilyen a lakó bérlőjén nem volt.
 *
 * A TANULSÁG, AMI A FELÉPÍTÉST ADJA: minden eddigi ág FELTÉTELES volt. Elég volt egy
 * hiányzó szerepkör vagy egy elgépelt slug, és a jegy némán gazdátlan maradt. Ezért itt a
 * lánc UTOLSÓ eleme feltétel nélküli: a konfigurált alapértelmezett felelős, aki nem függ
 * se szerepkörtől, se bérlőtől, se szabálytól. Ő osztja tovább.
 *
 * Egy jegy inkább kerüljön ideiglenesen rossz emberhez, mint senkihez.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/** A beállítás egysoros — a consolidation_config / expiry_monitor_config mintájára. */
async function getConfig() {
  const r = await query(`
    SELECT c.*, u.email AS default_assignee_email,
           u.first_name || ' ' || COALESCE(u.last_name,'') AS default_assignee_name,
           u.is_active AS default_assignee_active
      FROM ticket_assignment_config c
      LEFT JOIN users u ON u.id = c.default_assignee_id
     LIMIT 1`);
  return r.rows[0] || null;
}

/**
 * A szálláshoz kijelölt felelős.
 *
 * SZÁNDÉKOSAN NEM ÚJ TÁBLÁBÓL. A Phase 4-ben az a döntés született, hogy nem építünk
 * `user_accommodations` hozzárendelő táblát. Az `inspection_schedules` viszont MÁR MA is
 * pont ezt fejezi ki — `(accommodation_id, default_inspector_id)` —, csak nem volt
 * feltöltve. Aki a házat ellenőrzi, az ismeri a házat; nincs okunk két külön listát
 * vezetni ugyanarról az emberről.
 */
async function responsibleForAccommodation(accommodationId) {
  if (!accommodationId) return null;
  const r = await query(`
    SELECT u.id, u.email, u.first_name || ' ' || COALESCE(u.last_name,'') AS name
      FROM inspection_schedules s
      JOIN users u ON u.id = s.default_inspector_id
     WHERE s.accommodation_id = $1 AND s.is_active AND u.is_active
     ORDER BY s.updated_at DESC NULLS LAST
     LIMIT 1`, [accommodationId]);
  return r.rows[0] || null;
}

/** A jegyhez kötött lakó szállása. A jegyen nincs szállás-mező (és nem is kell). */
async function accommodationOfTicket(ticketId) {
  const r = await query(`
    SELECT e.accommodation_id, a.name AS accommodation_name
      FROM tickets t
      JOIN employees e ON e.id = t.linked_employee_id
      LEFT JOIN accommodations a ON a.id = e.accommodation_id
     WHERE t.id = $1`, [ticketId]);
  return r.rows[0] || null;
}

/**
 * A teljes szignálási lánc. Visszaadja, KI kapta és MIÉRT — az indok nem dísz:
 * enélkül egy váratlan szignálásnál nem lehet megmondani, melyik ág futott.
 */
async function resolveAssignee(ticketId) {
  const hely = await accommodationOfTicket(ticketId);

  // 1. a szálláshoz kijelölt felelős
  if (hely?.accommodation_id) {
    const felelos = await responsibleForAccommodation(hely.accommodation_id);
    if (felelos) {
      return { userId: felelos.id, reason: `szállás felelőse (${hely.accommodation_name})`,
               source: 'accommodation', accommodationId: hely.accommodation_id };
    }
  }

  // 2. az alapértelmezett felelős — FELTÉTEL NÉLKÜL
  const cfg = await getConfig();
  if (cfg?.default_assignee_id && cfg.default_assignee_active) {
    return { userId: cfg.default_assignee_id, reason: 'alapértelmezett felelős',
             source: 'default', accommodationId: hely?.accommodation_id || null };
  }

  // Ide csak akkor jutunk, ha a beállított felelős hiányzik vagy inaktív. Ez konfigurációs
  // hiba, nem normál üzem — ezért HANGOSAN naplózzuk, nem csendben nyeljük el.
  logger.error('[ticketAssignment] NINCS alapértelmezett felelős beállítva — a jegy '
    + `gazdátlan marad (ticket ${ticketId}). Állítsd be a ticket_assignment_config táblában.`);
  return { userId: null, reason: 'nincs beállított alapértelmezett felelős',
           source: 'none', accommodationId: hely?.accommodation_id || null };
}

/** A szignálás végrehajtása + naplózás. Soha nem dob: a jegy létrejötte a fontosabb. */
async function assign(ticketId) {
  try {
    const t = await query('SELECT id, assigned_to FROM tickets WHERE id = $1', [ticketId]);
    if (t.rows.length === 0) return null;
    if (t.rows[0].assigned_to) return { userId: t.rows[0].assigned_to, reason: 'már szignálva', source: 'existing' };

    const d = await resolveAssignee(ticketId);
    if (!d.userId) return d;

    await query(
      `UPDATE tickets SET assigned_to = $2, updated_at = NOW() WHERE id = $1 AND assigned_to IS NULL`,
      [ticketId, d.userId]);
    logger.info(`[ticketAssignment] ${ticketId} → ${d.userId} (${d.reason})`);
    return d;
  } catch (e) {
    logger.error('[ticketAssignment] hiba:', e.message);
    return { userId: null, reason: `hiba: ${e.message}`, source: 'error' };
  }
}

module.exports = { getConfig, resolveAssignee, assign, responsibleForAccommodation, accommodationOfTicket };
