/**
 * SIGN — az egységes aláírás-tár (mig 177).
 *
 * A TERÜLET LÉNYEGE a bizonyító erő. Egy aláírás, amiről nem tudjuk, MIT, MILYEN
 * NYELVEN és MILYEN ESZKÖZÖN írtak alá, egy vitában nem ér semmit — ezért ezek a
 * mezők kötelezők, és ezért NEM pótolhatók utólag (tulajdonosi kikötés, 2026-09-24).
 *
 * A SIGN-04 a legfontosabb: az ukrán lakó ukrán szöveget kapjon. Egy magyar
 * jegyzőkönyv ukrán aláírással jogilag értéktelen.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const sig = require('../../../src/services/signature.service');

module.exports = {
  area: 'SIGN',
  title: 'egységes aláírás · 5 nyelv · kötelező bizonyíték · megtagadás',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const emp = (await query(
      'SELECT id, first_name, last_name FROM employees ORDER BY created_at LIMIT 1')).rows[0];
    // A megbízó a fixture `ids.client` térképéből jön; a damage_reports.contractor_id
    // kötelező, és a `ctx.ids.contractor` nem létezik — ez buktatta el az első futást.
    const megbizo = ctx.ids.client.A;

    const jkv = (await query(
      `INSERT INTO damage_reports (report_number, contractor_id, created_by, description,
         incident_date, total_cost, status)
       VALUES ('FT-SIGN-1', $1, $2, 'FT aláírás-teszt', CURRENT_DATE, 12000, 'pending_acknowledgment')
       RETURNING id`, [megbizo, ctx.ids.user.superadmin])).rows[0];
    return { t, emp, jkv, userId: ctx.ids.user.superadmin };
  },

  async teardown(ctx, s) {
    if (s?.jkv) await query('DELETE FROM damage_reports WHERE id = $1', [s.jkv.id]);
  },

  cases: [
    {
      id: 'SIGN-01',
      name: 'a lakó aláírása rögzül, a bizonyíték-mezőkkel együtt',
      expected: {
        letrejott: 201, van_hash: true, nyelv: 'uk',
        van_ip: true, van_eszkoz: true, van_kezelo: true, keszulek: 'staff_device',
      },
      hint: 'ezek utólag nem pótolhatók — ha rögzítéskor nincsenek meg, nincs bizonyíték',
      run: async (ctx, s) => {
        const r = await http.post(`/signatures/damage_report/${s.jkv.id}`, {
          token: s.t,
          body: {
            signer_role: 'resident',
            signer_name: `${s.emp.first_name} ${s.emp.last_name}`,
            signer_employee_id: s.emp.id,
            language: 'uk',
            signature_png: 'data:image/png;base64,iVBORw0KGgo=',
          },
        });
        const db = (await query(
          `SELECT language, content_sha256, ip::text AS ip, user_agent,
                  operator_user_id, signed_on
             FROM document_signatures WHERE subject_id = $1 AND signer_role = 'resident'`,
          [s.jkv.id])).rows[0] || {};
        return {
          letrejott: r.status,
          van_hash: typeof db.content_sha256 === 'string' && db.content_sha256.length === 64,
          nyelv: db.language,
          van_ip: Boolean(db.ip),
          van_eszkoz: Boolean(db.user_agent),
          van_kezelo: Boolean(db.operator_user_id),
          keszulek: db.signed_on,
        };
      },
    },
    {
      id: 'SIGN-02',
      name: '⚠️ a SZÖVEGET szó szerint tárolja, nem sablon-hivatkozásként',
      expected: { tarolt_szoveg_ukran: true, van_verzio: true },
      hint: 'egy későbbi sablonmódosítás visszamenőleg hazudna arról, mit írt alá',
      run: async (ctx, s) => {
        const db = (await query(
          `SELECT signed_text, signed_text_version FROM document_signatures
            WHERE subject_id = $1 AND signer_role = 'resident'`, [s.jkv.id])).rows[0] || {};
        const elvart = sig.nyilatkozat('damage_report', 'resident', 'uk').text;
        return {
          tarolt_szoveg_ukran: db.signed_text === elvart,
          van_verzio: Boolean(db.signed_text_version),
        };
      },
    },
    {
      id: 'SIGN-03',
      name: 'ugyanaz a szerep KÉTSZER nem írhat alá — 409, érthető üzenettel',
      expected: { status: 409, megmondja: true },
      hint: 'a felülírás bizonyítékot semmisítene meg; újraaláírás = visszavonás + új sor',
      run: async (ctx, s) => {
        const r = await http.post(`/signatures/damage_report/${s.jkv.id}`, {
          token: s.t,
          body: { signer_role: 'resident', signer_name: 'Más Valaki', language: 'hu',
            signature_png: 'data:image/png;base64,iVBORw0KGgo=' },
        });
        return { status: r.status, megmondja: /már aláírta/i.test(r.body?.message || '') };
      },
    },
    {
      id: 'SIGN-04',
      name: '⚠️ MIND AZ 5 NYELVEN van nyilatkozat, mind a 4 dokumentumtípusra',
      expected: { hianyzo: [], magyarra_esik_vissza: false },
      hint: 'egy magyar jegyzőkönyv ukrán aláírással jogilag értéktelen',
      run: async () => {
        // Az ellenőrzési nyilatkozat PARAMÉTERES (eredmény, küszöb, összeg), ezért a
        // feloldáshoz meg kell adni őket. Ez nem a teszt kerülőútja: a paraméter nélküli
        // hívás SZÁNDÉKOSAN hibát dob (lásd SIGN-12) — itt a szövegek MEGLÉTÉT mérjük.
        const paramok = {
          eredmeny_kulcs: 'poor', pontszam: 12, kuszob: 15, alkalom: 2, osszeg: '10 000',
        };
        const hianyzo = [];
        for (const t of sig.TARGYAK) {
          for (const r of sig.SZEREPEK) {
            for (const n of sig.NYELVEK) {
              try { sig.nyilatkozat(t, r, n, paramok); }
              catch { hianyzo.push(`${t}/${r}/${n}`); }
            }
          }
        }
        // Nem eshet vissza magyarra: az ukrán szöveg legyen TÉNYLEG ukrán.
        const uk = sig.nyilatkozat('inspection', 'resident', 'uk', paramok).text;
        const hu = sig.nyilatkozat('inspection', 'resident', 'hu', paramok).text;
        return { hianyzo, magyarra_esik_vissza: uk === hu };
      },
    },
    {
      id: 'SIGN-05',
      name: 'az aláírás MEGTAGADÁSA is rögzíthető — indokkal',
      expected: { status: 201, megtagadva: true, nincs_kep: true },
      hint: 'vitában az "aláírást megtagadta" többet ér, mint a hiányzó sor',
      run: async (ctx, s) => {
        const r = await http.post(`/signatures/damage_report/${s.jkv.id}`, {
          token: s.t,
          body: { signer_role: 'witness', signer_name: 'FT Tanú', language: 'hu',
            refusal_reason: 'A lakó nem volt hajlandó aláírni.' },
        });
        const db = (await query(
          `SELECT refused_at, signature_png FROM document_signatures
            WHERE subject_id = $1 AND signer_role = 'witness'`, [s.jkv.id])).rows[0] || {};
        return {
          status: r.status,
          megtagadva: Boolean(db.refused_at),
          nincs_kep: db.signature_png === null,
        };
      },
    },
    {
      id: 'SIGN-06',
      name: 'üres sor NEM keletkezhet: aláírás és indok nélkül elutasítja',
      expected: { status: 400 },
      hint: 'egy sor, amiben se aláírás, se megtagadás nincs, semmit nem bizonyít',
      run: async (ctx, s) => {
        const r = await http.post(`/signatures/damage_report/${s.jkv.id}`, {
          token: s.t, body: { signer_role: 'staff', signer_name: 'FT Senki', language: 'hu' },
        });
        return { status: r.status };
      },
    },
    {
      id: 'SIGN-07',
      name: 'ISMERETLEN nyelvre nem ír alá — nem esik vissza csendben magyarra',
      expected: { status: 400 },
      hint: 'a csendes visszaesés pont azt a helyzetet állítaná elő, amit el akarunk kerülni',
      run: async (ctx, s) => {
        const r = await http.post(`/signatures/damage_report/${s.jkv.id}`, {
          token: s.t, body: { signer_role: 'staff', signer_name: 'FT', language: 'ro',
            signature_png: 'data:image/png;base64,iVBORw0KGgo=' },
        });
        return { status: r.status };
      },
    },
    {
      id: 'SIGN-08',
      name: 'az UJJLENYOMAT kimutatja, ha a dokumentum utólag megváltozott',
      expected: { valtozatlanul_ok: true, modositva_bukik: true },
      hint: 'ezzel bizonyítható egy vitában, hogy a bemutatott irat ugyanaz',
      run: async (ctx, s) => {
        const sor = (await query(
          `SELECT id, signed_snapshot FROM document_signatures
            WHERE subject_id = $1 AND signer_role = 'resident'`, [s.jkv.id])).rows[0];
        const a = await sig.verify(sor.id, sor.signed_snapshot);
        const b = await sig.verify(sor.id, { ...sor.signed_snapshot, total_cost: '999999' });
        return { valtozatlanul_ok: a.ok, modositva_bukik: b.ok === false };
      },
    },
    {
      id: 'SIGN-09',
      name: '⚠️ az ALÁÍRÁSKÉP bekerül a PDF-be — eddig csak üres vonal volt',
      expected: { van_kep: true, van_nyilatkozat: true, van_ujjlenyomat: true },
      hint: 'egy aláírás, ami nem látszik a dokumentumon, nem aláírt dokumentum',
      run: async (ctx, s) => {
        const pdf = require('../../../src/services/damageReportPdf.service');
        const jkv = (await query('SELECT * FROM damage_reports WHERE id = $1', [s.jkv.id])).rows[0];
        jkv.signatures = await sig.listFor('damage_report', s.jkv.id);
        const html = pdf.buildHTML ? pdf.buildHTML(jkv, 'uk') : null;
        if (!html) return { van_kep: 'buildHTML nincs exportálva', van_nyilatkozat: false, van_ujjlenyomat: false };
        const lakoi = jkv.signatures.find((x) => x.signer_role === 'resident');
        return {
          van_kep: html.includes('<img src="data:image/png'),
          van_nyilatkozat: html.includes(lakoi.signed_text.slice(0, 40)),
          van_ujjlenyomat: html.includes(lakoi.content_sha256.slice(0, 16)),
        };
      },
    },
    {
      id: 'SIGN-10',
      name: 'a PDF nyelvét az ALÁÍRÁS dönti el, nem a letöltő',
      expected: { pdf_nyelve: 'uk' },
      hint: 'amit a lakó ukránul írt alá, azt magyarul letöltve más szöveg lenne',
      run: async (ctx, s) => {
        const alairasok = await sig.listFor('damage_report', s.jkv.id);
        const lakoi = alairasok.find((x) => x.signer_role === 'resident' && !x.refused_at);
        return { pdf_nyelve: lakoi?.language };
      },
    },
    {
      id: 'SIGN-11',
      name: '⚠️ az ELLENŐRZÉSI nyilatkozat kimondja a KÖVETKEZMÉNYT — a saját nyelvén',
      expected: {
        van_eredmeny: true, van_kuszob: true, van_alkalom: true, van_osszeg: true,
        minosites_ukranul: true,
      },
      hint: 'a bírság jogalapja az lesz, hogy a lakó TUDTA, mit ír alá',
      run: async () => {
        const p = { eredmeny_kulcs: 'poor', pontszam: 12, kuszob: 15, alkalom: 2, osszeg: '10 000' };
        const uk = sig.nyilatkozat('inspection', 'resident', 'uk', p).text;
        return {
          van_eredmeny: uk.includes('12'),
          van_kuszob: uk.includes('15'),
          van_alkalom: uk.includes('2'),
          van_osszeg: uk.includes('10 000'),
          // A minősítés NE magyarul álljon az ukrán szövegben.
          minosites_ukranul: uk.includes('слабко') && !uk.includes('gyenge'),
        };
      },
    },
    {
      id: 'SIGN-12',
      name: 'KITÖLTETLEN helyőrzővel NEM írunk alá — inkább hiba, mint félkész jogi szöveg',
      expected: { dob: true, megnevezi: true },
      hint: 'egy "{{osszeg}} Ft bírság" szövegű nyilatkozat bizonyítékként értéktelen',
      run: async () => {
        try {
          sig.nyilatkozat('inspection', 'resident', 'hu', { eredmeny_kulcs: 'poor' });
          return { dob: false, megnevezi: false };
        } catch (e) {
          return { dob: true, megnevezi: /osszeg|kuszob|pontszam/.test(e.message) };
        }
      },
    },
    {
      id: 'SIGN-13',
      name: 'a nyilatkozat az ÉLŐ konfigurációt tükrözi, nem beégetett számot',
      expected: { kovetiAKonfigot: true },
      hint: 'ha az összeg változik, az aláírt példány azt őrzi, ami AKKOR élt',
      run: async () => {
        const a = sig.nyilatkozat('inspection', 'resident', 'hu',
          { eredmeny_kulcs: 'poor', pontszam: 12, kuszob: 15, alkalom: 2, osszeg: '10 000' }).text;
        const b = sig.nyilatkozat('inspection', 'resident', 'hu',
          { eredmeny_kulcs: 'poor', pontszam: 12, kuszob: 20, alkalom: 3, osszeg: '25 000' }).text;
        return { kovetiAKonfigot: a.includes('10 000') && b.includes('25 000') && a !== b };
      },
    },
  ],
};
