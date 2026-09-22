/**
 * tokenFreshness — egyetlen hely dönti el, hogy egy token TÚL RÉGI-e a felhasználó
 * jelszavához képest.
 *
 * MIÉRT VAN KÜLÖN FÁJLBAN: a szabályt két helyen kell alkalmazni — a belépési token
 * ellenőrzésénél (`authenticateToken`) és a frissítésnél (`/auth/refresh`). Ha csak az
 * egyiket védenénk, a jelszóváltás után a régi refresh tokennel bárki új, érvényes
 * belépési tokent válthatna, és az egész érvénytelenítés díszlet lenne. Két másolat
 * pedig idővel szétcsúszik — ezért egy függvény, két hívó.
 *
 * A HATÁRESET, AMI MIATT A TŰRÉS KELL: a JWT `iat` mezője MÁSODPERC pontosságú és lefelé
 * kerekít, a `password_changed_at` viszont ezredmásodperc pontosságú. Aki a saját
 * jelszavát váltja, annak ugyanabban a másodpercben adunk új tokent — tűrés nélkül a
 * frissen kiadott tokent dobnánk el, vagyis pont azt a munkamenetet, amit meg akarunk
 * tartani. Egy másodperc tűrés ezt oldja fel, és nem nyit rést: a támadó tokenje nem
 * egy másodperccel korábbi, hanem órákkal-napokkal.
 */

// A kerekítés miatti egy másodperc. Ne told feljebb: ez nem "biztonsági ráhagyás",
// hanem az `iat` felbontásának pontos kiegyenlítése.
const TURES_MP = 1;

/**
 * @param {{iat?: number}} decoded  a dekódolt JWT (iat másodpercben)
 * @param {Date|string|null} passwordChangedAt  users.password_changed_at
 * @returns {boolean} igaz, ha a token a jelszóváltás ELŐTT kelt, tehát érvénytelen
 */
function isTokenStale(decoded, passwordChangedAt) {
  // Nincs jelszóváltás rögzítve → nincs mihez képest réginek lennie.
  if (!passwordChangedAt) return false;
  // `iat` nélküli token régi kiadás; nem tudjuk megítélni, ezért nem dobjuk el.
  if (!decoded || typeof decoded.iat !== 'number') return false;

  const valtasMp = Math.floor(new Date(passwordChangedAt).getTime() / 1000);
  if (Number.isNaN(valtasMp)) return false;

  return decoded.iat + TURES_MP < valtasMp;
}

module.exports = { isTokenStale, TURES_MP };
