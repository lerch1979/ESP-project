/**
 * Beszállító-javaslatok: kit írtunk már be, és milyen adószámmal.
 *
 * MIÉRT ÍGY, ÉS MIÉRT NEM KELL MAJD ELDOBNI
 * -----------------------------------------
 * Ma a beszállító szabad szöveg a számlákon és a költségeken — nincs törzsadat. Ez a
 * végpont a MEGLÉVŐ adatokból gyűjti össze, kit használtunk már, hogy a név beírásakor
 * fel lehessen ajánlani és az adószám magától kitöltődjön.
 *
 * A válasz alakja szándékosan olyan, amilyen akkor is lesz, amikor a beszállítók átkerülnek
 * a partner-modulba (`contractors` + `contractor_roles`): minden találat visz egy
 * `contractor_id` mezőt, ami MOST null. Amikor a törzsadat elkészül, csak ennek a
 * függvénynek a belseje cserélődik — a végpont neve, a mezők és a frontend marad.
 * Így a mostani munka nem eldobandó lépcső, hanem az első fele ugyanannak.
 *
 * AZ ÍRÁSMÓD-ELTÉRÉSEKET NEM JAVÍTJA, CSAK NEM TERMEL ÚJAT
 * -------------------------------------------------------
 * A `"RÁBA" Lakásfenntartó Szövetkezet` és a `Rába Lakásfenntartó Szövetkezet` ma két
 * külön bejegyzés, és az is marad, amíg valaki el nem dönti, melyik a helyes. A javaslat
 * viszont mindkettőt felkínálja, így legalább új változat nem keletkezik.
 */
const { query, transaction } = require('../database/connection');
const { logger } = require('../utils/logger');
const { scopeOf, contractorPredicate } = require('../utils/tenantScope');
const { deaccent, nameKey } = require('../utils/nameMatch');

/**
 * GET /vendors?q=...  — korábban használt beszállítók, gyakoriság szerint.
 */
const suggest = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const params = [];
    let i = 1;
    const s2 = scopeOf(req);

    // ── A FORRÁS: a partner-törzs (mig 158) ───────────────────────────────────
    // A `beszallito` szereppel rendelkező partnerek az elsődleges lista. Mellettük
    // megjelennek azok a szabad szöveges nevek is, amiket még senki nem sorolt be —
    // különben egy be nem sorolt beszállító eltűnne a javaslatból, és a felhasználó
    // újra begépelné, harmadik írásmóddal.
    const inv = contractorPredicate(s2, 'i.contractor_id', i);
    params.push(...inv.params); i = inv.nextIndex;

    const sql = `
      WITH hasznalat AS (
        SELECT i.vendor_name AS nev, i.vendor_contractor_id AS cid,
               i.vendor_tax_number AS adoszam, i.invoice_date AS datum
          FROM invoices i
         WHERE i.deleted_at IS NULL AND i.vendor_name IS NOT NULL
           AND btrim(i.vendor_name) <> '' AND ${inv.sql}
        UNION ALL
        SELECT e.vendor_name, e.vendor_contractor_id, e.vendor_tax_number, e.performance_date
          FROM accommodation_expenses e
         WHERE e.deleted_at IS NULL AND e.vendor_name IS NOT NULL AND btrim(e.vendor_name) <> ''
      ),
      torzs AS (
        SELECT c.id AS contractor_id, c.name, c.tax_number,
               (SELECT count(*) FROM hasznalat h WHERE h.cid = c.id) AS usage_count,
               (SELECT max(h.datum) FROM hasznalat h WHERE h.cid = c.id) AS last_used
          FROM contractors c
          JOIN contractor_roles r ON r.contractor_id = c.id AND r.role = 'beszallito'
         WHERE c.is_active
      ),
      besorolatlan AS (
        SELECT NULL::uuid AS contractor_id, btrim(h.nev) AS name,
               (ARRAY_AGG(h.adoszam ORDER BY h.datum DESC NULLS LAST)
                  FILTER (WHERE h.adoszam IS NOT NULL))[1] AS tax_number,
               count(*) AS usage_count, max(h.datum) AS last_used
          FROM hasznalat h
         WHERE h.cid IS NULL
         GROUP BY btrim(h.nev)
      )
      SELECT * FROM torzs
      UNION ALL
      SELECT * FROM besorolatlan
      ORDER BY usage_count DESC NULLS LAST, last_used DESC NULLS LAST, name`;

    let rows = (await query(sql, params)).rows;

    if (q) {
      const needle = deaccent(q);
      rows = rows.filter((r) => deaccent(r.name).includes(needle));
    }
    rows = rows.slice(0, limit);

    res.json({ success: true, data: { vendors: rows } });
  } catch (error) {
    logger.error('Beszállító-javaslat hiba:', error);
    res.status(500).json({ success: false, message: 'Beszállító-javaslat hiba' });
  }
};

/**
 * GET /vendors/duplicates — ugyanaz a cég, több írásmóddal.
 *
 * Csak LISTÁZ. Az összevonás emberi döntés: ékezet/írásjel-egyezés erős jel, de nem
 * bizonyíték, és két hasonló név mögött állhat két külön cég. Ahol az adószám is egyezik,
 * ott azt külön jelezzük — az a megbízható jel.
 */
const duplicates = async (req, res) => {
  try {
    const rows = (await query(`
      SELECT vendor_name AS nev, vendor_tax_number AS adoszam, 'invoice' AS honnan, count(*)::int AS db
        FROM invoices WHERE deleted_at IS NULL AND vendor_name IS NOT NULL AND btrim(vendor_name) <> ''
       GROUP BY 1,2,3
      UNION ALL
      SELECT vendor_name, vendor_tax_number, 'expense', count(*)::int
        FROM accommodation_expenses WHERE deleted_at IS NULL AND vendor_name IS NOT NULL AND btrim(vendor_name) <> ''
       GROUP BY 1,2,3`)).rows;

    const csoport = new Map();
    for (const r of rows) {
      const k = nameKey(r.nev);
      if (!csoport.has(k)) csoport.set(k, []);
      csoport.get(k).push(r);
    }

    const parok = [...csoport.entries()]
      .filter(([, list]) => new Set(list.map((x) => x.nev)).size > 1)
      .map(([kulcs, list]) => {
        const adoszamok = [...new Set(list.map((x) => x.adoszam).filter(Boolean))];
        return {
          kulcs,
          valtozatok: list,
          // Az azonos adószám a megbízható jel; az eltérő azt jelenti, hogy MÉGSEM
          // ugyanaz a cég, és összevonni hiba lenne.
          azonos_adoszam: adoszamok.length === 1,
          adoszamok,
          figyelmeztetes: adoszamok.length > 1
            ? 'ELTÉRŐ ADÓSZÁM — valószínűleg két külön cég, ne vond össze!' : null,
        };
      });

    res.json({ success: true, data: { count: parok.length, pairs: parok } });
  } catch (error) {
    logger.error('Beszállító-duplikátum lekérési hiba:', error);
    res.status(500).json({ success: false, message: 'Beszállító-duplikátum lekérési hiba' });
  }
};

/**
 * POST /vendors/merge — { keep_name, merge_names[] }
 *
 * A MEGTARTOTT írásmódra írja át a tételeket, és összeköti őket egy partnerrel. Az
 * eredeti szöveget felülírja, mert a cél épp az egységes név — a bizonyíték a számla
 * képe, nem a betűzés.
 */
const merge = async (req, res) => {
  try {
    const keep = String(req.body?.keep_name || '').trim();
    const others = (req.body?.merge_names || []).map((x) => String(x).trim()).filter(Boolean);
    if (!keep || others.length === 0) {
      return res.status(400).json({ success: false, message: 'keep_name és merge_names megadása kötelező' });
    }
    if (others.includes(keep)) {
      return res.status(400).json({ success: false, message: 'A megtartott név nem szerepelhet az összevonandók között' });
    }

    // Biztonsági fék: ha az összevonandók adószáma eltér a megtartottétól, megállunk.
    const ado = (await query(
      `SELECT DISTINCT vendor_name AS nev, vendor_tax_number AS adoszam FROM (
         SELECT vendor_name, vendor_tax_number FROM invoices WHERE deleted_at IS NULL
         UNION ALL
         SELECT vendor_name, vendor_tax_number FROM accommodation_expenses WHERE deleted_at IS NULL) t
        WHERE vendor_name = ANY($1) AND vendor_tax_number IS NOT NULL`,
      [[keep, ...others]])).rows;
    const egyedi = [...new Set(ado.map((x) => String(x.adoszam).replace(/[^0-9A-Za-z]/g, '')))];
    if (egyedi.length > 1 && req.body?.force !== true) {
      return res.status(409).json({
        success: false,
        message: `Az összevonandó nevek adószáma ELTÉR (${egyedi.join(' vs ')}). `
               + 'Valószínűleg két külön cégről van szó. Ha biztos vagy benne, küldd force=true-val.',
        data: { adoszamok: egyedi },
      });
    }

    const out = await transaction(async (client) => {
      // A megtartott névhez tartozó partner (ha még nincs, most jön létre).
      let c = (await client.query(
        `SELECT id FROM contractors WHERE lower(btrim(name)) = lower($1) LIMIT 1`, [keep])).rows[0];
      if (!c) {
        // A $1 egyszerre kerülne varchar (name) és text (regexp) pozícióba — a pg
        // ilyenkor "inconsistent types deduced" hibát dob. Explicit cast oldja fel.
        c = (await client.query(
          `INSERT INTO contractors (name, slug, is_active, tax_number)
           VALUES ($1::varchar,
                   left(regexp_replace(lower($1::text), '[^a-z0-9]+', '-', 'g'), 90)
                     || '-' || substr(md5($1::text), 1, 6),
                   true, $2) RETURNING id`,
          [keep, egyedi[0] || null])).rows[0];
      }
      await client.query(
        `INSERT INTO contractor_roles (contractor_id, role) VALUES ($1,'beszallito')
         ON CONFLICT DO NOTHING`, [c.id]);

      const all = [keep, ...others];
      const inv = await client.query(
        `UPDATE invoices SET vendor_name = $1, vendor_contractor_id = $2
          WHERE vendor_name = ANY($3) AND deleted_at IS NULL RETURNING 1`, [keep, c.id, all]);
      const exp = await client.query(
        `UPDATE accommodation_expenses SET vendor_name = $1, vendor_contractor_id = $2
          WHERE vendor_name = ANY($3) AND deleted_at IS NULL RETURNING 1`, [keep, c.id, all]);
      return { contractor_id: c.id, invoices: inv.rowCount, expenses: exp.rowCount };
    });

    logger.info('[vendors] összevonás', { keep, others, ...out, user: req.user?.id });
    res.json({
      success: true,
      message: `Összevonva "${keep}" néven: ${out.invoices} számla, ${out.expenses} költség`,
      data: out,
    });
  } catch (error) {
    logger.error('Beszállító-összevonási hiba:', error);
    res.status(500).json({ success: false, message: 'Beszállító-összevonási hiba' });
  }
};

module.exports = { suggest, duplicates, merge };
