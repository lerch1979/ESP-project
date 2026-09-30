/**
 * AGENT — a Triage Agent kill switch-e és policy kapuja HTTP-n (spec 1.6, 6.).
 *
 * MIÉRT FUNCTEST ÉS NEM CSAK JEST: a Jest-tesztek a modulokat mérik (szabályok, dedup,
 * policy kapu, idempotencia). Az viszont, hogy a KAPCSOLÓ tényleg működik-e a
 * felületről — hogy a végpont létezik, hogy a nem-szuperadmin nem éri el, hogy az
 * írás után a visszaolvasás ugyanazt adja —, csak a teljes HTTP-láncon derül ki.
 * A CLAUDE.md szabálya szerint egy funkció addig nem kész, amíg ez nincs végigpróbálva.
 *
 * A LEGFONTOSABB ESET: AGENT-03. Ha az env szigorúbb, a felületi kapcsoló NEM
 * érvényesül, és ezt a válasz KI IS MONDJA. Egy csendben hatástalan kapcsoló azt
 * hitetné az adminnal, hogy leállította (vagy elindította) az agentet.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const mode = require('../../../src/agent/mode');

module.exports = {
  area: 'AGENT',
  title: 'Triage Agent · kill switch · policy kapu · audit',

  async setup(ctx) {
    return { t: http.tokenFor(ctx.ids.user.superadmin) };
  },

  async teardown() {
    // Minden akció vissza letiltva, üzemmód off. A teszt ne hagyjon élesített agentet.
    await query("UPDATE agent_action_policy SET enabled = false, min_confidence = 0.900 WHERE action_type <> 'link_duplicate'");
    await query("UPDATE agent_action_policy SET enabled = false, min_confidence = 0.950 WHERE action_type = 'link_duplicate'");
    await query("UPDATE agent_triage_config SET mode = 'off', reason = 'functest teardown'");
    delete process.env.AGENT_MODE;
    mode.cacheUrit();
  },

  cases: [
    {
      id: 'AGENT-01',
      name: 'a beállítások lekérdezhetők, és a lap KIMONDJA, hogy a sor nincs bekötve',
      expected: { status: 200, mode: 'off', policy_sorok: 16, engedelyezett: 0, sor_bekotve: false },
      hint: 'egy kapcsoló, ami nem mondja meg, hogy hatástalan, rosszabb, mintha nem lenne ott',
      run: async (ctx, s) => {
        const r = await http.get('/agent/settings', { token: s.t });
        const d = r.body?.data;
        return {
          status: r.status,
          mode: d?.mode?.effective,
          policy_sorok: d?.policy?.length,
          engedelyezett: d?.readiness?.enabled_actions,
          sor_bekotve: d?.readiness?.pipeline_wired,
        };
      },
    },
    {
      id: 'AGENT-02',
      name: '⚠️ még az ADMIN sem éri el — olvasásra sem',
      expected: { status: 403 },
      hint: 'a policy tábla együtt megmutatja, mit tenne az agent: ez belső információ',
      run: async (ctx) => {
        const r = await http.get('/agent/settings', { token: http.tokenFor(ctx.ids.user.admin) });
        return { status: r.status };
      },
    },
    {
      id: 'AGENT-03',
      name: '⚠️ az env PLAFONJA lefogja a felületi kapcsolót — és a válasz kimondja',
      expected: {
        status: 200, tarolt: 'shadow', tenyleges: 'off', capped: true, megmondja: true,
        visszaolvasva: 'shadow', db_sorok: 1,
      },
      hint: 'incidensnél a deployból le kell tudni fogni úgy, hogy egy kattintás ne engedje vissza',
      run: async (ctx, s) => {
        delete process.env.AGENT_MODE;          // nincs env → 'off' a plafon
        mode.cacheUrit();
        const r = await http.put('/agent/settings', { token: s.t, body: { mode: 'shadow', reason: 'functest' } });
        // ⚠️ VISSZAOLVASÁS, nem a PUT válaszának elhitele. Az első változatom csak a
        // választ vizsgálta, és ezért ÁTMENT akkor is, amikor a config sor hiányzott és
        // az UPDATE nulla soron "sikerült" — vagyis semmi nem tárolódott.
        const vissza = await http.get('/agent/settings', { token: s.t });
        const db = await query('SELECT count(*)::int c FROM agent_triage_config');
        return {
          status: r.status,
          tarolt: r.body?.data?.stored,
          tenyleges: r.body?.data?.effective,
          capped: r.body?.data?.capped,
          megmondja: /AGENT_MODE=off/.test(r.body?.message || ''),
          visszaolvasva: vissza.body?.data?.mode?.stored,
          db_sorok: db.rows[0].c,
        };
      },
    },
    {
      id: 'AGENT-04',
      name: 'az env enyhítése után a TÁROLT szándék érvénybe lép',
      expected: { tenyleges: 'shadow' },
      hint: 'a kért értéket tároljuk, nem a szigorítottat — különben a szándék elvesznék',
      run: async (ctx, s) => {
        process.env.AGENT_MODE = 'shadow';
        mode.cacheUrit();
        const r = await http.get('/agent/settings', { token: s.t });
        delete process.env.AGENT_MODE;
        mode.cacheUrit();
        return { tenyleges: r.body?.data?.mode?.effective };
      },
    },
    {
      id: 'AGENT-05',
      name: 'érvénytelen üzemmód elutasítva',
      expected: { status: 400 },
      run: async (ctx, s) => {
        const r = await http.put('/agent/settings', { token: s.t, body: { mode: 'turbo' } });
        return { status: r.status };
      },
    },
    {
      id: 'AGENT-06',
      name: 'akció tételesen engedélyezhető, ismeretlen akciótípus 404',
      expected: { engedelyezes: 200, enabled: true, ismeretlen: 404 },
      hint: 'élesítés akciónként történik, nem egyben',
      run: async (ctx, s) => {
        const a = await http.put('/agent/policy/ack_resident', { token: s.t, body: { enabled: true } });
        const b = await http.put('/agent/policy/nincs_ilyen_akcio', { token: s.t, body: { enabled: true } });
        return { engedelyezes: a.status, enabled: a.body?.data?.enabled, ismeretlen: b.status };
      },
    },
    {
      id: 'AGENT-07',
      name: '⚠️ a confidence-küszöb NEM engedhető le a felületről, csak szigorítható',
      expected: { leenged: 400, szigorit: 200, vegso: '0.980' },
      hint: 'a küszöböt a golden seten mérve kell kalibrálni, nem felületen csavarni',
      run: async (ctx, s) => {
        const a = await http.put('/agent/policy/link_duplicate', { token: s.t, body: { min_confidence: 0.5 } });
        const b = await http.put('/agent/policy/link_duplicate', { token: s.t, body: { min_confidence: 0.98 } });
        return { leenged: a.status, szigorit: b.status, vegso: String(b.body?.data?.min_confidence) };
      },
    },
    {
      id: 'AGENT-08',
      name: '⚠️ az üzemmód-váltás NAPLÓZVA van, és a napló APPEND-ONLY',
      expected: { van_bejegyzes: true, update_blokkolt: true, delete_blokkolt: true },
      hint: 'a napló módosítása megsemmisítené azt a bizonyítékot, amiért a napló létezik',
      run: async () => {
        const n = await query("SELECT count(*)::int c FROM agent_audit_log WHERE event = 'mode_change'");
        // A kulcs uuid (mig 123 alakja, 184 megőrizte) — az `id` szerinti rendezés
        // értelmetlen lenne, ezért időbélyeg szerint választunk sort.
        const ut = 'WHERE id = (SELECT id FROM agent_audit_log ORDER BY created_at DESC LIMIT 1)';
        let u = false;
        let d = false;
        try { await query(`UPDATE agent_audit_log SET event = 'hamis' ${ut}`); } catch { u = true; }
        try { await query(`DELETE FROM agent_audit_log ${ut}`); } catch { d = true; }
        return { van_bejegyzes: n.rows[0].c > 0, update_blokkolt: u, delete_blokkolt: d };
      },
    },
    {
      id: 'AGENT-09',
      name: '⚠️ az ÖRÖK L1 akciók szintje adatbázis-szinten sem emelhető L2-re',
      expected: { emelheto: false },
      hint: 'egy elgépelt admin-kattintás nem emelheti L2-re azt, ami pénzhez vagy szerződéshez nyúl',
      run: async () => {
        let hiba = false;
        try {
          await query("UPDATE agent_action_policy SET max_autonomy_level = 2 WHERE action_type = 'close_ticket'");
        } catch { hiba = true; }
        return { emelheto: !hiba };
      },
    },
    {
      id: 'AGENT-10',
      name: '⚠️ L1-es akciót az AGENT nem hajthat végre — az adatbázis is tiltja',
      expected: { bement: false },
      hint: 'spec 7.5: ha ez mégis megtörténik, az bug, és azonnal off-ba kell tenni',
      run: async () => {
        let bement = false;
        try {
          await query(
            `INSERT INTO agent_actions (action_type, payload, autonomy_level, idempotency_key, status, executed_by)
             VALUES ('close_ticket', '{}', 1, $1, 'executed', 'agent')`,
            [`ft-l1-${Date.now()}`]
          );
          bement = true;
        } catch { bement = false; }
        return { bement };
      },
    },
    {
      id: 'AGENT-11',
      name: '⚠️ ugyanaz az idempotency_key másodszor FIZIKAILAG nem megy be',
      expected: { elso: true, masodik: false },
      hint: 'nem a kód vigyáz rá, hanem az egyedi index — egy átírás a kódot kikerülhetné',
      run: async () => {
        const k = `ft-idem-${Date.now()}`;
        const be = async () => {
          try {
            await query(
              `INSERT INTO agent_actions (action_type, payload, autonomy_level, idempotency_key)
               VALUES ('create_ticket', '{}', 2, $1)`, [k]);
            return true;
          } catch { return false; }
        };
        const elso = await be();
        const masodik = await be();
        await query('DELETE FROM agent_actions WHERE idempotency_key = $1', [k]);
        return { elso, masodik };
      },
    },
    {
      id: 'AGENT-12',
      name: '⚠️ ha a config sor HIÁNYZIK, a mentés akkor is TÁROL — nincs néma siker',
      expected: { status: 200, visszaolvasva: 'shadow', db_sorok: 1 },
      hint: 'a fixture törölheti a sort (updated_by → users); egy UPDATE nulla soron '
        + '"sikeres" lenne, és a felület elmentettnek jelezné a semmit',
      run: async (ctx, s) => {
        await query('DELETE FROM agent_triage_config');
        const r = await http.put('/agent/settings', { token: s.t, body: { mode: 'shadow', reason: 'functest hiányzó sor' } });
        const vissza = await http.get('/agent/settings', { token: s.t });
        const db = await query('SELECT count(*)::int c FROM agent_triage_config');
        return { status: r.status, visszaolvasva: vissza.body?.data?.mode?.stored, db_sorok: db.rows[0].c };
      },
    },
  ],
};
