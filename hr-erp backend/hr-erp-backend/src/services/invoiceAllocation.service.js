/**
 * Számla-felosztás: melyik szálláshoz / általános / központi kerül egy számla.
 *
 * MIÉRT VAN ELLENŐRZÉS AZ ÖSSZEGRE
 * --------------------------------
 * Ha a részösszegek nem adják ki a számla végösszegét, az nem tűnik fel azonnal: a számla
 * rendben látszik a listában, és csak hónapokkal később derül ki a szállásonkénti
 * kimutatásból, hogy hiányzik belőle pénz — vagy épp több van benne. Ezért a felosztás
 * mentése atomikus, és a szolgáltatás visszautasítja a nem egyező összeget, ahelyett hogy
 * a maradékot csendben elnyelné vagy szétosztaná.
 *
 * A GYAKORI ESET MARAD EGYSZERŰ
 * -----------------------------
 * A számlák túlnyomó többsége egyetlen célponthoz tartozik. Ilyenkor a hívó egyetlen
 * sort ad át, és a szolgáltatás magától a teljes összeget használja — nem kell összeget
 * gépelni ahhoz, hogy „ez a Sarród I.-hez tartozik".
 */
const { query, transaction } = require('../database/connection');

const TARGETS = ['accommodation', 'general', 'central'];
const LABEL = {
  accommodation: 'Szálláshely',
  general: 'Általános (cég)',
  central: 'Központi (saját rész)',
};

/** Két tizedesig kerekítve hasonlítunk: a numeric(15,2) ennél finomabbat úgysem tárol. */
const r2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * A számla felosztásának felülírása (a régi sorok helyére).
 *
 * @param {string} invoiceId
 * @param {Array<{target_type, accommodation_id?, amount?, note?}>} rows
 * @param {number} invoiceTotal a számla FORINT végösszege, amihez igazodni kell
 * @returns {Promise<{error?:string, status?:number, allocations?:Array}>}
 */
async function setAllocations(invoiceId, rows, invoiceTotal, userId = null) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (list.length === 0) return { allocations: [] };   // "nincs hozzárendelve" megengedett

  for (const r of list) {
    if (!TARGETS.includes(r.target_type)) {
      return { error: `Ismeretlen célpont: ${r.target_type}`, status: 400 };
    }
    if (r.target_type === 'accommodation' && !r.accommodation_id) {
      return { error: 'Szálláshely típusnál a szálláshely megadása kötelező', status: 400 };
    }
    if (r.target_type !== 'accommodation' && r.accommodation_id) {
      return { error: `${LABEL[r.target_type]} típushoz nem adható meg szálláshely`, status: 400 };
    }
  }

  // Egy célpont esetén nem kérünk összeget: a teljes számla oda megy.
  if (list.length === 1 && (list[0].amount === undefined || list[0].amount === null || list[0].amount === '')) {
    list[0].amount = invoiceTotal;
  }

  const sum = r2(list.reduce((a, x) => a + Number(x.amount || 0), 0));
  const total = r2(invoiceTotal);
  if (sum !== total) {
    const diff = r2(total - sum);
    return {
      error: `A felosztott összegek (${sum.toLocaleString('hu-HU')} Ft) nem adják ki a számla `
           + `végösszegét (${total.toLocaleString('hu-HU')} Ft). `
           + `${diff > 0 ? `Hiányzik ${diff.toLocaleString('hu-HU')} Ft.` : `Többlet: ${Math.abs(diff).toLocaleString('hu-HU')} Ft.`}`,
      status: 400,
    };
  }

  return transaction(async (client) => {
    await client.query('DELETE FROM invoice_allocations WHERE invoice_id = $1', [invoiceId]);
    const out = [];
    for (const x of list) {
      const ins = await client.query(
        `INSERT INTO invoice_allocations (invoice_id, target_type, accommodation_id, amount, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [invoiceId, x.target_type, x.accommodation_id || null, r2(x.amount), x.note || null, userId]);
      out.push(ins.rows[0]);
    }
    return { allocations: out };
  });
}

/** Egy számla felosztása, szálláshely-névvel együtt (a felület ezt mutatja). */
async function getAllocations(invoiceId) {
  const r = await query(
    `SELECT al.*, a.name AS accommodation_name
       FROM invoice_allocations al
       LEFT JOIN accommodations a ON a.id = al.accommodation_id
      WHERE al.invoice_id = $1
      ORDER BY al.target_type, a.name`, [invoiceId]);
  return r.rows;
}

/** Több számlához egyszerre — a lista-nézet N+1 lekérdezés nélkül. */
async function getAllocationsFor(invoiceIds) {
  if (!invoiceIds || invoiceIds.length === 0) return {};
  const r = await query(
    `SELECT al.invoice_id, al.target_type, al.amount, al.accommodation_id, a.name AS accommodation_name
       FROM invoice_allocations al
       LEFT JOIN accommodations a ON a.id = al.accommodation_id
      WHERE al.invoice_id = ANY($1)
      ORDER BY al.target_type, a.name`, [invoiceIds]);
  const by = {};
  for (const x of r.rows) (by[x.invoice_id] = by[x.invoice_id] || []).push(x);
  return by;
}

module.exports = { TARGETS, LABEL, setAllocations, getAllocations, getAllocationsFor };
