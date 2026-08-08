/**
 * Audience resolution for resident video communication (mig 143).
 *
 * ONE resolver for all three send modes (ad-hoc, drip, calendar) so "who it concerns"
 * means exactly the same thing everywhere.
 *
 * The default is NOT everyone: an empty audience resolves to nobody. Blanket sends are
 * possible only by asking for them explicitly with `{ all: true }`.
 *
 * A recipient must be an ACTIVE employee WITH a user account — a resident who cannot log
 * in cannot watch a video, so including them would only inflate compliance denominators.
 *
 * Audience shape (all keys optional, combined with AND across kinds, OR within a kind):
 *   {
 *     all: false,
 *     accommodation_ids: [uuid], workplace_ids: [uuid], megbizo_ids: [uuid],
 *     contractor_ids: [uuid],  nationalities: ['PH','UA'], languages: ['uk','tl']
 *   }
 *
 * Coverage reality on prod (2026-08): accommodation 287/288 · workplace 283/288 ·
 * megbízó 18 · nationality 0 · preferred_language 'hu' for everyone. The nationality and
 * language filters therefore match nobody until that data is captured — resolve() reports
 * this through `warnings` rather than silently returning an empty list.
 */
const { query } = require('../database/connection');

const LANGS = ['hu', 'en', 'uk', 'tl', 'de'];
const DEFAULT_LANG = 'hu';

const arr = (v) => (Array.isArray(v) && v.length ? v : null);

/**
 * @param {object} audience
 * @param {object} [opts] { client } — pg client when inside a transaction
 * @returns {Promise<{recipients: Array, count: number, warnings: string[], criteria: object}>}
 *          recipient = { user_id, employee_id, language, first_name, last_name }
 */
async function resolve(audience = {}, opts = {}) {
  const exec = opts.client || { query };
  const warnings = [];

  const accs = arr(audience.accommodation_ids);
  const works = arr(audience.workplace_ids);
  const megb = arr(audience.megbizo_ids);
  const ctrs = arr(audience.contractor_ids);
  const nats = arr(audience.nationalities);
  const langs = arr(audience.languages);
  const all = audience.all === true;

  const anyFilter = accs || works || megb || ctrs || nats || langs;
  if (!all && !anyFilter) {
    // Deliberate: no criteria means nobody, never everybody.
    return { recipients: [], count: 0, warnings: ['Nincs célközönség megadva — senki sem kapja meg.'], criteria: audience };
  }

  const where = [
    'e.end_date IS NULL',
    'e.user_id IS NOT NULL',
    'u.is_active = TRUE',
  ];
  const params = [];
  const add = (sql, val) => { params.push(val); where.push(sql.replace('$?', `$${params.length}`)); };

  if (!all) {
    const ors = [];
    if (accs)  { params.push(accs);  ors.push(`e.accommodation_id = ANY($${params.length}::uuid[])`); }
    if (works) { params.push(works); ors.push(`e.workplace_id = ANY($${params.length}::uuid[])`); }
    if (megb)  { params.push(megb);  ors.push(`e.billing_client_id = ANY($${params.length}::uuid[])`); }
    if (ctrs)  { params.push(ctrs);  ors.push(`e.contractor_id = ANY($${params.length}::uuid[])`); }
    if (nats)  { params.push(nats);  ors.push(`e.nationality = ANY($${params.length}::text[])`); }
    if (langs) { params.push(langs); ors.push(`COALESCE(u.preferred_language,'${DEFAULT_LANG}') = ANY($${params.length}::text[])`); }
    if (ors.length) where.push(`(${ors.join(' OR ')})`);
  }

  const rows = (await exec.query(
    `SELECT e.user_id, e.id AS employee_id, e.first_name, e.last_name,
            COALESCE(u.preferred_language, $${params.length + 1}) AS language
       FROM employees e
       JOIN users u ON u.id = e.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.last_name, e.first_name`,
    [...params, DEFAULT_LANG])).rows;

  // Surface the two filters that currently match nothing, so an empty send is never a mystery.
  if (nats && rows.length === 0) warnings.push('Nemzetiség szűrő: az employees.nationality mező jelenleg üres — nincs találat.');
  if (langs && rows.length === 0) warnings.push('Nyelv szűrő: minden felhasználó nyelve alapértelmezett (hu) — nincs találat.');
  if (rows.length === 0 && !warnings.length) warnings.push('A megadott szűrőkre egyetlen aktív, belépésre képes lakó sem illeszkedik.');

  return {
    recipients: rows.map((r) => ({ ...r, language: LANGS.includes(r.language) ? r.language : DEFAULT_LANG })),
    count: rows.length,
    warnings,
    criteria: audience,
  };
}

/** Options the admin audience picker offers, with live counts so a gap is visible up front. */
async function options() {
  const [accs, works, megbs, nats, langs] = await Promise.all([
    query(`SELECT a.id, a.name, COUNT(e.id)::int AS residents
             FROM accommodations a
             LEFT JOIN employees e ON e.accommodation_id = a.id AND e.end_date IS NULL AND e.user_id IS NOT NULL
            WHERE a.is_active = TRUE GROUP BY a.id, a.name ORDER BY a.name`),
    query(`SELECT w.id, w.name, COUNT(e.id)::int AS residents
             FROM workplaces w
             LEFT JOIN employees e ON e.workplace_id = w.id AND e.end_date IS NULL AND e.user_id IS NOT NULL
            GROUP BY w.id, w.name ORDER BY w.name`),
    query(`SELECT c.id, c.name, COUNT(e.id)::int AS residents
             FROM contractors c
             JOIN contractor_roles cr ON cr.contractor_id = c.id AND cr.role = 'megbizo'
             LEFT JOIN employees e ON e.billing_client_id = c.id AND e.end_date IS NULL AND e.user_id IS NOT NULL
            GROUP BY c.id, c.name ORDER BY c.name`),
    query(`SELECT nationality AS value, COUNT(*)::int AS residents
             FROM employees WHERE nationality IS NOT NULL AND end_date IS NULL AND user_id IS NOT NULL
            GROUP BY nationality ORDER BY nationality`),
    query(`SELECT COALESCE(u.preferred_language,'hu') AS value, COUNT(*)::int AS residents
             FROM employees e JOIN users u ON u.id = e.user_id
            WHERE e.end_date IS NULL GROUP BY 1 ORDER BY 1`),
  ]);
  return {
    accommodations: accs.rows, workplaces: works.rows, megbizok: megbs.rows,
    nationalities: nats.rows, languages: langs.rows,
    total_reachable: (await query(
      `SELECT COUNT(*)::int c FROM employees e JOIN users u ON u.id = e.user_id
        WHERE e.end_date IS NULL AND u.is_active = TRUE`)).rows[0].c,
  };
}

module.exports = { resolve, options, LANGS, DEFAULT_LANG };
