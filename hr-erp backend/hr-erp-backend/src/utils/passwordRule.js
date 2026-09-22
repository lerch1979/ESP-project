/**
 * passwordRule — a jelszóra vonatkozó EGYETLEN szabály, amit a rendszer tényleg alkalmaz.
 *
 * MIÉRT ÚJ FÁJL, HOLOTT VAN passwordPolicy.js: mert azt SENKI NEM IMPORTÁLJA. A 12
 * karakteres hossz, a négyféle karakterosztály, a fiókzárolás és a jelszóelévülés mind
 * meg van írva benne, de egyetlen végpont sem hívja — vagyis ma semmilyen jelszószabály
 * nem él. Egy le nem futó szabály rosszabb a hiányzónál: azt hisszük, védve vagyunk.
 *
 * MIÉRT NEM AZT KAPCSOLTAM BE: a lakók a belépésüket PAPÍRON kapják, telefonon gépelik
 * be, öt nyelven, és az első képernyőn találkoznak vele. Egy 12 karakteres, nagybetűt,
 * számot és speciális karaktert követelő szabály ott nem biztonságot ad, hanem
 * elakadást — és a leggyakoribb kimenetele az, hogy a jelszó felkerül egy papírra.
 * A követelmény ezért szándékosan szerény: HOSSZ és NE EGYEZZEN az ideiglenessel.
 *
 * A szigorúbb, személyzeti szintű szabály külön döntés kérdése; ha kell, ide kerül,
 * szerepkör szerint elágazva — nem egy másik, párhuzamos modulba.
 */

// A minimum. Nem "biztonsági optimum", hanem az a határ, ami alatt a jelszó már
// nyilvánvalóan nem véd, de fölötte egy papírról gépelő lakó még boldogul.
const MIN_HOSSZ = 8;

/**
 * @param {string} ujJelszo
 * @param {{jelenlegi?: string}} opts  a jelenlegi (vagy ideiglenes) jelszó, ha ismert
 * @returns {{valid: boolean, message: string|null}}
 */
function ellenoriz(ujJelszo, { jelenlegi } = {}) {
  if (!ujJelszo || typeof ujJelszo !== 'string') {
    return { valid: false, message: 'Az új jelszó megadása kötelező.' };
  }
  if (ujJelszo.length < MIN_HOSSZ) {
    return {
      valid: false,
      message: `Az új jelszó legalább ${MIN_HOSSZ} karakter legyen.`,
    };
  }
  // A LÉNYEG A KÖTELEZŐ CSERÉNÉL: az ideiglenes jelszó ugyanaz, mint a jelenlegi.
  // Enélkül a "kötelező csere" úgy is teljesíthető lenne, hogy a papírra írt jelszó
  // marad érvényben — vagyis a szabály nem csinálna semmit.
  if (jelenlegi && ujJelszo === jelenlegi) {
    return {
      valid: false,
      message: 'Az új jelszó nem egyezhet meg a jelenlegivel.',
    };
  }
  return { valid: true, message: null };
}

module.exports = { ellenoriz, MIN_HOSSZ };
