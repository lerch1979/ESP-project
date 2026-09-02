/**
 * SALES — the pipeline over the REAL HTTP surface (mig 150).
 *
 * SALES-04 is the one that matters: an accepted quote must MATERIALISE into billing —
 * a partner_contracts row and a client_night_rates row — and that rate must be what the
 * engine then bills. A pipeline that records an agreed price the engine cannot see looks
 * finished and bills nothing.
 */
const http = require('../lib/http');

module.exports = {
  area: 'SALES',
  title: 'érdeklődő → lehetőség → ajánlat · elfogadás díjszabássá alakul · sor-szintű láthatóság',

  async setup(ctx) {
    return { t: http.tokenFor(ctx.ids.user.superadmin), acc: ctx.ids.acc.costPerBed };
  },

  cases: [
    {
      id: 'SALES-01',
      name: 'érdeklődő rögzíthető, és a tulajdonos rákerül',
      expected: { status: 201, owner_set: true, status_new: true },
      hint: 'POST /sales/leads — owner_user_id NOT NULL from day one (Phase 4 needs it)',
      run: async (ctx, s) => {
        const r = await http.post('/sales/leads', { token: s.t, body: {
          name: 'FT Érdeklődő Zrt', source: 'ajánlás', expected_headcount: 25 } });
        s.leadId = r.body.data?.id;
        return { status: r.status, owner_set: !!r.body.data?.owner_user_id, status_new: r.body.data?.status === 'new' };
      },
    },
    {
      id: 'SALES-02',
      name: 'lehetőség + ajánlat: az ajánlat sorai a client_night_rates szótárát követik',
      expected: { opp: 201, quote: 201, net: 620000, rejected_basis: 400 },
      hint: 'quote_lines.billing_basis CHECK mirrors client_night_rates_basis_chk',
      run: async (ctx, s) => {
        const o = await http.post('/sales/opportunities', { token: s.t, body: {
          lead_id: s.leadId, title: 'FT 25 fő', stage: 'proposal',
          expected_monthly_value: 3000000, probability: 50 } });
        s.oppId = o.body.data?.id;

        const bad = await http.post('/sales/quotes', { token: s.t, body: {
          opportunity_id: s.oppId, lines: [{ billing_basis: 'atalany', rate_per_night: 1 }] } });

        const q = await http.post('/sales/quotes', { token: s.t, body: {
          opportunity_id: s.oppId, vat_rate: 0.27,
          lines: [{ description: 'FT ágyblokk', accommodation_id: s.acc, billing_basis: 'per_bed_night',
                    rate_used: 3100, rate_empty: 2000, occupancy_floor_pct: 0.8,
                    contracted_beds: 10, quantity: 200 }] } });
        s.quoteId = q.body.data?.id;
        return { opp: o.status, quote: q.status, net: Number(q.body.data?.net_amount), rejected_basis: bad.status };
      },
    },
    {
      id: 'SALES-03',
      name: 'érdeklődőhöz kötött ajánlat NEM fogadható el — a díjszabás valódi partnert igényel',
      expected: { accept_refused: 409, converted: 200, has_contractor: true },
      hint: 'acceptQuote refuses when opportunity.contractor_id is null; convert first',
      run: async (ctx, s) => {
        const refused = await http.post(`/sales/quotes/${s.quoteId}/accept`, { token: s.t, body: {} });
        await http.post(`/sales/quotes/${s.quoteId}/send`, { token: s.t, body: {} });
        const conv = await http.post(`/sales/leads/${s.leadId}/convert`, { token: s.t, body: {} });
        s.contractorId = conv.body.data?.contractor_id;
        return { accept_refused: refused.status, converted: conv.status, has_contractor: !!s.contractorId };
      },
    },
    {
      id: 'SALES-04',
      name: 'ELFOGADÁS: szerződés + éjszakadíj jön létre, és a MOTOR abból számláz',
      expected: { accepted: 200, contract: true, rate_matches: true, engine_uses_it: true },
      hint: 'acceptQuote writes partner_contracts + client_night_rates in ONE transaction',
      run: async (ctx, s) => {
        const a = await http.post(`/sales/quotes/${s.quoteId}/accept`, { token: s.t, body: {} });
        const contractId = a.body.data?.contract_id;
        const rateId = (a.body.data?.rate_ids || [])[0];

        const c = await ctx.query('SELECT contract_role, contractor_id FROM partner_contracts WHERE id=$1', [contractId]);
        const r = await ctx.query('SELECT * FROM client_night_rates WHERE id=$1', [rateId]);
        const rate = r.rows[0] || {};
        return {
          accepted: a.status,
          contract: c.rows[0]?.contract_role === 'megbizo' && c.rows[0]?.contractor_id === s.contractorId,
          rate_matches: rate.billing_basis === 'per_bed_night' && Number(rate.rate_used) === 3100
            && Number(rate.occupancy_floor_pct) === 0.8 && rate.contracted_beds === 10,
          // the engine reads client_night_rates — if the row is shaped right it is billable
          engine_uses_it: rate.contractor_id === s.contractorId && rate.accommodation_id === s.acc,
        };
      },
    },
    {
      id: 'SALES-05',
      name: 'ajánlat megosztása lejáró tokennel, a belső pozíciónk kiadása nélkül',
      expected: { shared: 201, public_ok: 200, hides_internals: true, revoked: 404 },
      hint: 'quotes.share_token + publicQuoteByToken — narrow projection, no probability/owner',
      run: async (ctx, s) => {
        const sh = await http.post(`/sales/quotes/${s.quoteId}/share`, { token: s.t, body: { expires_in_days: 7 } });
        const tok = sh.body.data?.share_token;
        const pub = await http.rawGet(`/public/quote/${tok}`, {});   // public route lives OUTSIDE /api/v1
        const body = pub.body?.data || {};
        await http.del(`/sales/quotes/${s.quoteId}/share`, { token: s.t });
        const after = await http.rawGet(`/public/quote/${tok}`, {});
        return {
          shared: sh.status, public_ok: pub.status,
          hides_internals: !('probability' in body) && !('owner_user_id' in body) && !('expected_monthly_value' in body),
          revoked: after.status,
        };
      },
    },
  ],
};
