/**
 * inspectionHtmlPdf — az ellenőrzési dokumentumok HTML → Chrome PDF alapon, 5 nyelven.
 *
 * MIÉRT VÁLTOTTUNK (tulajdonosi döntés, 2026-09-24): a régi `inspectionPDF.service.js`
 * PDFKit-tel, POZICIONÁLTAN rajzol, és 119 beégetett MAGYAR szöveget tartalmaz. Egy
 * ukrán lakó ma magyar nyelvű jegyzőkönyvet írna alá — ami jogilag értéktelen —, egy
 * hosszabb német mondat pedig átcsúszna a szomszéd cellába, és ez a KINYOMTATOTT
 * papíron derülne ki, a lakó kezében.
 *
 * A régi szolgáltatást NEM töröljük: az adatbetöltése (`loadInspectionContext`)
 * továbbra is jó, és amíg a négy dokumentum át nem áll teljesen, a két út párhuzamosan
 * él. Az adatréteg közös — a különbség csak a rajzolás.
 */
const { render, oldal, esc, TEMPLATE_VERSION } = require('./htmlPdf.service');
const signatures = require('./signature.service');
const regi = require('./inspectionPDF.service');
const fs = require('fs');
const path = require('path');

const NYELVEK = ['hu', 'en', 'uk', 'tl', 'de'];

function szotar(nyelv) {
  const biztos = NYELVEK.includes(nyelv) ? nyelv : 'hu';
  return JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'locales', biztos, 'inspectionPdf.json'), 'utf8'));
}

function cimkek(nyelv) { return szotar(nyelv).labels; }

/**
 * A NYERS KULCSOK FORDÍTÁSA. A `grade` és az `inspection_type` adatbázis-érték
 * ('poor', 'monthly') — ha nyersen kerül a lapra, a német jegyzőkönyvön az áll, hogy
 * "Bewertung: poor". Ez nem apróság: a lakó pont a MINŐSÍTÉST nem értené meg, ami a
 * bírság alapja. Ezt a renderelt lapon vettem észre, nem a kódból.
 *
 * Ismeretlen kulcsnál magát a kulcsot adjuk vissza — üres cella helyett legalább
 * látszik, mi volt ott.
 */
function forditKulcs(nyelv, csoport, kulcs) {
  if (!kulcs) return '—';
  return (szotar(nyelv)[csoport] || {})[kulcs] || kulcs;
}

function datum(d) {
  if (!d) return '—';
  const x = new Date(d);
  return `${x.getFullYear()}. ${String(x.getMonth() + 1).padStart(2, '0')}. `
    + `${String(x.getDate()).padStart(2, '0')}.`;
}

function penz(n) {
  if (n === null || n === undefined || n === '') return '—';
  return `${Number(n).toLocaleString('hu-HU')} Ft`;
}

/** Kulcs-érték táblázat. A címke oszlopa fix arányú, az érték tördel. */
function kv(sorok) {
  const t = sorok.filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v ?? '—')}</td></tr>`).join('');
  return `<table class="kv">${t}</table>`;
}

function fejlec(cim, azonosito, alcim) {
  return `<div class="fejlec">
    <div><h1>${esc(cim)}</h1>${alcim ? `<div class="kicsi">${esc(alcim)}</div>` : ''}</div>
    <div class="azon">${esc(azonosito || '')}</div>
  </div>`;
}

function lab(c, nyelv, archivalt) {
  const mikor = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `${archivalt ? `<div class="jog"><b>${esc(c['footer.archived'])}</b></div>` : ''}
  <div class="lab"><span>Housing Solutions Kft.</span>
  <span>${esc(c['footer.generated'])}: ${mikor} · ${esc(nyelv.toUpperCase())}</span></div>`;
}

/** Az aláírás-blokk — ugyanaz a szerkezet, mint a kárjegyzőkönyvön. */
function alairasBlokk(c, alairasok) {
  const egy = (szerep, cimke) => {
    const a = (alairasok || []).find((x) => x.signer_role === szerep);
    let belso = '<div class="vonal"></div>';
    if (a && a.refused_at) {
      belso = `<div class="vonal megtagadva">${esc(c['sig.refused'])}</div>`;
    } else if (a && a.signature_png) {
      belso = `<div class="vonal"><img src="${a.signature_png}" alt=""/></div>`;
    }
    return `<div class="alairas">${belso}<div class="kicsi">${esc(cimke)}</div>
      ${a ? `<div class="kicsi">${esc(a.signer_name)}</div>
             <div class="kicsi">${datum(a.signed_at)}</div>` : ''}</div>`;
  };
  const nyilatkozatok = (alairasok || []).filter((a) => !a.refused_at)
    .map((a) => `<div class="nyil"><b>${esc(a.signer_name)}</b> · ${esc(a.language.toUpperCase())}
      · ${esc(a.content_sha256.slice(0, 16))}…<br/><i>${esc(a.signed_text)}</i></div>`).join('');

  return `<h2>${esc(c['sig.title'])}</h2>
    <div class="alairasok">
      ${egy('resident', c['sig.resident'])}
      ${egy('staff', c['sig.staff'])}
      ${egy('witness', c['sig.witness'])}
    </div>
    ${nyilatkozatok ? `<h2>${esc(c['sig.declared'])}</h2>${nyilatkozatok}` : ''}`;
}

// ─── 1. ELLENŐRZÉSI JEGYZŐKÖNYV (ezt írják alá) ──────────────────────────────

function legalHtml(ctx, nyelv, { alairasok = [], archivalt = false } = {}) {
  const c = cimkek(nyelv);
  const i = ctx.inspection;

  const pontok = `<table><tr>
      <th>${esc(c['score.technical'])}</th><th>${esc(c['score.hygiene'])}</th>
      <th>${esc(c['score.aesthetic'])}</th><th>${esc(c['score.total'])}</th>
      <th>${esc(c['insp.grade'])}</th></tr>
    <tr class="kozep"><td>${esc(i.technical_score ?? '—')}</td>
      <td>${esc(i.hygiene_score ?? '—')}</td><td>${esc(i.aesthetic_score ?? '—')}</td>
      <td><b>${esc(i.total_score ?? '—')}</b></td><td>${esc(forditKulcs(nyelv, 'grades', i.grade))}</td></tr></table>`;

  const hianyok = (ctx.scores || []).filter((s) => s.score !== null && s.score < 3);
  const megallapitasok = hianyok.length === 0
    ? `<p class="kicsi">${esc(c['insp.nofindings'])}</p>`
    : `<table><tr><th>#</th><th>${esc(c['insp.findings'])}</th><th class="jobb">${esc(c['score.total'])}</th></tr>
       ${hianyok.map((s, n) => `<tr><td>${n + 1}</td><td>${esc(s.item_name || s.item_code || '—')}
         ${s.notes ? `<br/><span class="kicsi">${esc(s.notes)}</span>` : ''}</td>
         <td class="jobb">${esc(s.score)}</td></tr>`).join('')}</table>`;

  const feladatok = (ctx.tasks || []).length === 0 ? '' : `<h2>${esc(c['tasks.title'])}</h2>
    <table><tr><th>${esc(c['tasks.title'])}</th><th>${esc(c['tasks.deadline'])}</th>
      <th class="jobb">${esc(c['tasks.cost'])}</th></tr>
    ${ctx.tasks.map((t) => `<tr><td>${esc(t.title || '—')}</td>
      <td>${datum(t.due_date)}</td><td class="jobb">${penz(t.estimated_cost)}</td></tr>`).join('')}</table>`;

  const torzs = `${fejlec(c['doc.legal'], i.inspection_number, i.accommodation_name)}
    ${kv([
      [c['insp.number'], i.inspection_number],
      [c['insp.type'], forditKulcs(nyelv, 'types', i.inspection_type)],
      [c['insp.date'], datum(i.completed_at || i.scheduled_at)],
      [c['insp.inspector'], i.inspector_name],
      [c['insp.accommodation'], i.accommodation_name],
      [c['insp.address'], i.accommodation_address],
    ])}
    <h2>${esc(c['insp.scores'])}</h2>${pontok}
    <h2>${esc(c['insp.findings'])}</h2>${megallapitasok}
    ${i.general_notes ? `<h2>${esc(c['insp.notes'])}</h2>
      <p class="kicsi">${esc(i.general_notes)}</p>` : ''}
    ${feladatok}
    ${alairasBlokk(c, alairasok)}
    <div class="jog"><b>${esc(c['legal.title'])}:</b> ${esc(c['legal.body'])}</div>
    ${lab(c, nyelv, archivalt)}`;

  return oldal(torzs, nyelv, c['doc.legal']);
}

// ─── 2. TULAJDONOSI RIPORT ───────────────────────────────────────────────────

function ownerHtml(ctx, nyelv) {
  const c = cimkek(nyelv);
  const i = ctx.inspection;
  const szobak = (ctx.rooms || []).length === 0 ? '' : `<h2>${esc(c['insp.rooms'])}</h2>
    <table><tr><th>${esc(c['room.number'])}</th><th class="jobb">${esc(c['room.beds'])}</th>
      <th class="jobb">${esc(c['score.hygiene'])}</th><th class="jobb">${esc(c['score.total'])}</th></tr>
    ${ctx.rooms.map((r) => `<tr><td>${esc(r.room_number || '—')}</td>
      <td class="jobb">${esc(r.beds ?? '—')}</td>
      <td class="jobb">${esc(r.hygiene_score ?? '—')}</td>
      <td class="jobb">${esc(r.total_score ?? '—')}</td></tr>`).join('')}</table>`;

  const torzs = `${fejlec(c['doc.owner'], i.inspection_number, i.accommodation_name)}
    ${kv([
      [c['insp.accommodation'], i.accommodation_name],
      [c['insp.address'], i.accommodation_address],
      [c['insp.date'], datum(i.completed_at || i.scheduled_at)],
      [c['insp.grade'], forditKulcs(nyelv, 'grades', i.grade)],
      [c['score.total'], i.total_score],
    ])}
    ${szobak}
    ${lab(c, nyelv, false)}`;
  return oldal(torzs, nyelv, c['doc.owner']);
}

// ─── 3. BELSŐ RÉSZLETES RIPORT ───────────────────────────────────────────────

function internalHtml(ctx, nyelv) {
  const c = cimkek(nyelv);
  const i = ctx.inspection;
  const tetelek = (ctx.scores || []).length === 0 ? '' : `<table>
    <tr><th>${esc(c['insp.findings'])}</th><th class="jobb">${esc(c['score.total'])}</th></tr>
    ${ctx.scores.map((s) => `<tr><td>${esc(s.item_name || s.item_code || '—')}
      ${s.notes ? `<br/><span class="kicsi">${esc(s.notes)}</span>` : ''}</td>
      <td class="jobb">${esc(s.score ?? '—')}</td></tr>`).join('')}</table>`;

  const torzs = `${fejlec(c['doc.internal'], i.inspection_number, i.accommodation_name)}
    ${kv([
      [c['insp.number'], i.inspection_number],
      [c['insp.inspector'], i.inspector_name],
      [c['insp.date'], datum(i.completed_at || i.scheduled_at)],
      [c['insp.grade'], forditKulcs(nyelv, 'grades', i.grade)],
    ])}
    <h2>${esc(c['insp.findings'])}</h2>${tetelek}
    ${i.admin_review_notes ? `<h2>${esc(c['insp.notes'])}</h2>
      <p class="kicsi">${esc(i.admin_review_notes)}</p>` : ''}
    ${lab(c, nyelv, false)}`;
  return oldal(torzs, nyelv, c['doc.internal']);
}

// ─── 4. FIZETÉSI FELSZÓLÍTÁS ─────────────────────────────────────────────────

function demandHtml(comp, nyelv, { alairasok = [] } = {}) {
  const c = cimkek(nyelv);
  const torzs = `${fejlec(c['doc.demand'], comp.compensation_number, comp.resident_name)}
    ${kv([
      [c['sig.resident'], comp.resident_name],
      [c['demand.amount'], penz(comp.amount_assigned ?? comp.amount_gross)],
      [c['demand.deadline'], datum(comp.due_date)],
      [c['demand.reason'], comp.description],
    ])}
    ${alairasBlokk(c, alairasok)}
    <div class="jog"><b>${esc(c['legal.title'])}:</b> ${esc(c['legal.body'])}</div>
    ${lab(c, nyelv, false)}`;
  return oldal(torzs, nyelv, c['doc.demand']);
}

// ─── Nyilvános felület ───────────────────────────────────────────────────────

const SABLONOK = { legal: legalHtml, owner: ownerHtml, internal: internalHtml };

/**
 * @param {'legal'|'owner'|'internal'} fajta
 * @returns {Promise<{pdf: Buffer, html: string, templateVersion: string}>}
 */
async function generateInspection(inspectionId, fajta, nyelv = 'hu', opts = {}) {
  // Az adatbetöltés a régi szolgáltatásból jön — az jó, csak a rajzolás cserélődik.
  // (`_internals`-on keresztül: a régi modul így exportálja a tesztjeinek.)
  const ctx = await regi._internals.loadInspectionContext(inspectionId);
  const alairasok = opts.alairasok
    || await signatures.listFor('inspection', inspectionId);
  const html = SABLONOK[fajta](ctx, nyelv, { ...opts, alairasok });
  return { pdf: render(html, { nev: `insp_${fajta}_${nyelv}` }), html,
           templateVersion: TEMPLATE_VERSION };
}

async function generateDemand(comp, nyelv = 'hu', opts = {}) {
  const html = demandHtml(comp, nyelv, opts);
  return { pdf: render(html, { nev: `demand_${nyelv}` }), html,
           templateVersion: TEMPLATE_VERSION };
}

module.exports = {
  generateInspection, generateDemand,
  // a tördelés-ellenőrzéshez: HTML renderelés nélkül is előállítható
  legalHtml, ownerHtml, internalHtml, demandHtml, cimkek, forditKulcs,
  NYELVEK, TEMPLATE_VERSION,
};
