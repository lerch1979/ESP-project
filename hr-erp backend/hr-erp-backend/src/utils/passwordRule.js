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

// ─── IDEIGLENES JELSZÓ GENERÁLÁSA ───────────────────────────────────────────
//
// MIÉRT NEM EGYSZERŰ VÉLETLEN KARAKTERLÁNC: ezt a jelszót PAPÍRRA írjuk, és egy lakó
// gépeli be telefonon, idegen anyanyelvvel, esetleg gyenge fényben. Egy "xK9mL2pQ" ott
// nem biztonság, hanem három sikertelen próbálkozás és egy telefonhívás az irodába.
//
// Ezért:
//   • CSAK KISBETŰ — így az O/0 és az l/1/I összetéveszthetősége fel sem merül,
//     és nincs shift-nyomkodás a telefon billentyűzetén;
//   • a 0 és az 1 SZÁMJEGY KIMARAD, marad a 2–9;
//   • az 'i' és az 'o' betűt is elhagyjuk, mert kézírásban az 'i' az '1'-re, az 'o'
//     a '0'-ra hasonlít — a papír a gyenge láncszem, nem a képernyő;
//   • SZÓTAGOKBÓL épül (mássalhangzó + magánhangzó), mert azt egy ember fel tudja
//     olvasni telefonon, és vissza tudja keresni, ha elvesztette a sorát;
//   • kötőjelek tagolják, hogy a 12 karakter ne egy összefolyó massza legyen.
//
// Alak: `toba-ruke-47` — négy szótag két csoportban, plusz két számjegy.
// Kombinációk: 15 mássalhangzó × 3 magánhangzó = 45 szótag, 45^4 × 64 ≈ 262 millió.
// A 10 próba / 15 perc zárolás mellett ez naponta ~960 próbát enged — több százezer év.
const MASSALHANGZO = 'bcdfghjkmnprstv';   // nincs l (1), q, w, x, y, z — ritka/kevert
// CSAK ANGOL ÁBÉCÉ — se ü, se ö, se é. A lakók ukrán, filippínó és német
// billentyűzetet használnak; egy ékezetes betű ott nem elgépelés kérdése, hanem
// azé, hogy a felhasználó megtalálja-e egyáltalán a billentyűt.
const MAGANHANGZO = 'aeu';                // nincs i (1), o (0) és semmi ékezetes
const SZAMJEGY = '23456789';              // nincs 0 és 1

function veletlen(keszlet) {
  // crypto.randomInt: egyenletes eloszlás, modulo-torzítás nélkül. A Math.random()
  // itt nem elég — ez egy hitelesítő adat, nem egy megjelenítési sorrend.
  const { randomInt } = require('crypto');
  return keszlet[randomInt(keszlet.length)];
}

function szotag() {
  return veletlen(MASSALHANGZO) + veletlen(MAGANHANGZO);
}

/**
 * Javasolt ideiglenes jelszó. Az adminisztrátor egy kattintással elfogadja, és papírra
 * írja — így nem lesz "Jelszo123" vagy a szállás neve.
 * @returns {string} pl. "toba-ruke-47"
 */
function generaljIdeiglenest() {
  return `${szotag()}${szotag()}-${szotag()}${szotag()}-${veletlen(SZAMJEGY)}${veletlen(SZAMJEGY)}`;
}

/**
 * Az ADMIN által beállított ideiglenes jelszó szabálya.
 *
 * Szándékosan csak a hossz — a célfelhasználó besorolásától FÜGGETLENÜL. Ha itt a
 * szigorú szabályt kérnénk, az adminisztrátor nem tudna papírra írható, telefonon
 * felolvasható jelszót adni. A valódi szabályt úgyis az első KÖTELEZŐ CSERE
 * érvényesíti, a felhasználó saját besorolása szerint.
 */
function ellenorizIdeiglenes(jelszo) {
  if (!jelszo || typeof jelszo !== 'string') {
    return { valid: false, message: 'A jelszó megadása kötelező.' };
  }
  if (jelszo.length < MIN_HOSSZ) {
    return {
      valid: false,
      message: `Az ideiglenes jelszó legalább ${MIN_HOSSZ} karakter legyen. `
        + 'A „Javaslat" gombbal egy kattintással kaphatsz egy megfelelőt.',
    };
  }
  return { valid: true, message: null };
}

// ─── AZ IDEIGLENES JELSZÓ LEJÁRATA ──────────────────────────────────────────
//
// A papíron kiadott jelszó ne éljen örökké, ha a lakó sosem használja. A papír
// elveszhet, lefényképezhetik, ott maradhat a recepción — és amíg a fiókhoz tartozik,
// bárki beléphet vele. Ha 30 napig nem lépett be, az azt jelenti, hogy vagy nem kapta
// meg, vagy nem kell neki; mindkét esetben helyesebb érvényteleníteni és újat adni.
//
// NEM KELL HOZZÁ ÚJ OSZLOP: a `must_change_password` mondja meg, hogy a jelszó még az
// adminisztrátoré, a `password_changed_at` pedig azt, mikor adta. A kettő együtt
// pontosan az, amit tudni kell — egy külön lejárat-oszlop csak egy harmadik hely lenne,
// ahol elcsúszhat az igazság.
const IDEIGLENES_ELET_NAP = 30;

/**
 * @param {{must_change_password: boolean, password_changed_at: Date|string|null}} user
 * @returns {{lejart: boolean, napok: number}} napok: hány napja adták ki
 */
function ideiglenesLejart(user) {
  if (!user || user.must_change_password !== true) return { lejart: false, napok: 0 };
  if (!user.password_changed_at) return { lejart: false, napok: 0 };
  const kiadva = new Date(user.password_changed_at).getTime();
  if (Number.isNaN(kiadva)) return { lejart: false, napok: 0 };
  const napok = Math.floor((Date.now() - kiadva) / 86400000);
  return { lejart: napok >= IDEIGLENES_ELET_NAP, napok };
}

module.exports = {
  ellenoriz, ellenorizScope, szabalyLeiras, MIN_HOSSZ,
  generaljIdeiglenest, ellenorizIdeiglenes,
  ideiglenesLejart, IDEIGLENES_ELET_NAP,
};
