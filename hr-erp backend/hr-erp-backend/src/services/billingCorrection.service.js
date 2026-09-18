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
 * KÉT IRÁNYBA MŰKÖDIK
 * -------------------
 * Ha valaki a számlázás UTÁN költözik be, a tényleges TÖBB, mint az előre számlázott —
 * akkor pótszámlázás jár, nem levonás. Az `amount` ezért előjeles: pozitív = túlszámlázás
 * (visszajár), negatív = alulszámlázás (pótlandó). Csak a pontosan nulla különbözet
 * értelmetlen, azt utasítjuk el.
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
    SELECT ab.accommodation_id, ab.workplace_id,
           a.name AS accommodation, coalesce(w.name, '(nincs munkahely)') AS workplace,
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
 * Az előre számlázott tételsorok beolvasása.
 *
 * MA KÉZI BEVITEL. A Számlázz.hu-integráció nincs megépítve, tehát a kimenő számla
 * adatait ember viszi be — havonta egyszer. A mezők (ágy / nap / díj) ezért KÜLÖN
 * állnak, nem egyetlen végösszegként: amikor az integráció elkészül, ugyanezek a mezők
 * tölthetők gépből, a tábla és a számítás változatlanul marad.
 *
 * A ház és a munkahely EGYÜTT kulcs. A díj munkahelyenként eltér (Autoliv 3 476 /
 * IKEA 3 950), a foglaltság viszont házanként keletkezik — bármelyiket elhagyva a
 * különbözetet becsülni kellene.
 */
async function normalizeLines(lines, month, contractorId) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'Legalább egy előre számlázott tételsor kell (ház + munkahely + ágy × nap × díj)' };
  }

  const accNames = new Map();
  const wpNames = new Map();
  const out = [];
  const latott = new Set();

  for (const [i, l] of lines.entries()) {
    const sorszam = i + 1;
    const beds = Number(l.beds);
    const days = Number(l.days);
    const rate = Number(l.rate);
    if (!Number.isFinite(beds) || beds < 0) return { error: `${sorszam}. sor: az ágyszám nem értelmezhető` };
    if (!Number.isFinite(days) || days <= 0) return { error: `${sorszam}. sor: a napok száma nem értelmezhető` };
    if (!Number.isFinite(rate) || rate < 0) return { error: `${sorszam}. sor: a díj nem értelmezhető` };

    const a = await query('SELECT id, name FROM accommodations WHERE id = $1', [l.accommodation_id]);
    if (a.rows.length === 0) return { error: `${sorszam}. sor: ismeretlen szálláshely` };
    accNames.set(a.rows[0].id, a.rows[0].name);

    let wpId = l.workplace_id || null;
    if (wpId) {
      const w = await query('SELECT id, name FROM workplaces WHERE id = $1', [wpId]);
      if (w.rows.length === 0) return { error: `${sorszam}. sor: ismeretlen munkahely` };
      wpNames.set(w.rows[0].id, w.rows[0].name);
    }

    // Ugyanaz a ház+munkahely kétszer: a végösszeg attól függne, hányszor vitték be.
    const kulcs = `${a.rows[0].id}|${wpId || '-'}`;
    if (latott.has(kulcs)) {
      return { error: `${sorszam}. sor: ${a.rows[0].name} / ${wpNames.get(wpId) || 'munkahely nélkül'} kétszer szerepel` };
    }
    latott.add(kulcs);

    out.push({
      accommodation_id: a.rows[0].id, accommodation: a.rows[0].name,
      workplace_id: wpId, workplace: wpId ? wpNames.get(wpId) : '(nincs munkahely)',
      invoiced_beds: beds, invoiced_days: days, rate,
      invoiced_amount: r2(beds * days * rate),
    });
  }
  return { lines: out };
}

/**
 * Javaslat készítése az előre számlázott tételsorokból.
 *
 * A tényleges oldalt a rendszer számolja, az előre számlázottat ember viszi be — a kettő
 * különbsége soronként áll elő, ugyanazon a (ház × munkahely) kulcson. Ami csak az egyik
 * oldalon van, az is sor lesz: egy ház, amit kiszámláztunk, de üresen állt, ugyanúgy
 * különbözet, mint egy ház, ahol laktak, de nem számláztuk.
 */
async function propose({ contractorId, month, lines = [], note = null, userId = null }) {
  if (!MONTH_RE.test(String(month || ''))) return { error: 'Hónap formátum: YYYY-MM', status: 400 };

  const c = await query('SELECT id, name FROM contractors WHERE id = $1', [contractorId]);
  if (c.rows.length === 0) return { error: 'Megbízó nem található', status: 404 };

  const letezo = await query(
    `SELECT id, status FROM billing_corrections
      WHERE contractor_id = $1 AND affected_month = $2 AND status <> 'elvetve'`, [contractorId, month]);
  if (letezo.rows.length > 0) {
    return { error: `Erre a hónapra már van korrekció (${letezo.rows[0].status}). Előbb vesd el, ha újraszámolnád.`, status: 409 };
  }

  const norm = await normalizeLines(lines, month, contractorId);
  if (norm.error) return { error: norm.error, status: 400 };

  // A tényleges oldal ugyanazon a kulcson, hogy a kivonás soronként elvégezhető legyen.
  const tenyRows = await actualForMonth(month, contractorId);
  const tenyMap = new Map();
  for (const t of tenyRows) {
    const kulcs = `${t.accommodation_id}|${t.workplace_id || '-'}`;
    const elozo = tenyMap.get(kulcs) || { bed_nights: 0, net_amount: 0, rate_used: null };
    tenyMap.set(kulcs, {
      bed_nights: elozo.bed_nights + Number(t.bed_nights || 0),
      net_amount: r2(elozo.net_amount + Number(t.net_amount || 0)),
      rate_used: t.rate_used !== null && t.rate_used !== undefined ? Number(t.rate_used) : elozo.rate_used,
      accommodation: t.accommodation, workplace: t.workplace,
      accommodation_id: t.accommodation_id, workplace_id: t.workplace_id,
    });
  }

  const sorok = [];
  const hasznalt = new Set();
  for (const l of norm.lines) {
    const kulcs = `${l.accommodation_id}|${l.workplace_id || '-'}`;
    hasznalt.add(kulcs);
    const t = tenyMap.get(kulcs) || { bed_nights: 0, net_amount: 0 };
    sorok.push({
      ...l,
      actual_bed_nights: Number(t.bed_nights || 0),
      actual_amount: r2(t.net_amount || 0),
      diff_bed_nights: r2(l.invoiced_beds * l.invoiced_days - Number(t.bed_nights || 0)),
      diff_amount: r2(l.invoiced_amount - Number(t.net_amount || 0)),
    });
  }
  // Ami csak a TÉNYLEGES oldalon van: ott laktak, de nem szerepel az előre számlázottban.
  // Ez alulszámlázás — negatív különbözet, tehát pótszámlázás.
  for (const [kulcs, t] of tenyMap.entries()) {
    if (hasznalt.has(kulcs) || !(Number(t.net_amount) > 0)) continue;
    sorok.push({
      accommodation_id: t.accommodation_id, accommodation: t.accommodation,
      workplace_id: t.workplace_id, workplace: t.workplace,
      invoiced_beds: 0, invoiced_days: 1, rate: t.rate_used || 0, invoiced_amount: 0,
      actual_bed_nights: Number(t.bed_nights || 0), actual_amount: r2(t.net_amount),
      diff_bed_nights: r2(-Number(t.bed_nights || 0)), diff_amount: r2(-Number(t.net_amount)),
      note: 'Nem szerepelt az előre számlázott tételek között — pótszámlázandó.',
    });
  }

  const invoicedTotal = r2(sorok.reduce((s2, x) => s2 + x.invoiced_amount, 0));
  const actualTotal = r2(sorok.reduce((s2, x) => s2 + x.actual_amount, 0));
  const diff = r2(sorok.reduce((s2, x) => s2 + x.diff_amount, 0));
  const cov = await coverage(month);

  if (diff === 0) {
    return {
      error: 'Az előre számlázott és a tényleges összeg megegyezik — nincs korrekció.',
      status: 400,
      data: { invoiced: invoicedTotal, actual: actualTotal, lines: sorok, coverage: cov },
    };
  }

  const breakdown = { lines: sorok, coverage: cov };
  const ins = await query(
    `INSERT INTO billing_corrections
       (contractor_id, affected_month, invoiced_amount, actual_amount, amount,
        breakdown, status, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'javaslat',$7,$8) RETURNING *`,
    [contractorId, month, invoicedTotal, actualTotal, diff, JSON.stringify(breakdown), note, userId]);

  for (const l of sorok) {
    await query(
      `INSERT INTO billing_correction_lines
         (correction_id, accommodation_id, workplace_id, invoiced_beds, invoiced_days, rate,
          invoiced_amount, actual_bed_nights, actual_amount, diff_bed_nights, diff_amount, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [ins.rows[0].id, l.accommodation_id, l.workplace_id, l.invoiced_beds, l.invoiced_days,
       l.rate, l.invoiced_amount, l.actual_bed_nights, l.actual_amount,
       l.diff_bed_nights, l.diff_amount, l.note || null]);
  }

  return {
    data: {
      correction: ins.rows[0], lines: sorok, coverage: cov,
      direction: diff > 0 ? 'tulszamlazas' : 'potszamlazas',
    },
  };
}

/**
 * Egy tételsor ki-/bekapcsolása a jóváhagyás előtt.
 *
 * Nem törlés: a kivett sor LÁTHATÓ marad a levezetésben, csak nem számít a végösszegbe.
 * Aki később ránéz, lássa, hogy egy házat megnéztünk és kihagytunk — az más, mint ha
 * eleve nem szerepelt volna.
 */
async function setLineIncluded({ correctionId, lineId, included }) {
  const c = (await query('SELECT status FROM billing_corrections WHERE id=$1', [correctionId])).rows[0];
  if (!c) return { error: 'Korrekció nem található', status: 404 };
  if (c.status !== 'javaslat') {
    return { error: `Csak javaslat állapotban módosítható a tételsor (most: ${c.status})`, status: 409 };
  }
  const u = await query(
    `UPDATE billing_correction_lines SET included=$1, updated_at=NOW()
      WHERE id=$2 AND correction_id=$3 RETURNING *`, [!!included, lineId, correctionId]);
  if (u.rows.length === 0) return { error: 'Tételsor nem található', status: 404 };

  // A végösszeg MINDIG a benne hagyott sorokból áll össze, nem kézzel karbantartott szám.
  const agg = (await query(
    `SELECT COALESCE(sum(invoiced_amount),0) AS inv, COALESCE(sum(actual_amount),0) AS act,
            COALESCE(sum(diff_amount),0) AS diff
       FROM billing_correction_lines WHERE correction_id=$1 AND included`, [correctionId])).rows[0];
  const r = await query(
    `UPDATE billing_corrections
        SET invoiced_amount=$2, actual_amount=$3, amount=$4, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [correctionId, r2(agg.inv), r2(agg.act), r2(agg.diff)]);
  return { data: { correction: r.rows[0], line: u.rows[0] } };
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

  // ELŐJELES. Túlszámlázásnál a nyitott rész pozitív (visszajár), alulszámlázásnál
  // negatív (pótszámlázandó). A beszámításnak mindig a különbözettel AZONOS előjelűnek
  // kell lennie — különben a levonásból pótlás lenne, vagy fordítva.
  const nyitott = r2(Number(c.amount) - Number(c.settled_amount));
  const irany = Number(c.amount) > 0 ? 1 : -1;
  const be = amount === null || amount === undefined ? nyitott : r2(amount);
  if (be === 0) return { error: 'A beszámított összeg nem lehet nulla', status: 400 };
  if (Math.sign(be) !== irany) {
    return {
      error: irany > 0
        ? 'Túlszámlázás visszavezetésénél a beszámítás pozitív összeg'
        : 'Alulszámlázás pótlásánál a beszámítás negatív összeg',
      status: 400,
    };
  }
  if (Math.abs(be) > Math.abs(nyitott) + 0.001) {
    return { error: `A beszámítás (${be}) több a nyitott korrekciónál (${nyitott})`, status: 400 };
  }

  const ujTotal = r2(Number(c.settled_amount) + be);
  const kesz = Math.abs(ujTotal) >= Math.abs(Number(c.amount)) - 0.001;
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

  // KOROSÍTÁS — ugyanaz a négy vödör, mint a megelőlegezett követeléseknél
  // (prepaidRecovery.service.js). Szándékosan azonos: a két nézetet ugyanaz az ember
  // olvassa, és egy háromhónapos korrekció ugyanúgy régi tartozás, mint egy háromhónapos
  // követelés. Az életkor az ÉRINTETT hónap végétől számol, nem a rögzítéstől — a
  // késlekedés attól a hónaptól kezdődik, amelyikre a különbözet vonatkozik.
  const ma = new Date();
  const korosit = (affectedMonth) => {
    const [y, m] = String(affectedMonth).split('-').map(Number);
    const honapVege = new Date(y, m, 0);                       // az érintett hónap utolsó napja
    const napok = Math.floor((ma - honapVege) / 86400000);
    if (napok <= 30) return '0-30';
    if (napok <= 60) return '31-60';
    if (napok <= 90) return '61-90';
    return '90+';
  };

  // Az ÉLŐ tételsorok, nem a breakdown pillanatképe: a soronkénti ki-/bekapcsoláshoz
  // azonosító kell, és az `included` a pillanatkép rögzítése után is változhat.
  const lineRows = r.rows.length === 0 ? { rows: [] } : await query(`
    SELECT l.id AS line_id, l.correction_id, l.included,
           l.invoiced_beds, l.invoiced_days, l.rate, l.invoiced_amount,
           l.actual_bed_nights, l.actual_amount, l.diff_bed_nights, l.diff_amount, l.note,
           a.name AS accommodation, coalesce(w.name, '(nincs munkahely)') AS workplace
      FROM billing_correction_lines l
      JOIN accommodations a ON a.id = l.accommodation_id
      LEFT JOIN workplaces w ON w.id = l.workplace_id
     WHERE l.correction_id = ANY($1::uuid[])
     ORDER BY a.name, w.name`, [r.rows.map((x) => x.id)]);
  const linesByCorr = new Map();
  for (const l of lineRows.rows) {
    if (!linesByCorr.has(l.correction_id)) linesByCorr.set(l.correction_id, []);
    linesByCorr.get(l.correction_id).push(l);
  }

  const rows = r.rows.map((x) => ({
    ...x,
    breakdown: { ...(x.breakdown || {}), lines: linesByCorr.get(x.id) || (x.breakdown || {}).lines || [] },
    open_amount: r2(Number(x.open_amount)),
    // Az irány magyarázza az előjelet annak, aki a számot látja, nem a kódot.
    direction: Number(x.amount) > 0 ? 'tulszamlazas' : 'potszamlazas',
    aging_bucket: korosit(x.affected_month),
  }));

  // A javaslat MÉG NEM PÉNZ. Egy közös számban összeadva úgy nézne ki, mintha a teljes
  // összeg levonásra várna, holott a fele még jóvá sincs hagyva — ezért külön is megy ki.
  const sum = (f) => r2(rows.filter(f).reduce((s, x) => s + Number(x.open_amount), 0));
  const korosites = {};
  for (const v of ['0-30', '31-60', '61-90', '90+']) {
    korosites[v] = { db: rows.filter((x) => x.aging_bucket === v).length,
                     osszeg: sum((x) => x.aging_bucket === v) };
  }

  return {
    rows,
    osszesen: sum(() => true),
    javaslat: rows.filter((x) => x.status === 'javaslat').length,
    jovahagyva: rows.filter((x) => x.status === 'jovahagyva').length,
    javaslat_osszeg: sum((x) => x.status === 'javaslat'),
    jovahagyva_osszeg: sum((x) => x.status === 'jovahagyva'),
    // Külön a két irány: egy 5 milliós visszajáró és egy 5 milliós pótszámlázandó
    // összege nulla lenne, ami a legrosszabb fajta "rendben van" üzenet.
    visszajar: sum((x) => Number(x.amount) > 0),
    potszamlazando: sum((x) => Number(x.amount) < 0),
    korosites,
  };
}

/**
 * Mi akadályozza egy hónap lezárását, és mi csak figyelmeztet.
 *
 * A KETTŐ KÜLÖNBSÉGE TULAJDONOSI DÖNTÉS (2026-09-18):
 *   • JÓVÁHAGYOTT, de vissza nem vezetett korrekció → BLOKKOL. Ez elismert tartozás
 *     vagy követelés: a hónapot lezárni úgy, hogy a levonás sosem ment ki, annyit
 *     jelentene, hogy elfelejtjük.
 *   • JAVASLAT (még nem nézte meg senki) → CSAK FIGYELMEZTET. Egy ki nem vizsgált
 *     különbözet nem elismert tartozás, és nem tarthatja fogva a zárást — de a záró
 *     képernyőn látszódnia kell, különben a döntés "nem tudtam róla" alapon születik.
 *
 * Ugyanaz a forma, mint az árfolyam nélküli tételeknél a `finalizeRun`-ban: felsorolás,
 * hogy a képernyőn ne csak egy szám álljon, hanem a tételek, amikhez oda lehet lépni.
 */
async function blockingForMonth(month) {
  const r = await query(`
    SELECT bc.id, bc.affected_month, bc.status, bc.amount, bc.settled_amount,
           (bc.amount - bc.settled_amount) AS open_amount, c.name AS contractor_name
      FROM billing_corrections bc
      JOIN contractors c ON c.id = bc.contractor_id
     WHERE bc.affected_month = $1
       AND bc.status IN ('javaslat','jovahagyva')
       AND bc.amount <> bc.settled_amount
     ORDER BY c.name`, [month]);

  const cimke = (x) => `${x.contractor_name} — ${x.affected_month}: `
    + `${Math.abs(Number(x.open_amount)).toLocaleString('hu-HU')} Ft `
    + `${Number(x.open_amount) > 0 ? 'visszajár' : 'pótszámlázandó'}`;

  const blokkolo = r.rows.filter((x) => x.status === 'jovahagyva');
  const figyelmeztet = r.rows.filter((x) => x.status === 'javaslat');

  return {
    blocking: blokkolo.map((x) => ({
      correction_id: x.id, contractor_name: x.contractor_name,
      open_amount: r2(Number(x.open_amount)), label: cimke(x),
    })),
    warnings: figyelmeztet.map((x) => ({
      correction_id: x.id, contractor_name: x.contractor_name,
      open_amount: r2(Number(x.open_amount)), label: cimke(x),
    })),
  };
}

/** Egy megbízó adott havi számlájára kerülő korrekciós tételsorok (jóváhagyottak). */
async function linesFor(contractorId, month) {
  const r = await query(`
    SELECT id, affected_month, amount, settled_amount, note,
           (amount - settled_amount) AS open_amount
      FROM billing_corrections
     WHERE contractor_id = $1 AND status = 'jovahagyva' AND amount <> settled_amount
       AND affected_month < $2
     ORDER BY affected_month`, [contractorId, month]);
  return r.rows.map((x) => {
    const nyitott = Number(x.open_amount);
    // A korrekció ELŐJELE és a SZÁMLASOR előjele ellentétes: egy pozitív (visszajáró)
    // korrekcióból levonás lesz, egy negatívból (alulszámlázás) pótsor.
    const tul = nyitott > 0;
    return {
      correction_id: x.id,
      affected_month: x.affected_month,
      amount: r2(-nyitott),
      label: tul
        ? `Korrekció — ${x.affected_month} túlszámlázás visszavezetése`
        : `Pótszámlázás — ${x.affected_month} alulszámlázás rendezése`,
      direction: tul ? 'tulszamlazas' : 'potszamlazas',
      note: x.note || null,
    };
  });
}

module.exports = {
  propose, approve, reject, settle, open, linesFor, setLineIncluded,
  actualForMonth, coverage, blockingForMonth,
};
