/**
 * ACTIVITY — quick note capture on leads, opportunities and partners (mig 152).
 *
 * The case that matters most here is ACT-04. Before this round, `/partners/activities`
 * resolved a lead-party's owning contractor to NULL, and `ownsRow(scope, null)` is TRUE
 * by design (globally-authored content is shared) — so ANY caller holding `settings.view`
 * could read, write and delete the notes on ANY lead, straight past the sales row
 * scoping. `data_controller` is exactly that shape: settings.view + settings.edit, no
 * sales permission at all. This scenario pins the fix so the hole cannot come back
 * before Phase 4 puts external agents on the same routes.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');

module.exports = {
  area: 'ACTIVITY',
  title: 'gyors jegyzetelés · lehetőség mint fél · visszahívás → valódi feladat · jegyzetben keresés',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    // settings.view + settings.edit, but NO sales permission — see the header note.
    const outsider = http.tokenFor(ctx.ids.user.data_controller);

    const lead = await http.post('/sales/leads', { token: t, body: {
      name: 'ACT Jegyzet Kft', source: 'hideg hívás', expected_headcount: 30 } });
    const opp = await http.post('/sales/opportunities', { token: t, body: {
      lead_id: lead.body.data.id, title: 'ACT 30 fő Győr', stage: 'qualified',
      expected_monthly_value: 1800000, probability: 40 } });

    return { t, outsider, leadId: lead.body.data.id, oppId: opp.body.data.id,
             clientA: ctx.ids.client.A,
             // data_controller's OWN tenant — the contrast case in ACT-04 has to be a
             // party that user legitimately owns, or it proves nothing about the fix.
             ownTenant: ctx.ids.client.T1 };
  },

  cases: [
    {
      id: 'ACT-01',
      name: 'gyors jegyzet érdeklődőre: tárgy nélkül, csak szöveggel is rögzíthető',
      expected: { status: 201, kind: 'call', body_saved: true, subject_null: true },
      hint: 'the quick box posts kind+body only — requiring a subject would kill the 20s capture',
      run: async (ctx, s) => {
        const r = await http.post('/partners/activities', { token: s.t, body: {
          lead_id: s.leadId, kind: 'call',
          body: 'Felhívtam, 30 főt keresnek Győr környékén, márciustól.' } });
        s.actId = r.body.data?.id;
        return {
          status: r.status,
          kind: r.body.data?.kind,
          body_saved: (r.body.data?.body || '').includes('Győr környékén'),
          subject_null: r.body.data?.subject === null,
        };
      },
    },
    {
      id: 'ACT-02',
      name: 'a LEHETŐSÉG is fél lehet (mig 152), de csak pontosan egy fél adható meg',
      expected: { opp_note: 201, on_opportunity: true, two_parties_refused: 400 },
      hint: 'partner_activities.opportunity_id + partner_activities_party_chk = exactly one',
      run: async (ctx, s) => {
        const r = await http.post('/partners/activities', { token: s.t, body: {
          opportunity_id: s.oppId, kind: 'meeting',
          body: 'Helyszíni bejárás a győri telephelyen, kéthetes próbaidőszakot kérnek.' } });
        const both = await http.post('/partners/activities', { token: s.t, body: {
          opportunity_id: s.oppId, lead_id: s.leadId, kind: 'note', body: 'két fél' } });
        return {
          opp_note: r.status,
          on_opportunity: r.body.data?.opportunity_id === s.oppId,
          two_parties_refused: both.status,
        };
      },
    },
    {
      id: 'ACT-03',
      name: 'visszahívás dátum VALÓDI feladatot hoz létre, a lehetőségre és a partnerre kötve',
      expected: { status: 201, task_linked: true, task_exists: true, tagged: true, title_names_party: true },
      hint: 'mig 145: follow_up_at always writes a tasks row in the same transaction',
      run: async (ctx, s) => {
        const r = await http.post('/partners/activities', { token: s.t, body: {
          opportunity_id: s.oppId, kind: 'call',
          body: 'Visszahívást kért jövő hétre.',
          follow_up_at: '2026-09-10T09:00' } });
        const taskId = r.body.data?.follow_up_task_id;
        const t = taskId
          ? await query('SELECT title, tags, status FROM tasks WHERE id = $1', [taskId])
          : { rows: [] };
        return {
          status: r.status,
          task_linked: !!taskId,
          task_exists: t.rows.length === 1,
          tagged: (t.rows[0]?.tags || []).includes('partner-utankovetes'),
          // The generated title must name the prospect, not just the deal — a task list
          // full of bare deal names is unusable.
          title_names_party: (t.rows[0]?.title || '').includes('ACT Jegyzet Kft'),
        };
      },
    },
    {
      id: 'ACT-04',
      name: 'sor-szintű láthatóság: settings joggal, sales jog NÉLKÜL az érdeklődő jegyzetei nem érhetők el',
      expected: { read: 404, write: 404, opp_read: 404, own_partner_ok: 200 },
      hint: 'REGRESSION: lead/opportunity parties are scoped by owner_user_id, not by the tenant predicate',
      run: async (ctx, s) => {
        const read = await http.get('/partners/activities', {
          token: s.outsider, query: { lead_id: s.leadId } });
        const write = await http.post('/partners/activities', { token: s.outsider, body: {
          lead_id: s.leadId, kind: 'note', body: 'nem szabadna' } });
        const oppRead = await http.get('/partners/activities', {
          token: s.outsider, query: { opportunity_id: s.oppId } });
        // Contrast: the SAME user reaching an ordinary contractor party is unaffected —
        // the fix narrows sales rows, it does not break tenant-scoped reads.
        const own = await http.get('/partners/activities', {
          token: s.outsider, query: { contractor_id: s.ownTenant } });
        return { read: read.status, write: write.status, opp_read: oppRead.status, own_partner_ok: own.status };
      },
    },
    {
      id: 'ACT-05',
      name: 'a jegyzet szövege kereshető az érdeklődő- és a pipeline-listáról',
      expected: { lead_by_note: true, opp_by_note: true, lead_by_name: true, miss: 0 },
      hint: 'listLeads/listOpportunities `q` matches an EXISTS over partner_activities',
      run: async (ctx, s) => {
        // "Győr" appears only in the note bodies, never in the lead name.
        const l = await http.get('/sales/leads', { token: s.t, query: { q: 'Győr környékén' } });
        const o = await http.get('/sales/opportunities', { token: s.t, query: { q: 'próbaidőszakot' } });
        const byName = await http.get('/sales/leads', { token: s.t, query: { q: 'ACT Jegyzet' } });
        const none = await http.get('/sales/leads', { token: s.t, query: { q: 'zzz-nincs-ilyen-szoveg' } });
        return {
          lead_by_note: (l.body.data || []).some((x) => x.id === s.leadId),
          opp_by_note: (o.body.data || []).some((x) => x.id === s.oppId),
          lead_by_name: (byName.body.data || []).some((x) => x.id === s.leadId),
          miss: (none.body.data || []).length,
        };
      },
    },
    {
      id: 'ACT-06',
      name: 'az idővonal a szerzőt is megadja, legújabb elöl',
      expected: { has_author: true, newest_first: true, count: 3 },
      hint: 'created_by was stored since mig 145 but never resolved to a name',
      run: async (ctx, s) => {
        const r = await http.get('/partners/activities', { token: s.t, query: { lead_id: s.leadId } });
        const rows = r.body.data || [];
        const opp = await http.get('/partners/activities', { token: s.t, query: { opportunity_id: s.oppId } });
        const oppRows = opp.body.data || [];
        const times = oppRows.map((x) => new Date(x.occurred_at).getTime());
        return {
          has_author: rows.length > 0 && !!(rows[0].author_name || rows[0].author_email),
          newest_first: times.every((v, i) => i === 0 || times[i - 1] >= v),
          // 1 on the lead + 2 on the opportunity = 3 written by this scenario.
          count: rows.length + oppRows.length,
        };
      },
    },
    {
      id: 'ACT-07',
      name: 'lehetőségnél a kapcsolattartó az ÉRDEKLŐDŐ emberei közül választható, idegené nem',
      expected: { own_contact: 201, foreign_contact: 400 },
      hint: 'partner_contacts has no opportunity_id — the contact must belong to the party it hangs off',
      run: async (ctx, s) => {
        const mine = await http.post('/partners/contacts', { token: s.t, body: {
          lead_id: s.leadId, name: 'ACT Kovács Béla', role_title: 'HR vezető' } });
        const foreign = await http.post('/partners/contacts', { token: s.t, body: {
          contractor_id: s.clientA, name: 'ACT Idegen Anna' } });

        const ok = await http.post('/partners/activities', { token: s.t, body: {
          opportunity_id: s.oppId, kind: 'call', body: 'Egyeztetés Bélával.',
          contact_id: mine.body.data?.id } });
        const bad = await http.post('/partners/activities', { token: s.t, body: {
          opportunity_id: s.oppId, kind: 'call', body: 'Idegen kapcsolattartó.',
          contact_id: foreign.body.data?.id } });
        return { own_contact: ok.status, foreign_contact: bad.status };
      },
    },
    {
      id: 'ACT-08',
      name: 'üres jegyzet nem rögzíthető — a doboz nem hoz létre tartalmatlan sort',
      expected: { empty: 400, whitespace_only: 400 },
      hint: 'createActivity requires subject OR body',
      run: async (ctx, s) => {
        const a = await http.post('/partners/activities', { token: s.t, body: {
          lead_id: s.leadId, kind: 'note' } });
        const b = await http.post('/partners/activities', { token: s.t, body: {
          lead_id: s.leadId, kind: 'note', body: '   ' } });
        return { empty: a.status, whitespace_only: b.status };
      },
    },
  ],
};
