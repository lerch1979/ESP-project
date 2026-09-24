/**
 * INSPDF — az ellenőrzési dokumentumok HTML-alapú PDF-je, 5 nyelven, és az ALÁÍRT
 * példány sérthetetlensége.
 *
 * KÉT DOLGOT ŐRIZ:
 *   1. mind a négy dokumentum mind az öt nyelven előáll, és a NÉMET (a leghosszabb)
 *      sem csúszik el — ezt eddig senki nem mérte, és a kinyomtatott lapon derült
 *      volna ki, a lakó kezében;
 *   2. egy aláírt jegyzőkönyv letöltése NEM az aktuális adatból renderel. Eddig
 *      minden letöltés újragenerált: egy tavaly aláírt irat ma másképp nézett volna ki.
 */
const h = require('../../../src/services/inspectionHtmlPdf.service');

module.exports = {
  area: 'INSPDF',
  title: 'ellenőrzési PDF · 5 nyelv · német tördelés · az aláírt példány sérthetetlen',

  async setup() {
    // Szándékosan BŐ adat: hosszú nevek és sok tétel — a tördelés így mérhető.
    const ctx = {
      inspection: {
        inspection_number: 'FT-INS-1', inspection_type: 'monthly',
        completed_at: new Date(), inspector_name: 'Kovács-Szabó Krisztiánné dr.',
        accommodation_name: 'Sopronhorpács, Munkásszálló „B" épület — emeleti szárny',
        accommodation_address: '9463 Sopronhorpács, Fő utca 123/B, II. emelet',
        technical_score: 18, hygiene_score: 12, aesthetic_score: 15,
        total_score: 45, grade: 'poor', general_notes: 'Hosszabb megjegyzés a tördeléshez.',
        admin_review_notes: 'Belső észrevétel.',
      },
      scores: Array.from({ length: 6 }, (_, i) => ({
        item_name: `Tétel ${i + 1} — hosszabb megnevezés`, score: i % 3, notes: 'Megjegyzés.',
      })),
      tasks: [{ title: 'Takarítás', due_date: new Date(), estimated_cost: 15000 }],
      rooms: [{ room_number: '101', beds: 4, hygiene_score: 10, total_score: 40 }],
    };
    const comp = { compensation_number: 'FT-KAR-1', resident_name: 'Maria Dela Cruz',
      amount_assigned: 10000, due_date: new Date(), description: 'Rongálás.' };
    return { ctx, comp };
  },

  cases: [
    {
      id: 'INSPDF-01',
      name: '⚠️ mind a 4 dokumentum × 5 nyelv előáll — nincs hiányzó címke',
      expected: { hianyzo: [], darab: 20 },
      hint: 'a régi PDFKit-változat 119 beégetett MAGYAR szöveget tartalmazott',
      run: async (ctx, s) => {
        const hianyzo = [];
        let darab = 0;
        for (const ny of h.NYELVEK) {
          const lapok = {
            legal: h.legalHtml(s.ctx, ny, { alairasok: [] }),
            owner: h.ownerHtml(s.ctx, ny),
            internal: h.internalHtml(s.ctx, ny),
            demand: h.demandHtml(s.comp, ny, { alairasok: [] }),
          };
          for (const [fajta, html] of Object.entries(lapok)) {
            darab++;
            // "undefined" a lapon = hiányzó címke. Ez a leggyakoribb fordítási hiba,
            // és a kinyomtatott papíron derülne ki.
            if (!html || html.includes('undefined')) hianyzo.push(`${fajta}/${ny}`);
          }
        }
        return { hianyzo, darab };
      },
    },
    {
      id: 'INSPDF-02',
      name: '⚠️ a NYERS kulcsok fordulnak — nem "Bewertung: poor" áll a német lapon',
      expected: { nemet_minosites: 'mangelhaft', nemet_tipus: 'monatlich', nincs_nyers: true },
      hint: 'a lakó pont a MINŐSÍTÉST nem értené meg, ami a bírság alapja',
      run: async (ctx, s) => {
        const de = h.legalHtml(s.ctx, 'de', { alairasok: [] });
        return {
          nemet_minosites: h.forditKulcs('de', 'grades', 'poor'),
          nemet_tipus: h.forditKulcs('de', 'types', 'monthly'),
          nincs_nyers: !de.includes('>poor<') && !de.includes('>monthly<'),
        };
      },
    },
    {
      id: 'INSPDF-03',
      name: 'a NÉMET a leghosszabb nyelv, de nincs cellát feszítő szó',
      expected: { leghosszabb: 'de', tulHosszuSzo: [] },
      hint: 'egy 30+ karakteres összetett szó szétfeszítené a táblázatot',
      run: async () => {
        const meret = h.NYELVEK.map((ny) => {
          const c = h.cimkek(ny);
          const ertekek = Object.values(c);
          const szo = ertekek.join(' ').split(/\s+/)
            .reduce((a, b) => (a.length > b.length ? a : b));
          return { ny, hossz: ertekek.join('').length, szo };
        }).sort((a, b) => b.hossz - a.hossz);
        return {
          leghosszabb: meret[0].ny,
          tulHosszuSzo: meret.filter((m) => m.szo.length > 30).map((m) => m.ny),
        };
      },
    },
    {
      id: 'INSPDF-04',
      name: 'az ALÁÍRÁSKÉP és a nyilatkozat rákerül a jegyzőkönyvre',
      expected: { van_kep: true, van_nyilatkozat: true, van_megtagadas: true },
      hint: 'egy aláírás, ami nem látszik a dokumentumon, nem aláírt dokumentum',
      run: async (ctx, s) => {
        const alairasok = [
          { signer_role: 'resident', signer_name: 'Teszt Lakó', language: 'uk',
            signed_at: new Date(), content_sha256: 'b'.repeat(64),
            signature_png: 'data:image/png;base64,iVBORw0KGgo=',
            signed_text: 'Мене ознайомлено з результатом перевірки.' },
          { signer_role: 'witness', signer_name: 'Teszt Tanú', language: 'hu',
            signed_at: new Date(), content_sha256: 'c'.repeat(64),
            refused_at: new Date(), signed_text: 'x' },
        ];
        const html = h.legalHtml(s.ctx, 'hu', { alairasok });
        return {
          van_kep: html.includes('<img src="data:image/png'),
          van_nyilatkozat: html.includes('Мене ознайомлено'),
          van_megtagadas: html.includes(h.cimkek('hu')['sig.refused']),
        };
      },
    },
    {
      id: 'INSPDF-05',
      name: '⚠️ a MEGŐRZÖTT példány jelölve van a lapon',
      expected: { jelolve: true, frissen_nincs: true },
      hint: 'a letöltő tudja meg, hogy az aláíráskori állapotot kapta, nem egy frisset',
      run: async (ctx, s) => {
        const arch = h.legalHtml(s.ctx, 'hu', { alairasok: [], archivalt: true });
        const friss = h.legalHtml(s.ctx, 'hu', { alairasok: [], archivalt: false });
        const cimke = h.cimkek('hu')['footer.archived'];
        return { jelolve: arch.includes(cimke), frissen_nincs: !friss.includes(cimke) };
      },
    },
  ],
};
