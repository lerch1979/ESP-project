/**
 * A számla besorolásából képzett szállásköltség-sorok karbantartása.
 *
 * MIÉRT KÉPZETT, NEM ÍROTT
 * ------------------------
 * Két számla-tábla él egymás mellett: a felület az `invoices`-ba ír, a profit- és
 * költségkimutatás viszont az `accommodation_expenses`-ből olvas. Július óta a
 * szállásonkénti költség NULLÁT mutatott, miközben tízmilliónyi számla érkezett — csak a
 * másik táblába. A javítás nem egy harmadik tábla és nem egy "átvezetés" gomb, amit el
 * lehet felejteni megnyomni: a költségsor a besorolás MELLÉKTERMÉKE, és ugyanabban a
 * tranzakcióban keletkezik.
 *
 * AMI SZÁNDÉKOSAN NEM KÉPEZ KÖLTSÉGSORT
 * -------------------------------------
 *   • általános / központi célpont — nincs mögötte szálláshely;
 *   • BÉRLETI DÍJ — a számlázó motor a rent_basis/rent_amount mezőkből már kiszámolja
 *     és beleteszi a cost_amount-ba (billingEngine ~520. sor). A bérbeadó számlájának
 *     átvezetése ugyanazt a díjat másodszor is beírná. Ezt nem hallgatjuk el: a hívó
 *     visszakapja `skipped`-ben, hogy miért nem keletkezett sor.
 *
 * IDEMPOTENS
 * ----------
 * A besorolás bármikor újraírható (szerkesztés, tömeges átsorolás). Minden futás a
 * besorolás JELENLEGI állapotához igazítja a költségsorokat: ami már nincs, azt
 * soft-delete-eli, ami változott, azt frissíti. Egy besoroláshoz legfeljebb egy élő
 * költségsor tartozhat (uniq_acc_exp_per_allocation, mig 160) — ismételt mentés tehát
 * nem duplázhat.
 */
const { query } = require('../database/connection');
const { monthStatus } = require('../utils/monthLock');

/** A négy vödör, amit az accommodation_expenses CHECK-je enged. */
const BUCKETS = ['rezsi', 'karbantartas', 'takaritas', 'egyeb'];

/**
 * Számla-kategória → költség-vödör, ha a besorolás nem mondja meg.
 *
 * A kulcs a kategória NEVE kisbetűsen: az invoice_categories szabad szöveges tábla, a
 * nevek pedig beszédesebbek és stabilabbak, mint a soronként eltérő azonosítók. Amire
 * nincs szabály, az 'egyeb' — nem találgatunk finomabbat.
 */
const CATEGORY_MAP = {
  'rezsi (utilities)': 'rezsi',
  'rezsi': 'rezsi',
  'anyag': 'karbantartas',
  'anyagköltség': 'karbantartas',
  'takarítás': 'takaritas',
};

/**
 * A bérleti díj a motor dolga — az ilyen kategóriájú számla nem képez költségsort.
 * Névre illesztünk, mert a kategória szabad szöveg.
 */
const RENT_CATEGORY_RE = /bérleti\s*díj|berleti\s*dij/i;

/** 'rezsi' → melyik utility_line, ha a besorolás megadta. */
function bucketFor(alloc, invoiceCategoryName) {
  if (alloc.expense_category && BUCKETS.includes(alloc.expense_category)) {
    return alloc.expense_category;
  }
  const key = String(invoiceCategoryName || '').trim().toLowerCase();
  return CATEGORY_MAP[key] || 'egyeb';
}

/** A költséghónap a TELJESÍTÉS dátumából jön — ezért vezettük be (mig 156). */
function monthOfInvoice(inv) {
  const d = inv.performance_date || inv.invoice_date;
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * A számla költségsorainak egyeztetése a besorolásához.
 *
 * @param {string} invoiceId
 * @param {object} client   futó tranzakció kliense (kötelező — a besorolással egy egységben)
 * @returns {Promise<{created:number, updated:number, removed:number, skipped:Array}>}
 */
async function syncFromAllocations(invoiceId, client) {
  const q = (sql, params) => (client ? client.query(sql, params) : query(sql, params));

  const invRes = await q(
    `SELECT i.id, i.invoice_number, i.vendor_name, i.vendor_tax_number, i.vendor_contractor_id,
            i.invoice_date, i.performance_date, i.notes, i.file_path, i.created_by,
            i.currency, i.original_amount, i.original_currency, i.exchange_rate,
            i.exchange_rate_date, i.rate_status, i.cost_center_id, i.deleted_at,
            ic.name AS category_name
       FROM invoices i
       LEFT JOIN invoice_categories ic ON ic.id = i.category_id
      WHERE i.id = $1`, [invoiceId]);
  if (invRes.rows.length === 0) return { created: 0, updated: 0, removed: 0, skipped: [] };
  const inv = invRes.rows[0];

  const month = monthOfInvoice(inv);
  const skipped = [];

  // A törölt számla költségsorai is megszűnnek — különben a kimutatásban ott maradna egy
  // olyan tétel, aminek a bizonylata már nincs meg.
  const allocRes = inv.deleted_at
    ? { rows: [] }
    : await q(`SELECT * FROM invoice_allocations WHERE invoice_id = $1`, [invoiceId]);

  const isRent = RENT_CATEGORY_RE.test(inv.category_name || '');

  // Amiből költségsor lesz: csak a szálláshelyhez rendelt sorok.
  const wanted = [];
  for (const a of allocRes.rows) {
    if (a.target_type !== 'accommodation' || !a.accommodation_id) {
      if (a.target_type) {
        skipped.push({ allocation_id: a.id, reason: `${a.target_type}: nincs mögötte szálláshely, cégszintű kiadás` });
      }
      continue;
    }
    if (isRent) {
      skipped.push({
        allocation_id: a.id,
        reason: 'bérleti díj — a számlázó motor a szállás bérleti konstrukciójából már '
              + 'kiszámolja, az átvezetés kétszer terhelné a házat',
      });
      continue;
    }
    if (!month) {
      skipped.push({ allocation_id: a.id, reason: 'nincs teljesítés (vagy számla) dátum, így nincs költséghónap' });
      continue;
    }
    wanted.push(a);
  }

  // Egy már lezárt hónapot nem írunk át észrevétlenül. A besorolás elmentődik, a
  // költségsor viszont nem keletkezik meg magától — a hívó látja, hogy miért.
  if (wanted.length > 0 && month) {
    const lock = await monthStatus(`${month}-01`);
    if (lock.closed) {
      for (const a of wanted) {
        skipped.push({ allocation_id: a.id, reason: `${month} le van zárva — a költségsor nem képződik automatikusan` });
      }
      wanted.length = 0;
    }
  }

  const existingRes = await q(
    `SELECT id, invoice_allocation_id, accommodation_id, billing_month, category, amount, utility_line
       FROM accommodation_expenses
      WHERE invoice_id = $1 AND deleted_at IS NULL`, [invoiceId]);
  const byAlloc = new Map(existingRes.rows.map((r) => [r.invoice_allocation_id, r]));

  let created = 0; let updated = 0; let removed = 0;

  for (const a of wanted) {
    const bucket = bucketFor(a, inv.category_name);
    const utilLine = a.utility_line || null;
    const note = [inv.notes, a.note].filter(Boolean).join(' · ') || null;
    const cur = byAlloc.get(a.id);

    if (cur) {
      byAlloc.delete(a.id);
      // A besorolás mezőin túl a SZÁMLA mezőit is átvezetjük (szállító, számlaszám,
      // dátumok, árfolyam). Ezek a számla szerkesztésekor változhatnak, és ha a költségsor
      // megtartaná a régi szállítót, a két oldal észrevétlenül elcsúszna egymástól.
      await q(
        `UPDATE accommodation_expenses
            SET accommodation_id = $1, billing_month = $2, category = $3, amount = $4,
                utility_line = $5, notes = $6,
                invoice_number = $7, vendor_name = $8, vendor_tax_number = $9,
                vendor_contractor_id = $10, invoice_date = $11, performance_date = $12,
                cost_center_id = $13, attachment_url = $14, currency = $15,
                original_amount = $16, original_currency = $17, exchange_rate = $18,
                exchange_rate_date = $19, rate_status = $20, updated_at = NOW()
          WHERE id = $21`,
        [a.accommodation_id, month, bucket, a.amount, utilLine, note,
         inv.invoice_number, inv.vendor_name, inv.vendor_tax_number, inv.vendor_contractor_id,
         inv.invoice_date, inv.performance_date, inv.cost_center_id, inv.file_path,
         inv.currency || 'HUF', inv.original_amount, inv.original_currency,
         inv.exchange_rate, inv.exchange_rate_date, inv.rate_status || 'not_needed', cur.id]);
      updated++;
      continue;
    }

    await q(
      `INSERT INTO accommodation_expenses (
         accommodation_id, billing_month, category, amount, currency,
         invoice_number, vendor_name, vendor_tax_number, vendor_contractor_id,
         invoice_date, performance_date, cost_center_id, notes, attachment_url,
         original_amount, original_currency, exchange_rate, exchange_rate_date, rate_status,
         utility_line, source, status, created_by, invoice_id, invoice_allocation_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                 'invoice','confirmed',$21,$22,$23)`,
      [a.accommodation_id, month, bucket, a.amount, inv.currency || 'HUF',
       inv.invoice_number, inv.vendor_name, inv.vendor_tax_number, inv.vendor_contractor_id,
       inv.invoice_date, inv.performance_date, inv.cost_center_id, note, inv.file_path,
       inv.original_amount, inv.original_currency, inv.exchange_rate,
       inv.exchange_rate_date, inv.rate_status || 'not_needed',
       utilLine, inv.created_by, invoiceId, a.id]);
    created++;
  }

  // Ami a besorolásból eltűnt (átsorolták máshová, vagy a számlát törölték).
  for (const leftover of byAlloc.values()) {
    await q(`UPDATE accommodation_expenses SET deleted_at = NOW() WHERE id = $1`, [leftover.id]);
    removed++;
  }

  return { created, updated, removed, skipped };
}

module.exports = { syncFromAllocations, BUCKETS, CATEGORY_MAP, RENT_CATEGORY_RE, monthOfInvoice };
