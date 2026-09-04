/**
 * Hiányzó adatok — which active employees are missing which fields, and a fill-in
 * workbook to collect them.
 *
 * WHY THIS EXISTS
 * ---------------
 * The 2026-09-04 intake audit found several features switched on and watching nothing:
 * the expiry monitor is enabled in production while all three of its inputs are empty,
 * the move-in video drip anchors on an arrival date 60% of the roster lacks, and no
 * resident has a language recorded so every translation resolves to Hungarian. None of
 * that is a configuration problem — the data was never captured at intake.
 *
 * The answer must not be "open 279 employee records and type". So this module is built
 * around a round trip: SEE what is missing → EXPORT only the gaps → fill in Excel →
 * RE-UPLOAD through the ordinary bulk import, which updates in place and writes only the
 * columns the file actually contains.
 *
 * ONE REGISTRY, THREE CONSUMERS
 * -----------------------------
 * FIELDS below drives the counts, the drill-down and the export columns. A field added
 * here appears in all three, so the view cannot drift from what the workbook collects —
 * which is the failure mode that made the bed-count and room-template flows diverge.
 *
 * The `header` is the Hungarian column title the bulk import already recognises
 * (employee.controller's COLUMN_MAP). That is not decoration: it is what makes the
 * exported file re-uploadable without anyone renaming a column.
 */
const XLSX = require('xlsx');
const { query } = require('../database/connection');

/** Only people actually on the roster — a leaver's blank visa date is not a gap. */
const ACTIVE = `(e.end_date IS NULL OR e.end_date > CURRENT_DATE)`;

/**
 * @property {string} key       stable id used by the API and the UI
 * @property {string} label     Hungarian label for the view
 * @property {string} header    Excel column title the bulk import understands
 * @property {string} missing   SQL predicate that is TRUE when the field is missing
 * @property {string} [select]  expression exported for this column (defaults to blank)
 * @property {string} why       what breaks while it is empty — shown in the UI
 */
const FIELDS = [
  {
    key: 'visa_expiry', label: 'Vízum lejárat', header: 'Vízum lejárat',
    missing: 'e.visa_expiry IS NULL',
    why: 'A lejárat-figyelő be van kapcsolva, de e nélkül nincs mit figyelnie.',
  },
  {
    key: 'contract_end', label: 'Szerződés lejárat', header: 'Szerződés lejárat',
    missing: 'e.end_date IS NULL',
    why: 'Szerződés-lejárati riasztás nem tud elindulni.',
  },
  {
    key: 'nationality', label: 'Nemzetiség', header: 'Nemzetiség',
    missing: `e.nationality IS NULL OR btrim(e.nationality) = ''`,
    why: 'A lejárat-figyelő nemzetiség szerinti szabályai sosem illeszkednek.',
  },
  {
    key: 'social_security_number', label: 'TAJ szám', header: 'TAJ szám',
    missing: 'e.social_security_number IS NULL',
    why: 'Gyengíti a duplikáció-felismerést az újraimportnál.',
  },
  {
    key: 'passport_number', label: 'Útlevél / szem. ig. szám', header: 'Útlevélszám',
    missing: 'e.passport_number IS NULL',
    why: 'Gyengíti a duplikáció-felismerést az újraimportnál.',
  },
  {
    key: 'preferred_language', label: 'Nyelv', header: 'Nyelv',
    missing: 'e.preferred_language IS NULL',
    why: 'Fordítás és nyelvi célzás nélküle mindenkinek magyarul megy ki.',
  },
  {
    key: 'billing_client_id', label: 'Megbízó', header: 'Megbízó',
    missing: 'e.billing_client_id IS NULL',
    why: 'A szállásdíj nem rendelhető megbízóhoz — kimarad az elszámolásból.',
  },
  {
    key: 'room_id', label: 'Szoba', header: 'Szobaszám',
    missing: 'e.room_id IS NULL',
    // The text the file already carries is worth exporting: often the room number is
    // known and only the link is missing.
    select: 'e.room_number',
    why: 'Nincs szobához kötve — az ágy-szintű kihasználtság és a szállástábla hiányos.',
  },
  {
    key: 'arrival_date', label: 'Érkezés dátuma', header: 'Érkezés dátuma',
    missing: 'e.arrival_date IS NULL',
    why: 'A beköltözési videó-sorozat erre a dátumra horgonyoz — e nélkül nem indul el.',
  },
  {
    key: 'document', label: 'Feltöltött dokumentum', header: null,   // not fillable in Excel
    missing: `NOT EXISTS (SELECT 1 FROM employee_documents d WHERE d.employee_id = e.id)`,
    why: 'Dokumentum-lejárati figyelés csak feltöltött dokumentumra tud működni.',
  },
];

const byKey = (k) => FIELDS.find((f) => f.key === k);

/** Per-field counts for the overview. One pass, not one query per field. */
async function summary() {
  const cols = FIELDS.map((f) => `count(*) FILTER (WHERE ${f.missing}) AS "${f.key}"`).join(',\n         ');
  const r = await query(
    `SELECT count(*) AS total,
            ${cols}
       FROM employees e
      WHERE ${ACTIVE}`);
  const row = r.rows[0];
  const total = Number(row.total);
  return {
    active_employees: total,
    fields: FIELDS.map((f) => ({
      key: f.key,
      label: f.label,
      why: f.why,
      fillable_by_excel: !!f.header,
      missing: Number(row[f.key]),
      complete: total - Number(row[f.key]),
      pct_complete: total ? Math.round(((total - Number(row[f.key])) / total) * 100) : 100,
    })),
  };
}

/** Drill-down: who is missing this field. */
async function listMissing(key, { limit = 500 } = {}) {
  const f = byKey(key);
  if (!f) return null;
  const r = await query(
    `SELECT e.id, e.employee_number, e.last_name, e.first_name,
            TO_CHAR(e.birth_date,'YYYY-MM-DD') AS birth_date, e.mothers_name,
            a.name AS accommodation, e.room_number, e.workplace
       FROM employees e
       LEFT JOIN accommodations a ON a.id = e.accommodation_id
      WHERE ${ACTIVE} AND (${f.missing})
      ORDER BY e.last_name, e.first_name
      LIMIT $1`, [limit]);
  return { key, label: f.label, count: r.rows.length, employees: r.rows };
}

/**
 * Fill-in workbook: ONLY the affected people, ONLY the requested missing columns.
 *
 * The identity block (törzsszám, name, birth date, mother's name) is carried so the
 * re-upload can match people back — the import needs three agreeing identifying fields,
 * and these four give it that even if the site manager deletes a row. They are prefixed
 * "NE MÓDOSÍTSD" in the header because a well-meaning correction there turns an UPDATE
 * into a new person.
 */
async function buildWorkbook(keys, { onlyMissingRows = true } = {}) {
  const fields = keys.map(byKey).filter((f) => f && f.header);
  if (fields.length === 0) return null;

  // A person appears if they are missing ANY of the requested fields.
  const anyMissing = fields.map((f) => `(${f.missing})`).join(' OR ');
  const extraSelects = fields
    .map((f) => `${f.select || `NULL::text`} AS "col_${f.key}"`)
    .join(', ');

  const rows = (await query(
    `SELECT e.id, e.employee_number, e.last_name, e.first_name,
            TO_CHAR(e.birth_date,'YYYY-MM-DD') AS birth_date, e.mothers_name,
            a.name AS accommodation, ${extraSelects},
            ${fields.map((f) => `(${f.missing}) AS "miss_${f.key}"`).join(', ')}
       FROM employees e
       LEFT JOIN accommodations a ON a.id = e.accommodation_id
      WHERE ${ACTIVE} ${onlyMissingRows ? `AND (${anyMissing})` : ''}
      ORDER BY a.name NULLS LAST, e.last_name, e.first_name`)).rows;

  const ID_HEADERS = [
    'Törzsszám (NE MÓDOSÍTSD)',
    'Vezetéknév (NE MÓDOSÍTSD)',
    'Keresztnév (NE MÓDOSÍTSD)',
    'Születési dátum (NE MÓDOSÍTSD)',
    'Anyja neve (NE MÓDOSÍTSD)',
    'Szálláshely (tájékoztató)',
  ];
  const header = [...ID_HEADERS, ...fields.map((f) => f.header)];

  const aoa = [header];
  for (const r of rows) {
    aoa.push([
      r.employee_number || '', r.last_name || '', r.first_name || '',
      r.birth_date || '', r.mothers_name || '', r.accommodation || '',
      // Pre-fill what we already know; leave the actual gaps blank to be typed into.
      ...fields.map((f) => (r[`miss_${f.key}`] ? (r[`col_${f.key}`] || '') : '— megvan —')),
    ]);
  }

  const wb = XLSX.utils.book_new();

  const info = [
    ['HIÁNYZÓ ADATOK — kitöltő munkafüzet'],
    [`Készült: ${new Date().toISOString().slice(0, 10)}`],
    [`Érintett munkavállalók: ${rows.length}`],
    [],
    ['Kitöltendő oszlopok:'],
    ...fields.map((f) => [`  ${f.header}`, f.why]),
    [],
    ['FONTOS:'],
    ['  • A "NE MÓDOSÍTSD" oszlopok azonosítanak — ezek átírása új embert hoz létre a visszatöltésnél.'],
    ['  • Csak a kitöltendő oszlopokat töltsd ki. Az üresen hagyott mezők NEM írják felül a meglévő adatot.'],
    ['  • A "— megvan —" jelölés azt jelenti, hogy az az adat már megvan; hagyd úgy.'],
    ['  • Visszatöltés: Munkavállalók → Import, ugyanezzel a fájllal.'],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(info);
  wsInfo['!cols'] = [{ wch: 42 }, { wch: 68 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Útmutató');

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = header.map((h, i) => ({ wch: i < ID_HEADERS.length ? Math.max(18, h.length + 2) : Math.max(20, h.length + 4) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, 'Kitöltendő');

  return { buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), rows: rows.length, fields: fields.map((f) => f.header) };
}

module.exports = { FIELDS, summary, listMissing, buildWorkbook };
