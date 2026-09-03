/**
 * Probable-duplicate detection for the employee import — field scoring, as originally
 * specified.
 *
 * WHAT WAS SPECIFIED vs WHAT SHIPPED
 * ----------------------------------
 * The requirement was: warn when at least THREE identifying fields match. What the code
 * did was match on last_name + first_name + mothers_name — birth date omitted, despite
 * the comment above it claiming birth date was used — and the whole check was wrapped in
 * `if (row.last_name && row.mothers_name)`, so a file without a mother's-name column got
 * NO duplicate detection at all and every row inserted as a new person. That is how one
 * spreadsheet re-created 279 employees on 2026-09-03.
 *
 * Two rules follow from that, and they are the point of this module:
 *   1. The check ALWAYS runs. A missing column may lower confidence; it may never turn
 *      the check off.
 *   2. When the file carries too few identifying fields to reach three, the import says
 *      so per row instead of importing blindly.
 *
 * FIELD WEIGHTS ARE DELIBERATELY EQUAL
 * ------------------------------------
 * A passport number is stronger evidence than a first name, but weighting them would
 * mean one typo'd document number could outvote a full name+birthdate match. Three
 * independent agreements is the specified bar, and equal weighting keeps it legible:
 * anyone can look at a flagged row and count.
 *
 * NOTE ON THE ENCRYPTED FIELDS: passport, TAX and social-security numbers are stored
 * with a random IV, so ciphertext comparison is meaningless — candidates must be
 * decrypted before scoring. `loadCandidates` does that once for the whole import rather
 * than per row.
 */

/** Identifying fields, strongest first. Order affects only the explanation text. */
const IDENT_FIELDS = [
  'passport_number',
  'social_security_number',
  'tax_id',
  'birth_date',
  'mothers_name',
  'last_name',
  'first_name',
  'employee_number',
];

/** Fields held encrypted at rest — decrypt before comparing. */
const ENCRYPTED_IDENT = ['passport_number', 'social_security_number', 'tax_id'];

/** Matching at least this many identifying fields = probable duplicate. */
const MATCH_THRESHOLD = 3;

const normText = (v) =>
  (v === null || v === undefined) ? null
    : String(v).trim().toLowerCase().replace(/\s+/g, ' ') || null;

/** Document numbers differ cosmetically far more often than they differ really. */
const normDoc = (v) =>
  (v === null || v === undefined) ? null
    : String(v).toUpperCase().replace(/[^A-Z0-9]/g, '') || null;

/**
 * A DATE column comes back from pg as a JS Date at LOCAL midnight. toISOString() then
 * converts to UTC and, in Europe/Budapest, hands back the previous day — so a birth date
 * of 1990-03-14 compares as 1990-03-13 and never matches the string in the spreadsheet.
 * Read the local parts instead. (The billing engine learned this same lesson; REP-15
 * exists because of it.)
 */
const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                      + `-${String(d.getDate()).padStart(2, '0')}`;

const normDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : ymdLocal(v);
  const s = String(v).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : ymdLocal(d);
};

function normField(field, value) {
  if (field === 'birth_date') return normDate(value);
  if (ENCRYPTED_IDENT.includes(field) || field === 'employee_number') return normDoc(value);
  return normText(value);
}

/** The identifying fields this record actually carries. */
function presentFields(rec) {
  return IDENT_FIELDS.filter((f) => normField(f, rec[f]) !== null);
}

/**
 * Score one candidate against one incoming row.
 * @returns {{score:number, fields:string[]}} which identifying fields agree
 */
function scoreAgainst(row, candidate) {
  const fields = [];
  for (const f of IDENT_FIELDS) {
    const a = normField(f, row[f]);
    const b = normField(f, candidate[f]);
    if (a !== null && b !== null && a === b) fields.push(f);
  }
  return { score: fields.length, fields };
}

/**
 * Best match for a row among the candidates.
 *
 * @returns {{
 *   status: 'match' | 'ambiguous' | 'none' | 'insufficient_fields',
 *   candidate?: object, score?: number, fields?: string[], rivals?: number,
 *   available?: number
 * }}
 */
function findDuplicate(row, candidates, { threshold = MATCH_THRESHOLD } = {}) {
  const available = presentFields(row).length;

  // Report this rather than silently importing: the row may well be a duplicate, we
  // simply cannot tell, and that is a different answer from "not a duplicate".
  if (available < threshold) return { status: 'insufficient_fields', available };

  let best = null;
  let runnerUp = 0;
  for (const c of candidates) {
    const s = scoreAgainst(row, c);
    if (!best || s.score > best.score) { runnerUp = best ? best.score : 0; best = { ...s, candidate: c }; }
    else if (s.score > runnerUp) runnerUp = s.score;
  }

  if (!best || best.score < threshold) return { status: 'none', available };

  // Two different people agreeing on the same three fields is not something to resolve
  // by picking the first row.
  const tied = candidates.filter((c) => scoreAgainst(row, c).score === best.score);
  if (tied.length > 1) {
    return { status: 'ambiguous', score: best.score, fields: best.fields, rivals: tied.length, available };
  }

  return { status: 'match', candidate: best.candidate, score: best.score, fields: best.fields, available };
}

/** Hungarian labels for the import report. */
const FIELD_LABEL = {
  passport_number: 'útlevélszám',
  social_security_number: 'TAJ',
  tax_id: 'adóazonosító',
  birth_date: 'születési dátum',
  mothers_name: 'anyja neve',
  last_name: 'vezetéknév',
  first_name: 'keresztnév',
  employee_number: 'törzsszám',
};

module.exports = {
  IDENT_FIELDS, ENCRYPTED_IDENT, MATCH_THRESHOLD, FIELD_LABEL,
  normField, presentFields, scoreAgainst, findDuplicate,
};
