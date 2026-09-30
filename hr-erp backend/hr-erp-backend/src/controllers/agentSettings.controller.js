/**
 * agentSettings — a Triage Agent kill switch-e és policy-táblája a felületnek
 * (`/admin/agent/settings`, spec 1.6).
 *
 * MIÉRT CSAK SZUPERADMIN: ez a kapcsoló azt engedi meg egy gépnek, hogy a lakók felé
 * üzenetet küldjön és jegyeket nyisson. Aki ezt átállítja, az a rendszer viselkedését
 * változtatja meg, nem egy adatot. A `requireSuperAdmin` a route-ban van.
 *
 * AZ 1. HÉTEN A `live` IS VÁLASZTHATÓ A FELÜLETEN — de a hatása nulla, mert az
 * `agent_action_policy` minden sora `enabled=false`, és a feldolgozó sor még nem
 * létezik. A felület EZT KI IS ÍRJA, különben a kapcsoló azt sugallná, hogy elindult
 * valami. Egy kapcsoló, ami nem mondja meg, hogy hatástalan, rosszabb, mint ha nem is
 * lenne ott.
 */
const mode = require('../agent/mode');
const policy = require('../agent/policy');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

/** GET /agent/settings — a teljes állapot egy kérésben, a felület ezt jeleníti meg. */
const getSettings = async (req, res, next) => {
  try {
    // A sor hiánya nem jelenti, hogy "off" van beállítva — azt jelenti, hogy nincs
    // hova írni. Pótoljuk, mielőtt bármit mutatnánk róla.
    await mode.biztositSor();
    const [effective, stored, policyMap] = await Promise.all([
      mode.getMode({ force: true }),
      query('SELECT mode, reason, updated_at, updated_by FROM agent_triage_config LIMIT 1'),
      policy.loadPolicy({ force: true }),
    ]);
    const sorok = [...policyMap.values()];
    const uzenetek = await query(
      `SELECT status, count(*)::int c FROM inbound_messages GROUP BY 1 ORDER BY 1`);

    res.json({
      success: true,
      data: {
        mode: {
          effective,                                 // ami TÉNYLEGESEN érvényes
          stored: stored.rows[0]?.mode || 'off',     // amit a felületen beállítottak
          env: mode.envMode(),                       // a deploy-szintű plafon
          // A felület ezt MONDJA KI: ha az env szigorúbb, a kapcsoló nem érvényesül.
          capped: effective !== (stored.rows[0]?.mode || 'off'),
          reason: stored.rows[0]?.reason || null,
          updated_at: stored.rows[0]?.updated_at || null,
        },
        policy: sorok,
        // EZ A KÉT SZÁM MONDJA MEG, HOGY A `live` ÉRTELMES-E EGYÁLTALÁN.
        readiness: {
          enabled_actions: sorok.filter((s) => s.enabled).length,
          total_actions: sorok.length,
          inbound_by_status: uzenetek.rows,
          // spec 7.1: mérés nélkül nincs élesítés
          golden_set_size: uzenetek.rows.reduce((a, r) => a + r.c, 0),
          golden_set_required: 200,
          pipeline_wired: false,   // az 1. héten nincs feldolgozó sor — kimondva
        },
      },
    });
  } catch (error) { next(error); }
};

/** PUT /agent/settings — üzemmód váltás. Auditált, mert ez rendszerszintű döntés. */
const updateMode = async (req, res, next) => {
  try {
    const { mode: kert, reason } = req.body;
    if (!mode.MODOK.includes(kert)) {
      return res.status(400).json({
        success: false,
        message: `Érvénytelen üzemmód: "${kert}". Lehetséges: ${mode.MODOK.join(', ')}.`,
      });
    }
    const elozo = await mode.getMode({ force: true });
    const eredmeny = await mode.setMode(kert, { userId: req.user.id, reason: reason || null });

    // AUDIT: a spec 3. alapelve szerint az üzemmód-váltás is esemény (`mode_change`).
    // Ez a napló append-only (mig 184), tehát utólag nem lehet letagadni.
    await query(
      `INSERT INTO agent_audit_log (actor, event, entity_type, details)
       VALUES ($1, 'mode_change', 'agent_triage_config', $2)`,
      [`user:${req.user.email || req.user.id}`,
        JSON.stringify({ from: elozo, ...eredmeny, reason: reason || null })]
    );
    logger.info('Triage Agent üzemmód váltás', { from: elozo, ...eredmeny, by: req.user.id });

    res.json({
      success: true,
      data: eredmeny,
      // A KAPCSOLÓ NEM HALLGAT: ha az env lefogja, azt a válasz kimondja, és a
      // felület ezt mutatja. Különben az admin azt hinné, elindította az agentet.
      message: eredmeny.capped
        ? `Beállítva: "${eredmeny.stored}", de az AGENT_MODE=${eredmeny.env} környezeti `
          + `változó szigorúbb, ezért a tényleges üzemmód: "${eredmeny.effective}".`
        : `Üzemmód: "${eredmeny.effective}".`,
    });
  } catch (error) { next(error); }
};

/**
 * PUT /agent/policy/:actionType — egy akció engedélyezése/tiltása, tételesen.
 *
 * AZ ÖRÖK L1 ZÓNÁT NEM ENGEDI ÁTÍRNI: a `max_autonomy_level` itt EGYÁLTALÁN nem
 * módosítható. Nem azért, mert az adatbázis CHECK-je (mig 183) különben megfogná —
 * hanem mert egy felület, ami felajánlja a szintet, azt sugallja, hogy állítható.
 * Itt csak az `enabled` és a `min_confidence` állítható, és a küszöb csak SZIGORÍTHATÓ.
 */
const updatePolicy = async (req, res, next) => {
  try {
    const { actionType } = req.params;
    const { enabled, min_confidence: kuszob } = req.body;

    const meglevo = await query(
      'SELECT * FROM agent_action_policy WHERE action_type = $1', [actionType]);
    if (!meglevo.rows.length) {
      return res.status(404).json({ success: false, message: `Nincs ilyen akciótípus: ${actionType}` });
    }
    const p = meglevo.rows[0];

    if (kuszob !== undefined) {
      const uj = Number(kuszob);
      if (!Number.isFinite(uj) || uj < 0 || uj > 1) {
        return res.status(400).json({
          success: false, message: 'A min_confidence 0 és 1 közötti szám lehet.' });
      }
      // CSAK SZIGORÍTÁS. A küszöb leengedése pont azt a védelmet szedné le, amiért a
      // küszöb létezik — és a spec szerint a számot a golden seten MÉRNI kell, nem
      // felületen csavarni. Aki lejjebb akarja, tegye migrációval, indoklással.
      if (uj < Number(p.min_confidence)) {
        return res.status(400).json({
          success: false,
          message: `A confidence-küszöb nem engedhető le a felületről (${p.min_confidence} → ${uj}). `
            + 'A küszöböt a golden seten mérve kell kalibrálni (spec 7.1).',
        });
      }
    }

    const r = await query(
      `UPDATE agent_action_policy
          SET enabled = COALESCE($2, enabled),
              min_confidence = COALESCE($3, min_confidence),
              updated_by = $4, updated_at = NOW()
        WHERE action_type = $1
        RETURNING *`,
      [actionType, enabled === undefined ? null : !!enabled,
        kuszob === undefined ? null : Number(kuszob), req.user.email || String(req.user.id)]
    );
    policy.cacheUrit();

    await query(
      `INSERT INTO agent_audit_log (actor, event, entity_type, details)
       VALUES ($1, 'mode_change', 'agent_action_policy', $2)`,
      [`user:${req.user.email || req.user.id}`,
        JSON.stringify({ action_type: actionType, from: { enabled: p.enabled, min_confidence: p.min_confidence }, to: r.rows[0] })]
    );

    res.json({ success: true, data: r.rows[0] });
  } catch (error) { next(error); }
};

module.exports = { getSettings, updateMode, updatePolicy };
