/**
 * DOCS — szerződéshez és partnerhez csatolt iratok.
 *
 * A cél egy mondatban: ne az irattárból kelljen előkeresni az aláírt szerződést.
 *
 * DOC-05 a legfontosabb: a Szerződések tábla azt mutatja, megvan-e az ALÁÍRT példány, nem
 * azt, hogy van-e bármilyen fájl. Egy melléklet megléte nem helyettesíti a szerződést, és
 * egy "3 csatolmány" felirat pont azt a hiányt fedné el, ami miatt az egész kell.
 *
 * DOC-07 regresszió: a költség-mellékletek útvonala (uploads/expenses/YYYY/MM/<id>/)
 * ÉLES adatot érint — a storage service bővítése nem mozdíthatja el.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const storage = require('../../../src/services/storage.service');

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

/** Helyi dátumrészekből: a pg DATE helyi éjfélként jön, és a toISOString() Budapesten
 *  egy nappal visszatolja — ugyanaz a csapda, ami az import-dátumokat is elrontotta. */
const ymd = (d) => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

module.exports = {
  area: 'DOCS',
  title: 'szerződéshez csatolt iratok · aláírt példány · partner-iratok · storage regresszió',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const c = (await query(`SELECT id FROM contractors WHERE is_active LIMIT 1`)).rows[0];
    const acc = (await query(`SELECT id FROM accommodations WHERE is_active LIMIT 1`)).rows[0];
    const sz = (await query(
      `INSERT INTO partner_contracts (contractor_id, contract_role, title, status, start_date, notice_days)
       VALUES ($1,'szallasado','FT Irat-teszt bérlet','active','2026-01-01',30) RETURNING id`,
      [c.id])).rows[0];
    return { t, contractor: c.id, acc: acc.id, contract: sz.id };
  },

  cases: [
    {
      id: 'DOC-01',
      name: 'irat csatolható a SZERZŐDÉSHEZ, típussal és az irat keltével',
      expected: { created: 201, tipus: 'szerzodes', kelte: '2026-01-05', kotve_a_szerzodeshez: true },
      hint: 'a mig 144 óta megvoltak az oszlopok, de az API sosem töltötte ki őket',
      run: async (ctx, s) => {
        const r = await http.upload('/documents', {
          token: s.t, buffer: PDF, filename: 'berleti-szerzodes.pdf',
          title: 'Bérleti szerződés — eredeti', document_type: 'szerzodes',
          contract_id: s.contract, document_date: '2026-01-05', is_signed_copy: 'false',
        });
        s.doc1 = r.body?.data?.document?.id || r.body?.data?.id;
        const d = (await query(
          `SELECT document_type, document_date, contract_id, is_signed_copy
             FROM documents WHERE id=$1`, [s.doc1])).rows[0];
        return {
          created: r.status, tipus: d?.document_type,
          kelte: ymd(d?.document_date),
          kotve_a_szerzodeshez: d?.contract_id === s.contract,
        };
      },
    },
    {
      id: 'DOC-02',
      name: 'TÖBB irat tartozhat egy szerződéshez — eredeti és módosítás egymás mellett',
      expected: { created: 201, iratok: 2, tipusok: 'modositas,szerzodes' },
      hint: 'a régi partner_contracts.document_id egyetlen fájlt tudott — ezért lett kivezetve',
      run: async (ctx, s) => {
        const r = await http.upload('/documents', {
          token: s.t, buffer: PDF, filename: 'modositas-1.pdf',
          title: '1. sz. módosítás', document_type: 'modositas',
          contract_id: s.contract, document_date: '2026-06-01',
        });
        const d = (await query(
          `SELECT document_type FROM documents
            WHERE contract_id=$1 AND deleted_at IS NULL ORDER BY document_type`, [s.contract])).rows;
        return { created: r.status, iratok: d.length, tipusok: d.map((x) => x.document_type).join(',') };
      },
    },
    {
      id: 'DOC-03',
      name: 'a szerződéshez csatolt irat a PARTNER adatlapján is előjön',
      expected: { partner_orokolve: true },
      hint: 'a szerződés partnerét örököljük, hogy ne kelljen kétszer felvinni ugyanazt',
      run: async (ctx, s) => {
        const d = (await query(
          `SELECT contractor_id FROM documents WHERE id=$1`, [s.doc1])).rows[0];
        return { partner_orokolve: d?.contractor_id === s.contractor };
      },
    },
    {
      id: 'DOC-04',
      name: 'a lista SZŰR a partyra — nem mutatja más partner iratait',
      expected: { ok: 200, csak_ezek: true, masik_partnere: 0 },
      hint: 'a felület eddig is küldte a contractor_id-t, a szerver viszont figyelmen kívül hagyta',
      run: async (ctx, s) => {
        // egy MÁSIK partnerhez tartozó irat
        const masik = (await query(
          `INSERT INTO contractors (name, slug, is_active) VALUES ('FT Másik Partner','ft-masik-partner',true)
           RETURNING id`)).rows[0];
        await http.upload('/documents', {
          token: s.t, buffer: PDF, filename: 'masik.pdf', title: 'Másik partner irata',
          document_type: 'egyeb', contractor_id: masik.id,
        });
        const r = await http.get('/documents', { token: s.t, query: { contract_id: s.contract, limit: 100 } });
        const lista = r.body?.data?.documents || [];
        return {
          ok: r.status,
          csak_ezek: lista.length === 2 && lista.every((x) => x.contract_id === s.contract),
          masik_partnere: lista.filter((x) => x.contractor_id === masik.id).length,
        };
      },
    },
    {
      id: 'DOC-05',
      name: 'a Szerződések tábla az ALÁÍRT példányt jelzi, nem a fájlok számát',
      expected: { ket_irat_de_nincs_alairt: false, jelolt_utan: true, darab: 3 },
      hint: 'egy melléklet megléte nem helyettesíti az aláírt szerződést',
      run: async (ctx, s) => {
        const elotte = (await query(
          `SELECT EXISTS (SELECT 1 FROM documents d WHERE d.contract_id=$1
                            AND d.deleted_at IS NULL AND d.is_signed_copy) AS van`, [s.contract])).rows[0].van;

        await http.upload('/documents', {
          token: s.t, buffer: PDF, filename: 'alairt.pdf', title: 'Aláírt példány',
          document_type: 'szerzodes', contract_id: s.contract, is_signed_copy: 'true',
        });

        const utana = (await query(
          `SELECT EXISTS (SELECT 1 FROM documents d WHERE d.contract_id=$1
                            AND d.deleted_at IS NULL AND d.is_signed_copy) AS van,
                  (SELECT count(*)::int FROM documents d2
                    WHERE d2.contract_id=$1 AND d2.deleted_at IS NULL) AS db`, [s.contract])).rows[0];
        return { ket_irat_de_nincs_alairt: elotte, jelolt_utan: utana.van, darab: utana.db };
      },
    },
    {
      id: 'DOC-06',
      name: 'egy irat pontosan EGY helyhez tartozhat',
      expected: { refused: 400, says_why: true },
      hint: 'szerződéshez ÉS munkavállalóhoz egyszerre kötve nem lehetne megmondani, hol kell keresni',
      run: async (ctx, s) => {
        const emp = (await query(`SELECT id FROM employees LIMIT 1`)).rows[0];
        const r = await http.upload('/documents', {
          token: s.t, buffer: PDF, filename: 'ketto.pdf', title: 'Két helyre',
          document_type: 'egyeb', contract_id: s.contract, employee_id: emp.id,
        });
        return { refused: r.status, says_why: /pontosan egy helyhez/i.test(r.body?.message || '') };
      },
    },
    {
      id: 'DOC-07',
      name: 'REGRESSZIÓ: a költség-mellékletek útvonala változatlan (éles adatot érint)',
      expected: { expenses_ut: true, documents_ut: true, kulon_agak: true },
      hint: 'a storage bővítése nem mozdíthatja el a meglévő uploads/expenses/YYYY/MM/<id>/ elrendezést',
      run: async () => {
        const expId = '11111111-2222-3333-4444-555555555555';
        const e = await storage.save({
          buffer: PDF, mime: 'application/pdf', expense_id: expId,
          billing_month: '2026-09', original_name: 'koltseg.pdf',
        });
        const d = await storage.saveDocument({
          buffer: PDF, mime: 'application/pdf', party_type: 'contract',
          party_id: '66666666-7777-8888-9999-000000000000', original_name: 'irat.pdf',
        });
        await storage.delete(e.path);
        await storage.delete(d.path);
        return {
          expenses_ut: e.path.startsWith(`expenses/2026/09/${expId}/`),
          documents_ut: d.path.startsWith('documents/contract/66666666-7777-8888-9999-000000000000/'),
          kulon_agak: !e.path.includes('documents') && !d.path.includes('expenses'),
        };
      },
    },
  ],
};
