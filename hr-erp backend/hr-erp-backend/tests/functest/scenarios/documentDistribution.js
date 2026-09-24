/**
 * DOCDIST — házirend/tájékoztató kiküldése a VIDEÓ-MODUL általánosításával.
 *
 * A DÖNTÉS: ne épüljön negyedik kiküldő-mechanizmus. A videó-modulban már megvolt a
 * célzás, a nyelvenkénti kézbesítés, a kötelező jelleg, az emlékeztető és a lakói
 * láthatóság — csak a dokumentum-típus és az aláírás hiányzott.
 *
 * A DOCDIST-03 a legfontosabb: aki NEM kapta meg, az ne tudja aláírni. Egy közösen
 * kiküldött házirendnél ez a legkönnyebben elrontható pont.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const rs = require('../../../src/controllers/residentSignature.controller');

module.exports = {
  area: 'DOCDIST',
  title: 'dokumentum-kiküldés · egy modul · aláírás · csak a címzett',

  async setup(ctx) {
    const t = http.tokenFor(ctx.ids.user.superadmin);
    const emp = (await query(
      `SELECT id, user_id FROM employees WHERE user_id IS NOT NULL
        ORDER BY created_at LIMIT 1`)).rows[0];
    const doc = (await query(
      `INSERT INTO documents (title, document_type, file_path, file_name, uploaded_by)
       VALUES ('FT Házirend','egyeb','/tmp/ft.pdf','ft.pdf',$1) RETURNING id`,
      [ctx.ids.user.superadmin])).rows[0];
    return { t, emp, doc };
  },

  async teardown(ctx, s) {
    await query("DELETE FROM videos WHERE title LIKE 'FT DOCDIST%'");
    if (s?.doc) await query('DELETE FROM documents WHERE id = $1', [s.doc.id]);
  },

  cases: [
    {
      id: 'DOCDIST-01',
      name: 'dokumentum kiküldhető ugyanazon a modulon — nincs negyedik mechanizmus',
      expected: { status: 201, kind: 'document', alairando: true },
      hint: 'a célzás, a nyelv és az emlékeztető a videó-modulból jön, változatlanul',
      run: async (ctx, s) => {
        const r = await http.post('/videos', {
          token: s.t,
          body: {
            title: 'FT DOCDIST házirend', kind: 'document',
            document_id: s.doc.id, requires_signature: true, category: 'ceg_info',
          },
        });
        const v = r.body?.data?.video || r.body?.data;
        return { status: r.status, kind: v?.kind, alairando: v?.requires_signature };
      },
    },
    {
      id: 'DOCDIST-02',
      name: 'DOKUMENTUM fájl nélkül nem küldhető ki — nem lesz kattinthatatlan tétel',
      expected: { status: 400, megmondja: true },
      hint: 'a küldés "sikerülne", a tartalom viszont nem lenne sehol',
      run: async (ctx, s) => {
        const r = await http.post('/videos', {
          token: s.t, body: { title: 'FT DOCDIST üres', kind: 'document' } });
        return { status: r.status, megmondja: /iratot|dokumentum/i.test(r.body?.message || '') };
      },
    },
    {
      id: 'DOCDIST-03',
      name: '⚠️ csak a CÍMZETT írhatja alá a kiküldött dokumentumot',
      expected: { cimzett: true, nem_cimzett: false },
      hint: 'egy közösen kiküldött házirendnél ez a legkönnyebben elrontható pont',
      run: async (ctx, s) => {
        const v = (await query(
          `INSERT INTO videos (title, kind, document_id, requires_signature, created_by)
           VALUES ('FT DOCDIST cél','document',$1,true,$2) RETURNING id`,
          [s.doc.id, ctx.ids.user.superadmin])).rows[0];
        const a = (await query(
          `INSERT INTO video_announcements (video_id, is_mandatory, created_by)
           VALUES ($1,true,$2) RETURNING id`, [v.id, ctx.ids.user.superadmin])).rows[0];
        const rec = (await query(
          `INSERT INTO video_announcement_recipients (announcement_id, user_id, employee_id, language)
           VALUES ($1,$2,$3,'hu') RETURNING id`,
          [a.id, s.emp.user_id, s.emp.id])).rows[0];

        const masikUser = (await query(
          'SELECT id FROM users WHERE id <> $1 LIMIT 1', [s.emp.user_id])).rows[0];
        return {
          cimzett: await rs.ravonatkozik('sent_document', rec.id,
            { id: s.emp.id, user_id: s.emp.user_id }),
          nem_cimzett: await rs.ravonatkozik('sent_document', rec.id,
            { id: s.emp.id, user_id: masikUser.id }),
        };
      },
    },
    {
      id: 'DOCDIST-04',
      name: 'ALÁÍRÁST NEM KÉRŐ dokumentum nem kerül az aláírandók közé',
      expected: { alairando: false },
      hint: 'egy tájékoztatót elég elolvasni — nem minden iratot kell aláírni',
      run: async (ctx, s) => {
        const v = (await query(
          `INSERT INTO videos (title, kind, document_id, requires_signature, created_by)
           VALUES ('FT DOCDIST tájékoztató','document',$1,false,$2) RETURNING id`,
          [s.doc.id, ctx.ids.user.superadmin])).rows[0];
        const a = (await query(
          'INSERT INTO video_announcements (video_id, created_by) VALUES ($1,$2) RETURNING id',
          [v.id, ctx.ids.user.superadmin])).rows[0];
        const rec = (await query(
          `INSERT INTO video_announcement_recipients (announcement_id, user_id, employee_id, language)
           VALUES ($1,$2,$3,'hu') RETURNING id`,
          [a.id, s.emp.user_id, s.emp.id])).rows[0];
        return {
          alairando: await rs.ravonatkozik('sent_document', rec.id,
            { id: s.emp.id, user_id: s.emp.user_id }),
        };
      },
    },
    {
      id: 'DOCDIST-05',
      name: 'a VIDEÓ nem kérhet aláírást — azt megnézni kell, nem aláírni',
      expected: { alairast_ker: false },
      hint: 'a két fogalom külön: kötelező megtekintés ≠ aláírás',
      run: async (ctx, s) => {
        const r = await http.post('/videos', {
          token: s.t,
          body: {
            title: 'FT DOCDIST videó', kind: 'video',
            url: 'https://pelda.hu/v.mp4', requires_signature: true,
          },
        });
        const v = r.body?.data?.video || r.body?.data;
        return { alairast_ker: v?.requires_signature === true };
      },
    },
  ],
};
