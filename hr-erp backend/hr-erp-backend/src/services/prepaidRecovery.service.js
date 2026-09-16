/**
 * Megelőlegezett tételek: amit a szállásadó helyett fizettünk ki, és visszajár tőle.
 *
 * A tétel KÖVETELÉS, nem ráfordítás — a kimutatások kihagyják (mig 163). Itt él minden,
 * ami a követelés életútját kezeli: a nyitott állomány korosítva, a szállásadói
 * elszámoláshoz tartozó levonás-sorok, és maga a levonás rögzítése.
 *
 * MIÉRT KOROSÍTVA
 * ---------------
 * A tulajdonos kérése szó szerint: "Ha valaki hónapokig görget maga előtt egy követelést,
 * azt látni akarom." Egy sima nyitott-lista ezt elrejtené — a 23 000 Ft ugyanúgy nézne ki
 * az első és a hatodik hónapban. Ezért minden soron ott a kora napokban és az, hogy hány
 * havi elszámoláson ment már át.
 */
const { query } = require('../database/connection');

/** Egy hónap első napja — a korosítás és az "áthozott" jelölés viszonyítási pontja. */
const monthStart = (m) => `${m}-01`;

/**
 * Nyitott megelőlegezett tételek, korosítva.
 *
 * @param {{contractorId?: string, asOfMonth?: string}} opts
 */
async function openClaims({ contractorId = null, asOfMonth = null } = {}) {
  const params = [];
  const where = [`e.cost_bearer = 'megelolegezett'`, `e.deleted_at IS NULL`,
                 `e.recovery_status = 'nyitott'`];
  if (contractorId) { params.push(contractorId); where.push(`e.recoverable_from_contractor_id = $${params.length}`); }
  if (asOfMonth)    { params.push(monthStart(asOfMonth)); where.push(`COALESCE(e.performance_date, e.invoice_date, (e.billing_month || '-01')::date) <= ($${params.length}::date + INTERVAL '1 month' - INTERVAL '1 day')`); }

  const r = await query(`
    SELECT e.id, e.accommodation_id, a.name AS accommodation_name,
           e.billing_month, e.category, e.amount, e.recovered_amount,
           (e.amount - e.recovered_amount) AS open_amount,
           e.vendor_name, e.invoice_number, e.recovery_note, e.notes,
           COALESCE(e.performance_date, e.invoice_date, (e.billing_month || '-01')::date) AS keletkezett,
           e.recoverable_from_contractor_id AS contractor_id, c.name AS contractor_name,
           (CURRENT_DATE - COALESCE(e.performance_date, e.invoice_date, (e.billing_month || '-01')::date)) AS kor_nap,
           (SELECT count(*)::int FROM expense_recoveries er WHERE er.expense_id = e.id) AS reszletek
      FROM accommodation_expenses e
      LEFT JOIN accommodations a ON a.id = e.accommodation_id
      LEFT JOIN contractors c ON c.id = e.recoverable_from_contractor_id
     WHERE ${where.join(' AND ')}
     ORDER BY keletkezett, e.amount DESC`, params);

  // Korosítási sávok — ugyanaz a bontás, amit a pénzügy máshol is használ.
  const sav = (nap) => (nap <= 30 ? '0-30 nap' : nap <= 60 ? '31-60 nap' : nap <= 90 ? '61-90 nap' : '90 napon túl');
  const rows = r.rows.map((x) => ({ ...x, korosztaly: sav(Number(x.kor_nap || 0)) }));

  const osszesen = rows.reduce((s, x) => s + Number(x.open_amount), 0);
  const savonkent = {};
  for (const x of rows) savonkent[x.korosztaly] = (savonkent[x.korosztaly] || 0) + Number(x.open_amount);

  return { rows, osszesen, savonkent, db: rows.length };
}

/**
 * Egy szállásadó adott havi elszámolásához tartozó levonás-sorok.
 *
 * Minden nyitott követelése szerepel, amely a hónap VÉGÉIG keletkezett — a korábbi
 * hónapokból származók "áthozott" jelöléssel. Ez a lista még nem von le semmit: a
 * dokumentum mutatja, a `recordRecovery` rögzíti.
 */
async function deductionsFor(contractorId, month) {
  const { rows } = await openClaims({ contractorId, asOfMonth: month });
  return rows.map((x) => ({
    expense_id: x.id,
    accommodation_name: x.accommodation_name,
    category: x.category,
    vendor_name: x.vendor_name,
    invoice_number: x.invoice_number,
    keletkezett: x.keletkezett,
    amount: Number(x.open_amount),
    // A korábbi hónapban keletkezett követelés láthatóan átfordult ide.
    athozott: String(x.billing_month || '') < month,
    honnan_hozott: String(x.billing_month || '') < month ? x.billing_month : null,
    kor_nap: Number(x.kor_nap || 0),
  }));
}

/**
 * Levonás rögzítése: a követelés (részben vagy egészben) beszámítva egy havi elszámolásba.
 *
 * Részleges levonás azért lehetséges, mert a havi fizetendő kevesebb is lehet a
 * követelésnél — ilyenkor a maradék nyitva marad, és a következő havi lapon "áthozott"
 * tételként jelenik meg. Ez a tulajdonos döntése volt: a követelést görgetjük, nem
 * kérjük vissza.
 */
async function recordRecovery({ expenseId, month, amount, note = null, userId = null }, client = null) {
  const q = (sql, p) => (client ? client.query(sql, p) : query(sql, p));

  const e = (await q(
    `SELECT id, amount, recovered_amount, recovery_status, cost_bearer,
            recoverable_from_contractor_id
       FROM accommodation_expenses WHERE id = $1 AND deleted_at IS NULL`, [expenseId])).rows[0];
  if (!e) return { error: 'A tétel nem található', status: 404 };
  if (e.cost_bearer !== 'megelolegezett') {
    return { error: 'Ez nem megelőlegezett tétel, nincs mit levonni', status: 400 };
  }
  if (e.recovery_status !== 'nyitott') {
    return { error: `A követelés már nem nyitott (${e.recovery_status})`, status: 409 };
  }

  const nyitott = Number(e.amount) - Number(e.recovered_amount);
  const levon = amount === undefined || amount === null ? nyitott : Number(amount);
  if (!(levon > 0)) return { error: 'A levonás összege pozitív kell legyen', status: 400 };
  if (levon > nyitott + 0.001) {
    return { error: `A levonás (${levon}) több a nyitott követelésnél (${nyitott})`, status: 400 };
  }

  await q(
    `INSERT INTO expense_recoveries (expense_id, contractor_id, billing_month, amount, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [expenseId, e.recoverable_from_contractor_id, month, levon, note, userId]);

  const ujTotal = Number(e.recovered_amount) + levon;
  const kesz = ujTotal >= Number(e.amount) - 0.001;
  await q(
    `UPDATE accommodation_expenses
        SET recovered_amount = $1, recovery_status = $2, updated_at = NOW()
      WHERE id = $3`, [ujTotal, kesz ? 'levonva' : 'nyitott', expenseId]);

  return { recovered: levon, remaining: Number(e.amount) - ujTotal, status_after: kesz ? 'levonva' : 'nyitott' };
}

module.exports = { openClaims, deductionsFor, recordRecovery };
