/**
 * wait — várakozás egy adatbázis-feltételre, rögzített határidővel.
 *
 * MIÉRT KELL: több végpont SZÁNDÉKOSAN nem várja meg a belső értesítés kiírását.
 * A `inApp.notify(...)` hívások nincsenek await-elve, mert a felhasználó felé adott
 * válasz nem bukhat el azon, hogy a mi értesítésünk hibázik — egy szállásadói
 * visszajelzés vagy egy lakói státuszváltás akkor is rögzüljön, ha az értesítés nem megy.
 *
 * A tesztek viszont eddig AZONNAL olvastak a `notifications` táblából, és versenyt
 * futottak ezzel. Ettől nagyjából minden tizedik futás elbukott — MINDIG MÁSHOL, ami a
 * legnehezebben megfogható hibafajta: a bukás nem a vizsgált viselkedésről szólt,
 * hanem az időzítésről, és emiatt a valódi hibát is elfedte volna.
 *
 * Amit állítani akarunk, az nem az, hogy az értesítés a HTTP-válasz ELŐTT kész,
 * hanem hogy MEGSZÜLETIK. Ez a segéd pontosan ezt méri.
 */

/**
 * Addig futtatja a lekérdezést, amíg igazat nem ad vagy le nem jár az idő.
 * @param {() => Promise<any>} fn      a vizsgált érték lekérdezése
 * @param {(v: any) => boolean} kesz   mikor tekintjük késznek
 * @param {{ms?: number, lepes?: number}} opts
 * @returns az utolsó lekérdezett érték (akkor is, ha lejárt az idő — így a teszt a
 *          TÉNYLEGES értéket jelenti, nem egy időtúllépés-hibát)
 */
async function varj(fn, kesz, { ms = 2000, lepes = 50 } = {}) {
  const hatarido = Date.now() + ms;
  let ertek = await fn();
  while (!kesz(ertek) && Date.now() < hatarido) {
    await new Promise((r) => setTimeout(r, lepes));
    ertek = await fn();
  }
  return ertek;
}

module.exports = { varj };
