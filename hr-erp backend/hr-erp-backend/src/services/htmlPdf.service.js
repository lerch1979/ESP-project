/**
 * htmlPdf — HTML → Chrome headless → PDF. EGY renderelő az összes dokumentumhoz.
 *
 * MIÉRT ÁLLTUNK ÁT PDFKit-RŐL (tulajdonosi döntés, 2026-09-24):
 * a PDFKit POZICIONÁLTAN rajzol — minden szöveg egy x/y koordinátára kerül. Amíg a
 * szöveg magyar, a szerző látja, hogy elfér. Egy hosszabb német mondat viszont
 * átcsúszik a szomszéd cellába, és ez NEM a fejlesztő képernyőjén derül ki, hanem a
 * kinyomtatott jegyzőkönyvön, a lakó kezében. Öt nyelven ez nem tartható.
 *
 * A HTML magától tördel: a hosszabb szöveg lejjebb tolja a következő sort, nem ráfolyik.
 * A kárjegyzőkönyv már így működik, öt nyelven — ez ugyanaz a mechanizmus, közösbe emelve.
 *
 * A SABLONVERZIÓ nem díszítés: az archívumba (mig 178) bekerül, hogy egy régi
 * példányról utólag is tudni lehessen, melyik változat rajzolta.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { logger } = require('../utils/logger');

const TEMPLATE_VERSION = '2026-09-24.html-1';
const NYELVEK = ['hu', 'en', 'uk', 'tl', 'de'];

const CHROME_UTAK = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

function chromeUt() {
  for (const p of CHROME_UTAK) if (fs.existsSync(p)) return p;
  return null;
}

/** HTML-escape. Enélkül egy `<` a lakó nevében elrontaná az egész oldalt. */
function esc(t) {
  if (t === null || t === undefined) return '';
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A KÖZÖS STÍLUS. Itt van egy helyen, amit eddig négy generátor koordinátái tartottak.
 *
 * A `table-layout: auto` + `word-break` páros a lényeg: ettől tördel a hosszú német
 * összetett szó ahelyett, hogy szétfeszítené a táblázatot.
 */
const KOZOS_CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, "DejaVu Sans", sans-serif;
         font-size: 9pt; color: #111; margin: 0; line-height: 1.4; }
  h1 { font-size: 14pt; margin: 0 0 2px; }
  h2 { font-size: 10pt; margin: 14px 0 4px; padding-bottom: 2px;
       border-bottom: 1px solid #999; }
  .fejlec { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
  .azon { font-size: 8pt; color: #555; text-align: right; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; table-layout: auto; margin: 4px 0; }
  th, td { border: 1px solid #bbb; padding: 3px 5px; vertical-align: top;
           /* EZ tördeli a hosszú német összetett szavakat cellán belül */
           word-break: break-word; overflow-wrap: anywhere; }
  th { background: #f0f0f0; font-weight: 600; text-align: left; }
  .kv td:first-child { width: 34%; background: #fafafa; font-weight: 600; }
  .jobb { text-align: right; } .kozep { text-align: center; }
  .kicsi { font-size: 7.5pt; color: #444; }
  .jog { font-size: 7.5pt; background: #f7f7f7; border: 1px solid #ddd;
         padding: 6px; margin-top: 8px; }
  .lab { margin-top: 10px; padding-top: 4px; border-top: 1px solid #ccc;
         font-size: 7pt; color: #666; display: flex; justify-content: space-between; }
  .alairasok { display: flex; gap: 10px; margin-top: 8px; }
  .alairas { flex: 1; text-align: center; }
  .vonal { border-bottom: 1px solid #333; height: 30px; margin-bottom: 2px;
           display: flex; align-items: flex-end; justify-content: center; }
  .vonal img { max-height: 30px; max-width: 100%; }
  .vonal.megtagadva { font-size: 7pt; color: #a00; align-items: center; }
  .nyil { font-size: 7.5pt; color: #333; margin: 2px 0; line-height: 1.3; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 8px;
           font-size: 8pt; font-weight: 600; }
`;

/**
 * @param {string} torzs  a <body> tartalma
 * @param {string} nyelv
 * @param {string} cim    a <title>
 */
function oldal(torzs, nyelv = 'hu', cim = '') {
  return `<!DOCTYPE html><html lang="${esc(nyelv)}"><head><meta charset="utf-8">
<title>${esc(cim)}</title><style>${KOZOS_CSS}</style></head><body>
${torzs}
</body></html>`;
}

/**
 * HTML → PDF puffer.
 *
 * A Chrome hiánya ÉRDEMI hiba, nem technikai részlet: enélkül nincs jegyzőkönyv.
 * Ezért beszédes üzenettel dobunk, nem egy néma 500-zal.
 */
function render(html, { nev = 'doc' } = {}) {
  const chrome = chromeUt();
  if (!chrome) {
    throw Object.assign(
      new Error('A PDF előállításához szükséges Chrome nem található a szerveren. '
        + 'A jegyzőkönyv így nem állítható elő — szólj az üzemeltetésnek.'),
      { status: 503 });
  }
  const egyedi = `${nev}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const htmlUt = path.join(os.tmpdir(), `${egyedi}.html`);
  const pdfUt = path.join(os.tmpdir(), `${egyedi}.pdf`);
  try {
    fs.writeFileSync(htmlUt, html, 'utf8');
    // A `--print-to-pdf-no-header` a Chrome 153-ban MÁR NEM elég: a fejlécben ott
    // maradt a dátum és a cím, a láblécben pedig a szerver TELJES FÁJLÚTVONALA
    // (`file:///var/folders/...`) és az oldalszám. Egy jogi dokumentumra rányomtatott
    // belső útvonal nem stílusprobléma: adatot szivárogtat, és komolytalanná teszi az
    // iratot. Ezt a renderelt lapon vettem észre, nem a kódból.
    //
    // A `--no-pdf-header-footer` az új név; mindkettőt megadjuk, mert a régebbi
    // Chrome-ok az elsőt ismerik. Az ismeretlen kapcsolót a Chrome figyelmen kívül hagyja.
    execSync(`"${chrome}" --headless --disable-gpu --no-sandbox `
      + `--print-to-pdf="${pdfUt}" --print-to-pdf-no-header --no-pdf-header-footer `
      + `"file://${htmlUt}"`,
      { timeout: 20000, stdio: 'ignore' });
    return fs.readFileSync(pdfUt);
  } catch (e) {
    logger.error(`[htmlPdf] renderelési hiba (${nev}): ${e.message}`);
    throw e;
  } finally {
    try { fs.unlinkSync(htmlUt); } catch { /* a temp takarítás nem lehet végzetes */ }
    try { fs.unlinkSync(pdfUt); } catch { /* ugyanaz */ }
  }
}

module.exports = { render, oldal, esc, TEMPLATE_VERSION, NYELVEK, KOZOS_CSS };
