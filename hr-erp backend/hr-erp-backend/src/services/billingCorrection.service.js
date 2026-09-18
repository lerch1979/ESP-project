/**
 * Számlakorrekció: az előre kiszámlázott ágyszám visszavezetése a tényleges foglaltságra.
 *
 * A HAVI SZÁMLA ELŐRE MEGY KI, a lekötött ágyszámra — a hónap elején még nem tudni, ki
 * mikor költözik ki. Amikor a megbízó elviszi az embereket, a különbözet a KÖVETKEZŐ
 * számlából kerül levonásra.
 *
 * A RENDSZER JAVASOL, AZ EMBER DÖNT
 * ---------------------------------
 * A javaslat a tényleges foglaltságból számol, az pedig a kiléptetések átvezetésén múlik —
 * emberi munkán. Egy automatikusan számlára kerülő levonás akkor is elmenne, ha a
 * foglaltsági adat épp hiányos, és egy hibás korrekció valódi pénz. Ezért a szolgáltatás
 * SOHA nem számít be magától: javaslatot ír, amit jóvá kell hagyni.
 *
 * ⚠️ A PROFITOT NEM ÉRINTI
 * A profit-kimutatás a tényleges foglaltságból dolgozik, tehát az érintett hónap eredménye
 * MÁR a valós bevételt mutatja. Ha a korrekció is csökkentené, ugyanaz a különbözet
 * kétszer jelenne meg. A korrekció pénzügyi tétel (mit számlázunk), nem eredmény-tétel.
 */
const { query } = require('../database/connection');

const MONTH_RE = /^\d{4}-\d{2}$/;
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * A hónap TÉNYLEGES foglaltsága házanként és munkahelyenként, a hatályos díjakkal.
 *
 * A számlázási sorokból dolgozik, nem a nyers pillanatképekből: az tartalmazza a
 * ténylegesen alkalmazott díjat (beleértve a hónap közbeni díjváltást is), és ugyanaz az
 * adat, amiből a profit is számol — így a két szám nem tud elcsúszni egymástól.
 */
async function actualForMonth(month, contractorId) {
  const r = await query(`
    SELECT a.name AS accommodation, coalesce(w.name, '(nincs munkahely)') AS workplace,
           ab.total_employee_days::int AS bed_nights,
           ab.total_amount::numeric AS net_amount,
           (ab.calculation_details->'per_bed'->>'rate_used')::numeric AS rate_used
      FROM accommodation_billings ab
      JOIN accommodations a ON a.id = ab.accommodation_id
      JOIN billing_runs br ON br.id = ab.billing_run_id
      LEFT JOIN workplaces w ON w.id = ab.workplace_id
     WHERE ab.billing_month = $1
       AND ab.partner_contractor_id = $2
       AND br.status <> 'cancelled' AND ab.status <> 'cancelled'
     ORDER BY a.name, w.name`, [month, contractorId]);
  return r.rows;
}

/**
 * Hány napra van egyáltalán foglaltsági adat — enélkül a javaslat félrevezet.
 *
 * Hónap közben a tényleges összeg természetesen kisebb, mert a hónap fele még nincs meg.
 * A különbözet ilyenkor NEM túlszámlázás, csak hiányzó adat, és a javaslat ezt kimondja
 * ahelyett, hogy egy hétmilliós levonást tenne elé.
 */
async function coverage(month) {
  const r = await query(`
    SELECT count(DISTINCT snapshot_date)::int AS days_with_data,
           max(snapshot_date) AS last_day
      FROM occupancy_snapshots
     WHERE to_char(snapshot_date, 'YYYY-MM') = $1`, [month]);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return {
    days_with_data: r.rows[0].days_with_data || 0,
    days_in_month: daysInMonth,
    last_day: r.rows[0].last_day || null,
    complete: (r.rows[0].days_with_data || 0) >= daysInMonth,
  };
}

/**
 * Javaslat készítése. `invoiced_amount` kötelező: azt a SZÁMLÁRÓL olvassuk le, a rendszer
 * nem tudja — ami kiment, az nem feltétlenül az, amit a rendszer ma számolna.
 */
async function propose({ contractorId, month, invoicedAmount, invoicedBreakdown = [], note = null, userId = null }) {
  if (!MONTH_RE.test(String(month || ''))) return { error: 'Hónap formátum: YYYY-MM', status: 400 };
  if (!(Number(invoicedAmount) > 0)) {
    return { error: 'A kiszámlázott összeg megadása kötelező (a számláról)', status: 400 };
  }

  const c = await query('SELECT id, name FROM contractors WHERE id = $1', [contractorId]);
  if (c.rows.length === 0) return { error: 'Megbízó nem található', status: 404 };

  const letezo = await query(
    `SELECT id, status FROM billing_corrections
      WHERE contractor_id = $1 AND affected_month = $2 AND status <> 'elvetve'`, [contractorId, month]);
  if (letezo.rows.length > 0) {
    return { error: `Erre a hónapra már van korrekció (${letezo.rows[0].status}). Előbb vesd el, ha újraszámolnád.`, status: 409 };
  }

  const rows = await actualForMonth(month, contractorId);
  const actual = r2(rows.reduce((s, x) => s + Number(x.net_amount || 0), 0));
  const diff = r2(Number(invoicedAmount) - actual);
  const cov = await coverage(month);

  const breakdown = {
    invoiced: invoicedBreakdown,
    actual: rows.map((x) => ({
      accommodation: x.accommodation, workplace: x.workplace,
      bed_nights: x.bed_nights, rate_used: x.rate_used ? Number(x.rate_used) : null,
      net_amount: Number(x.net_amount),
    })),
    coverage: cov,
  };

  if (diff <= 0) {
    return {
      error: `A tényleges (${actual.toLocaleString('hu-HU')} Ft) nem kisebb a kiszámlázottnál `
           + `(${Number(invoicedAmount).toLocaleString('hu-HU')} Ft) — nincs mit visszavezetni.`
           + (cov.complete ? '' : ` FIGYELEM: a hónapból csak ${cov.days_with_data}/${cov.days_in_month} napra van adat.`),
      status: 400,
      data: { actual, invoiced: Number(invoicedAmount), breakdown },
    };
  }

  const ins = await query(
    `INSERT INTO billing_corrections
       (contractor_id, affected_month, invoiced_amount, actual_amount, amount,
        breakdown, status, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'javaslat',$7,$8) RETURNING *`,
    [contractorId, month, invoicedAmount, actual, diff, JSON.stringify(breakdown), note, userId]);

  return { data: { correction: ins.rows[0], coverage: cov } };
}

/** Jóváhagyás — csak ezután kerülhet számlára. */
async function approve({ id, userId }) {
  const r = await query(
    `UPDATE billing_corrections
        SET status = 'jovahagyva', approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'javaslat' RETURNING *`, [id, userId]);
  if (r.rows.length === 0) {
    return { error: 'Csak javaslat állapotú korrekció hagyható jóvá', status: 409 };
  }
  return { data: { correction: r.rows[0] } };
}

/** Elvetés — újraszámoláshoz, vagy ha mégsem jár vissza. */
async function reject({ id, note = null }) {
  const r = await query(
    `UPDATE billing_corrections
        SET status = 'elvetve', note = COALESCE($2, note), updated_at = NOW()
      WHERE id = $1 AND status IN ('javaslat','jovahagyva') RETURNING *`, [id, note]);
  if (r.rows.length === 0) return { error: 'Beszámított korrekció már nem vethető el', status: 409 };
  return { data: { correction: r.rows[0] } };
}

/**
 * Beszámítás egy havi számlába. Részleges is lehet: ha a havi díj kisebb a korrekciónál,
 * a maradék nyitva marad és a következő számlára fordul át.
 */
async function settle({ id, month, amount = null, userId = null }) {
  if (!MONTH_RE.test(String(month || ''))) return { error: 'Hónap formátum: YYYY-MM', status: 400 };

  const c = (await query('SELECT * FROM billing_corrections WHERE id = $1', [id])).rows[0];
  if (!c) return { error: 'Korrekció nem található', status: 404 };
  if (c.status !== 'jovahagyva') {
    return { error: `Csak JÓVÁHAGYOTT korrekció számítható be (most: ${c.status})`, status: 409 };
  }

  const nyitott = r2(Number(c.amount) - Number(c.settled_amount));
  const be = amount === null || amount === undefined ? nyitott : r2(amount);
  if (!(be > 0)) return { error: 'A beszámított összeg pozitív kell legyen', status: 400 };
  if (be > nyitott + 0.001) {
    return { error: `A beszámítás (${be}) több a nyitott korrekciónál (${nyitott})`, status: 400 };
  }

  const ujTotal = r2(Number(c.settled_amount) + be);
  const kesz = ujTotal >= Number(c.amount) - 0.001;
  const r = await query(
    `UPDATE billing_corrections
        SET settled_amount = $1, settled_in_month = $2,
            status = CASE WHEN $3::boolean THEN 'beszamitva' ELSE status END,
            updated_at = NOW()
      WHERE id = $4 RETURNING *`, [ujTotal, month, kesz, id]);
  return { data: { correction: r.rows[0], settled: be, remaining: r2(Number(c.amount) - ujTotal) } };
}

/** Nyitott korrekciók — javaslat és jóváhagyott, ami még nincs beszámítva. */
async function open({ contractorId = null } = {}) {
  const params = [];
  let where = `bc.status IN ('javaslat','jovahagyva')`;
  if (contractorId) { params.push(contractorId); where += ` AND bc.contractor_id = $${params.length}`; }

  const r = await query(`
    SELECT bc.*, c.name AS contractor_name,
           (bc.amount - bc.settled_amount) AS open_amount,
           u.last_name AS approved_by_last, u.first_name AS approved_by_first
      FROM billing_corrections bc
      JOIN contractors c ON c.id = bc.contractor_id
      LEFT JOIN users u ON u.id = bc.approved_by
     WHERE ${where}
     ORDER BY bc.affected_month, c.name`, params);

  // A javaslat MÉG NEM PÉNZ. Egy közös számban összeadva úgy nézne ki, mintha a teljes
  // összeg levonásra várna, holott a fele még jóvá sincs hagyva — ezért külön is megy ki.
  const sum = (f) => r2(r.rows.filter(f).reduce((s, x) => s + Number(x.open_amount), 0));
  return {
    rows: r.rows,
    osszesen: sum(() => true),
    javaslat: r.rows.filter((x) => x.status === 'javaslat').length,
    jovahagyva: r.rows.filter((x) => x.status === 'jovahagyva').length,
    javaslat_osszeg: sum((x) => x.status === 'javaslat'),
    jovahagyva_osszeg: sum((x) => x.status === 'jovahagyva'),
  };
}

/** Egy megbízó adott havi számlájára kerülő korrekciós tételsorok (jóváhagyottak). */
async function linesFor(contractorId, month) {
  const r = await query(`
    SELECT id, affected_month, amount, settled_amount, note,
           (amount - settled_amount) AS open_amount
      FROM billing_corrections
     WHERE contractor_id = $1 AND status = 'jovahagyva' AND amount > settled_amount
       AND affected_month < $2
     ORDER BY affected_month`, [contractorId, month]);
  return r.rows.map((x) => ({
    correction_id: x.id,
    affected_month: x.affected_month,
    // NEGATÍV előjel: a számlán levonásként jelenik meg, külön tételsorként.
    amount: -Number(x.open_amount),
    label: `Korrekció — ${x.affected_month} túlszámlázás visszavezetése`,
    note: x.note || null,
  }));
}

module.exports = { propose, approve, reject, settle, open, linesFor, actualForMonth, coverage };
