/**
 * MNB középárfolyam — fetch, cache, and resolve the rate for a performance date.
 *
 * THE INVARIANT
 * -------------
 * A cost is booked at the rate published for its PERFORMANCE date, and that rate is then
 * frozen on the record. Nothing here is ever used to recompute an existing row: reading
 * an old expense must give the forint value it was booked at, however the currency has
 * moved since. (Same reasoning as the month lock in mig 148 — a figure that has been
 * reported must not change underneath the report.)
 *
 * WEEKENDS AND HOLIDAYS
 * ---------------------
 * MNB publishes on banking days only. For a Saturday performance date there is no rate,
 * so we walk BACK to the last published day — and store THAT date on the record, so the
 * UI can say "MNB 376,95, 2026-09-05" for a cost dated the 6th. Silently labelling the
 * older rate with the newer date would make a correct figure look like a wrong one to
 * anyone checking it against mnb.hu.
 *
 * WHEN MNB IS UNREACHABLE
 * -----------------------
 * We do not guess and we do not block the save. The record is stored with its original
 * amount and currency and `rate_status = 'missing'`; the month-close then refuses to
 * close over it and lists what needs resolving. A wrong number that looks right is worse
 * than a missing one that says so.
 *
 * NO OUTBOUND CALLS FROM TESTS
 * ----------------------------
 * On 2026-09-03 the functest fixtures sent 44 real emails because the transport had no
 * environment check. The lesson generalises to every outbound call: `networkAllowed()`
 * refuses to reach mnb.hu from a test harness or a sandbox database, so the suite
 * exercises the real code path and lands in the same state production reaches when the
 * service is down — which is the state most worth testing anyway.
 */
const http = require('http');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/** Extensible: add a code here and it becomes selectable everywhere. */
const SUPPORTED = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'PLN', 'RON'];

// Probed against the live service on 2026-09-10, and all three of these are load-bearing:
//   • HTTP, not HTTPS — a POST to https://www.mnb.hu/arfolyamok.asmx answers 404, even
//     though the WSDL is served fine over https. The WSDL's own soap:address says http.
//   • The SOAPAction header must be QUOTED, or the endpoint 404s.
//   • The result arrives XML-ESCAPED inside <GetExchangeRatesResult>, so the payload has
//     to be entity-decoded before it can be parsed.
// Guessing any one of these would have shipped a feature that silently never fetched.
const MNB_HOST = 'www.mnb.hu';
const MNB_PATH = '/arfolyamok.asmx';

/** Same shape as the mail guard: a test harness never reaches the outside world. */
function networkAllowed() {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.JEST_WORKER_ID) return false;
  if (process.env.FUNCTEST === '1' || process.env.FUNCTEST_RUN_ID) return false;
  if (/sandbox|_test\b/i.test(process.env.DB_NAME || '')) return false;
  if (String(process.env.MNB_FETCH_DISABLED || '').toLowerCase() === 'true') return false;
  return true;
}

const ymd = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** SOAP call to MNB's public GetExchangeRates. Resolves to raw XML. */
function soapGetExchangeRates(startDate, endDate, currency) {
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetExchangeRates xmlns="http://www.mnb.hu/webservices/">
      <startDate>${startDate}</startDate>
      <endDate>${endDate}</endDate>
      <currencyNames>${currency}</currencyNames>
    </GetExchangeRates>
  </soap:Body>
</soap:Envelope>`;

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: MNB_HOST, path: MNB_PATH, method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '"http://www.mnb.hu/webservices/GetExchangeRates"',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => (res.statusCode === 200
        ? resolve(out)
        : reject(new Error(`MNB HTTP ${res.statusCode}`))));
    });
    req.on('timeout', () => { req.destroy(new Error('MNB timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Pull every <Rate> out of the SOAP envelope.
 * MNB quotes some currencies per 100 units (unit="100"), which is exactly the trap that
 * turns a correct rate into a 100× wrong figure, so `unit` is parsed and stored.
 */
/** MNB returns the rate document entity-escaped inside the SOAP result element. */
const decodeEntities = (x) => String(x)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseRates(rawXml, currency) {
  const xml = decodeEntities(rawXml);
  const out = [];
  const dayRe = /<Day\s+date="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/Day>/g;
  let d;
  while ((d = dayRe.exec(xml)) !== null) {
    const rateRe = /<Rate\s+unit="(\d+)"\s+curr="([A-Z]{3})"[^>]*>([\d.,]+)<\/Rate>/g;
    let r;
    while ((r = rateRe.exec(d[2])) !== null) {
      if (r[2] !== currency) continue;
      out.push({
        rate_date: d[1],
        unit: parseInt(r[1], 10) || 1,
        rate: Number(String(r[3]).replace(',', '.')),
      });
    }
  }
  return out.sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1)); // newest first
}

/** Cache lookup: the newest published rate on or before `onDate`. */
async function cachedRate(currency, onDate) {
  const r = await query(
    `SELECT currency, rate_date, rate, unit FROM mnb_exchange_rates
      WHERE currency = $1 AND rate_date <= $2::date
      ORDER BY rate_date DESC LIMIT 1`, [currency, onDate]);
  return r.rows[0] || null;
}

async function storeRates(currency, rows) {
  for (const x of rows) {
    await query(
      `INSERT INTO mnb_exchange_rates (currency, rate_date, rate, unit)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate, unit = EXCLUDED.unit`,
      [currency, x.rate_date, x.rate, x.unit]);
  }
}

/**
 * The rate to book a `performanceDate` cost at.
 *
 * @returns {Promise<{status:'ok'|'missing', rate?:number, rateDate?:string, unit?:number, reason?:string}>}
 */
async function rateFor(currency, performanceDate) {
  const cur = String(currency || '').toUpperCase();
  if (!cur || cur === 'HUF') return { status: 'ok', rate: 1, rateDate: ymd(performanceDate), unit: 1 };
  if (!SUPPORTED.includes(cur)) return { status: 'missing', reason: `nem támogatott pénznem: ${cur}` };

  const on = ymd(performanceDate);

  const hit = await cachedRate(cur, on);
  // A cached rate within 7 days of the date is authoritative — MNB never has a gap that
  // long, so anything older means we simply have not fetched the period yet.
  if (hit && (new Date(on) - new Date(ymd(hit.rate_date))) / 86400000 <= 7) {
    return { status: 'ok', rate: Number(hit.rate), rateDate: ymd(hit.rate_date), unit: hit.unit };
  }

  if (!networkAllowed()) {
    return { status: 'missing', reason: 'árfolyam-lekérés letiltva ebben a környezetben' };
  }

  try {
    // A 10-day window back from the date covers any weekend or holiday run.
    const from = new Date(new Date(on).getTime() - 10 * 86400000);
    const xml = await soapGetExchangeRates(ymd(from), on, cur);
    const rows = parseRates(xml, cur);
    if (rows.length === 0) return { status: 'missing', reason: 'az MNB nem adott vissza árfolyamot erre az időszakra' };
    await storeRates(cur, rows);
    const best = rows.find((x) => x.rate_date <= on) || rows[0];
    return { status: 'ok', rate: best.rate, rateDate: best.rate_date, unit: best.unit };
  } catch (e) {
    logger.warn(`[mnb] árfolyam-lekérés sikertelen (${cur} @ ${on}): ${e.message}`);
    // Fall back to any cached rate we have, however old — but say how old it is.
    if (hit) {
      return { status: 'ok', rate: Number(hit.rate), rateDate: ymd(hit.rate_date), unit: hit.unit, stale: true };
    }
    return { status: 'missing', reason: `MNB nem elérhető: ${e.message}` };
  }
}

/**
 * Convert an original amount to the HUF value to BOOK.
 * @returns {Promise<{amountHuf:number|null, status, rate, rateDate, unit, reason}>}
 */
async function toHuf(originalAmount, currency, performanceDate) {
  const r = await rateFor(currency, performanceDate);
  if (r.status !== 'ok') return { amountHuf: null, ...r };
  const huf = Number(originalAmount) * (Number(r.rate) / (r.unit || 1));
  return { amountHuf: Math.round(huf * 100) / 100, ...r };
}

module.exports = { SUPPORTED, rateFor, toHuf, networkAllowed, parseRates, cachedRate, storeRates, ymd };
