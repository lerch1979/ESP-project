/**
 * passwordRule — a jelszóra vonatkozó EGYETLEN szabály, amit a rendszer tényleg alkalmaz.
 *
 * 2026-09-22, DÖNTÉS UTÁN: a szabály SZEREPKÖR SZERINT ágazik el, és mindkét ág innen
 * indul — nincs két párhuzamos modul.
 *
 *   'szemelyzet' → a passwordPolicy.js szigorú szabálya: 12 karakter, négy
 *        karakterosztály, gyakori jelszavak tiltása. Ők ~300 ember személyes és
 *        pénzügyi adatához férnek hozzá; náluk a szigor ára elenyésző.
 *
 *   'lako'       → 8 karakter, és ne egyezzen a jelenlegivel. Ők a belépésüket PAPÍRON
 *        kapják, telefonon gépelik be, öt nyelven, az első képernyőn. Ott egy 12
 *        karakteres, speciális karaktert követelő szabály nem biztonságot ad, hanem
 *        elakadást — a leggyakoribb kimenetele pedig az, hogy a jelszó felkerül egy
 *        papírra, vagyis pont az, ami ellen az egész védekezés szól.
 *
 * A "ne egyezzen a jelenlegivel" MINDKÉT ágra érvényes, és a kötelező cserénél ez a
 * lényeg: ott a jelenlegi jelszó AZ ideiglenes, amit más is ismer.
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

/**
 * A szerepkörhöz tartozó szabály.
 * @param {'szemelyzet'|'lako'} scope
 * @param {string} ujJelszo
 * @param {{jelenlegi?: string}} opts
 * @returns {{valid: boolean, message: string|null}}
 */
function ellenorizScope(scope, ujJelszo, { jelenlegi } = {}) {
  // A "ne egyezzen a jelenlegivel" ágat MINDIG a mi szabályunk adja — a
  // passwordPolicy.validatePassword nem ismeri a jelenlegi jelszót.
  const alap = ellenoriz(ujJelszo, { jelenlegi });
  if (scope !== 'szemelyzet') return alap;
  if (!alap.valid && /nem egyezhet/i.test(alap.message || '')) return alap;

  // Személyzet: a szigorú szabály. Több hibát is visszaadhat; egy mondatban közöljük,
  // mert egy listát a felhasználó úgysem olvas végig — de MINDET megmondjuk, hogy ne
  // kelljen találgatva újrapróbálkoznia.
  const { validatePassword } = require('../middleware/passwordPolicy');
  const r = validatePassword(ujJelszo);
  if (r.valid) return { valid: true, message: null };
  return { valid: false, message: r.errors.join(' ') };
}

/**
 * A szabály LEÍRÁSA a kliensnek.
 *
 * MIÉRT A SZERVER MONDJA MEG: a két felület eddig fix "legalább 8 karakter" szöveget
 * mutatott — ami a személyzetnek egyszerűen nem igaz, és a felhasználó egy zöldnek
 * látszó jelszóval futna bele egy szerveroldali elutasításba. Ez a fajta ellentmondás
 * rombolja legjobban a bizalmat a felületben. Egy forrás van, és az a szerver.
 */
function szabalyLeiras(scope) {
  if (scope === 'szemelyzet') {
    const { PASSWORD_MIN_LENGTH } = require('../middleware/passwordPolicy');
    return {
      min: PASSWORD_MIN_LENGTH,
      complexity: true,
      hint: `Legalább ${PASSWORD_MIN_LENGTH} karakter, és tartalmazzon nagybetűt, `
        + 'kisbetűt, számot és speciális karaktert.',
    };
  }
  return {
    min: MIN_HOSSZ,
    complexity: false,
    hint: `Legalább ${MIN_HOSSZ} karakter, és nem lehet ugyanaz, mint a jelenlegi.`,
  };
}

module.exports = { ellenoriz, ellenorizScope, szabalyLeiras, MIN_HOSSZ };
