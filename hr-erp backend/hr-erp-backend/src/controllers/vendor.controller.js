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
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { scopeOf, contractorPredicate } = require('../utils/tenantScope');
const { deaccent } = require('../utils/nameMatch');

/**
 * GET /vendors?q=...  — korábban használt beszállítók, gyakoriság szerint.
 */
const suggest = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const params = [];
    let i = 1;
    const s = scopeOf(req);

    // Számlák és költségek UNIÓJA: a beszállító mindkét helyen előfordul, és a
    // felhasználónak édesmindegy, melyikben találkozott vele először.
    const inv = contractorPredicate(s, 'i.contractor_id', i);
    params.push(...inv.params); i = inv.nextIndex;

    let sql = `
      WITH forras AS (
        SELECT i.vendor_name AS nev, i.vendor_tax_number AS adoszam, 'invoice' AS honnan,
               i.invoice_date AS datum
          FROM invoices i
         WHERE i.deleted_at IS NULL AND i.vendor_name IS NOT NULL
           AND btrim(i.vendor_name) <> '' AND ${inv.sql}
        UNION ALL
        SELECT e.vendor_name, e.vendor_tax_number, 'expense', e.performance_date
          FROM accommodation_expenses e
         WHERE e.deleted_at IS NULL AND e.vendor_name IS NOT NULL
           AND btrim(e.vendor_name) <> ''
      )
      SELECT btrim(nev) AS name,
             -- A legutóbb használt adószám nyer: ha egyszer javítottak egy elgépelést,
             -- a javított értéket akarjuk felkínálni, nem az elsőt.
             (ARRAY_AGG(adoszam ORDER BY datum DESC NULLS LAST) FILTER (WHERE adoszam IS NOT NULL))[1] AS tax_number,
             count(*) AS usage_count,
             max(datum) AS last_used,
             NULL::uuid AS contractor_id   -- a partner-törzs megérkezéséig
        FROM forras`;

    sql += ` GROUP BY btrim(nev)
             ORDER BY count(*) DESC, max(datum) DESC NULLS LAST`;

    let rows = (await query(sql, params)).rows;

    // A szűrés JS-ben, ÉKEZET- ÉS KISBETŰ-FÜGGETLENÜL — ugyanaz a `deaccent`, amit a
    // partnernév-kereső szkript használ. Így a "vizmu" megtalálja a "Soproni Vízmű"-t,
    // és nem függünk attól, hogy telepítve van-e az unaccent kiterjesztés. Néhány száz
    // beszállítónál ez bőven elég; ha egyszer tízezer lesz, akkor kell SQL-oldali index.
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

module.exports = { suggest };
