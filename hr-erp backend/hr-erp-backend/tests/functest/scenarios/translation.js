/**
 * TRANS — a lakó idegen nyelven ír, az admin magyarul olvassa, és a válasz visszafelé is fordul.
 *
 * AMI EZT KIVÁLTOTTA (2026-09-22)
 * -------------------------------
 * "A fordítás nem működik." A nyomozás végén kiderült, hogy az Anthropic API használati
 * kvótája futott ki: minden hívás 400-at adott, a szolgáltatás pedig — helyesen — az
 * EREDETI szöveget adta vissza, hogy a jegy ne maradjon üresen. A baj nem ez volt, hanem
 * hogy a rendszer ezt SEHOL nem mondta ki: a felületen a le nem fordított idegen szöveg
 * ugyanúgy nézett ki, mintha fordítás történt volna.
 *
 * Ezért ez a terület KÉT dolgot mér, és a második legalább olyan fontos:
 *   • a fordítási út végigmegy (TRANS-01..03),
 *   • és ha NEM megy végig, azt a válasz KIMONDJA (TRANS-04..05).
 *
 * A fordítás maga a CACHE-ből jön a teszt alatt. Ez nem kerülő út: a gyorsítótár az
 * éles működés része, és így a teszt akkor is fut, amikor az API épp nem elérhető —
 * márpedig pont ez volt a hiba napja.
 */
const http = require('../lib/http');
const { query } = require('../../../src/database/connection');
const translation = require('../../../src/services/translation.service');

const EN = 'The key is missing from the door';
const HU = 'Hiányzik a kulcs az ajtóból';
const HU_VALASZ = 'Küldj egy képet a zárról';
const EN_VALASZ = 'Send a photo of the lock';

module.exports = {
  area: 'TRANS',
  title: 'fordítás · lakó idegen nyelven ír · admin magyarul olvassa · a néma bukás kizárva',

  async setup(ctx) {
    const admin = http.tokenFor(ctx.ids.user.superadmin);
    // Lakói fiók: saját nyelve ANGOL. A jegy nyelvét a users.preferred_language adja.
    // VALÓDI lakói fiók kell, nem a superadmin: ha a kettő ugyanaz, a viewer nyelve
    // megegyezik a feladóéval, és a fordítás jogosan nem fut le — a teszt pedig
    // azt mérné, hogy nincs mit fordítani, nem azt, hogy a fordítás működik.
    const lakoId = ctx.ids.user.accommodated_employee;
    await query(`UPDATE users SET preferred_language='en' WHERE id=$1`, [lakoId]);
    const lako = http.tokenFor(lakoId);
    const kat = (await query('SELECT id FROM ticket_categories LIMIT 1')).rows[0];

    // A cache előtöltése mindkét irányban — így a fordítási ÚT mérhető akkor is, ha az
    // API épp nem elérhető (a hiba napján pont ez volt a helyzet).
    for (const [src, tgt, a, b] of [['en', 'hu', EN, HU], ['hu', 'en', HU_VALASZ, EN_VALASZ]]) {
      await query(
        `INSERT INTO translation_cache (source_text, source_lang, target_lang, translated_text, expires_at)
         VALUES ($1,$2,$3,$4, NOW() + interval '1 day')
         ON CONFLICT DO NOTHING`, [a, src, tgt, b]);
    }
    return { admin, lako, lakoId, kat };
  },

  cases: [
    {
      id: 'TRANS-01',
      name: 'a lakó nyelvváltása a jegy nyelvét is meghatározza',
      expected: { created: 201, jegy_nyelve: 'en' },
      hint: 'a jegy a users.preferred_language-et kapja meg létrehozáskor',
      run: async (ctx, s) => {
        const r = await http.post('/tickets', { token: s.lako, body: {
          title: EN, description: EN, category_id: s.kat.id } });
        s.jegy = r.body?.data?.ticket?.id;
        const t = (await query('SELECT language FROM tickets WHERE id=$1', [s.jegy])).rows[0];
        return { created: r.status, jegy_nyelve: t?.language };
      },
    },
    {
      id: 'TRANS-02',
      name: 'az ADMIN magyarul kapja meg az angolul írt jegyet',
      expected: { ok: 200, magyarul: true, eredeti_megvan: true, nem_bukott: true },
      hint: 'ez a funkció lényege — az admin ne idegen nyelven olvassa a hibát',
      run: async (ctx, s) => {
        await query(`UPDATE users SET preferred_language='hu' WHERE id=$1`, [ctx.ids.user.superadmin]);
        const r = await http.get(`/tickets/${s.jegy}`, { token: s.admin });
        const t = r.body?.data?.ticket || r.body?.data;
        return {
          ok: r.status,
          magyarul: t?.title === HU,
          // az eredeti szöveg SEM veszhet el: vita esetén az számít, amit a lakó írt
          eredeti_megvan: t?.original_title === EN,
          nem_bukott: t?._translation_failed === false,
        };
      },
    },
    {
      id: 'TRANS-03',
      name: 'az admin MAGYAR válasza a lakó nyelvén jelenik meg',
      expected: { kuldve: 201, angolul: true },
      // a `translation_unavailable` mező már korábban is létezett az üzenet-úton —
      // a jegy-objektumon viszont nem, azt most pótoltuk (_translation_failed)
      hint: 'a fordításnak mindkét irányban mennie kell',
      run: async (ctx, s) => {
        const k = await http.post(`/tickets/${s.jegy}/messages`, {
          token: s.admin, body: { message: HU_VALASZ } });
        const lista = await http.get(`/tickets/my/${s.jegy}/messages`, { token: s.lako });
        const uzenetek = lista.body?.data?.messages || lista.body?.data || [];
        // A megjelenítendő szöveg a `display_text`; az `original_text` őrzi, amit a
        // feladó valóban írt. A kettő szétválasztása azért fontos, mert vita esetén az
        // eredeti számít, nem a gépi fordítás.
        const uz = uzenetek.find((m) => m.original_text === HU_VALASZ);
        return {
          kuldve: k.status,
          angolul: uz?.display_text === EN_VALASZ && uz?.is_translated === true,
        };
      },
    },
    {
      id: 'TRANS-04',
      name: 'ha a fordítás NEM fut le, a válasz ezt KIMONDJA — nem tesz úgy, mintha megtörtént volna',
      expected: { jelzi_a_bukast: true, szoveg_megmarad: true },
      hint: 'ez a hiba valódi tanulsága: a néma degradálódás fél napnyi nyomozás volt',
      run: async (ctx, s) => {
        // nincs cache-elt fordítás erre a szövegre, és az API-t sem hívjuk (enabled=false)
        const eredetiEnabled = translation.enabled;
        translation.enabled = false;
        const out = await translation.translateObject(
          { language: 'en', title: 'A completely untranslated sentence' }, 'language', 'hu', ['title']);
        translation.enabled = eredetiEnabled;
        return {
          jelzi_a_bukast: out._translation_failed === true,
          szoveg_megmarad: out.title === 'A completely untranslated sentence',
        };
      },
    },
    {
      id: 'TRANS-05',
      name: 'az ÁLLAPOT lekérdezhető: megy-e a fordítás, és ha nem, miért',
      expected: { ok: 200, van_allapot: true, megkulonboztet: true },
      hint: 'a "nincs kulcs" és a "hibát ad" két külön helyzet, más teendővel',
      run: async (ctx, s) => {
        const r = await http.get('/translation/health', { token: s.admin });
        const d = r.body?.data || {};
        return {
          ok: r.status,
          van_allapot: typeof d.enabled === 'boolean' && typeof d.degraded === 'boolean',
          // a `reason` kimondja, MELYIK helyzet áll fenn — vagy null, ha minden rendben
          megkulonboztet: d.reason === null || /kulcs|hibát ad/i.test(d.reason),
        };
      },
    },
    {
      id: 'TRANS-06',
      name: 'a FIGYELMEZTETŐ SÁV adata: kvóta-hibánál a visszaállás időpontja is kiolvasható',
      expected: { degraded: true, van_indok: true, kiolvashato_idopont: true },
      hint: 'a sáv ebből tudja megmondani, mikor áll helyre — enélkül csak annyi, hogy "nem megy"',
      run: async (ctx, s) => {
        const eredeti = translation.lastError;
        // Az éles hibaüzenet szó szerinti alakja — a sáv ebből bányássza az időpontot.
        translation.lastError = {
          at: new Date(), status: 400,
          message: '400 {"type":"error","error":{"type":"invalid_request_error","message":'
            + '"You have reached your specified API usage limits. You will regain access on '
            + '2026-10-01 at 00:00 UTC."}}',
        };
        const h = translation.health();
        translation.lastError = eredeti;
        const mikor = (h.last_error.message.match(/regain access on ([0-9-]+ at [0-9:]+ UTC)/) || [])[1];
        return {
          degraded: h.degraded === true,
          van_indok: typeof h.reason === 'string' && h.reason.length > 0,
          kiolvashato_idopont: mikor === '2026-10-01 at 00:00 UTC',
        };
      },
    },
  ],
};
