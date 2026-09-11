/**
 * Név-egyeztetés ékezet- és kisbetű-függetlenül.
 *
 * Egy helyen, mert több felület is ugyanazt a kérdést teszi fel — „ugyanaz a cég ez a
 * kettő?" —, és ha mindegyik a maga módján normalizál, akkor a beszállító-kereső mást
 * talál, mint az összefésülő. A `scripts/scan-partner-name-leaks.js` ezt a szabályt
 * használta először; innentől ez a közös forrása.
 */

/** "Soproni Vízmű Zrt." → "soproni vizmu zrt." */
const deaccent = (v) => String(v || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

/**
 * Összehasonlító kulcs a DUPLIKÁTUM-kereséshez: a fentieken túl kidobja az
 * írásjeleket és a többes szóközt is, mert a `"RÁBA" Lakásfenntartó` és a
 * `Rába Lakásfenntartó` ugyanaz a cég, csak az idézőjel más.
 */
const nameKey = (v) => deaccent(v)
  .replace(/[".,''`()]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

module.exports = { deaccent, nameKey };
