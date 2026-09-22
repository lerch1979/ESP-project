/**
 * mustChangePassword — az ideiglenes jelszóval belépő felhasználó NEM lát semmit,
 * amíg nem cserél.
 *
 * MIÉRT A SZERVEREN ÉS NEM A KLIENSEN: mert a kliens csak elrejteni tudja a képernyőket,
 * a szerver viszont meg tudja tagadni az adatot. Ha a kapu a mobilappban lenne, az
 * ideiglenes jelszó birtokosa egy böngészőből vagy az admin felületről ugyanúgy
 * lekérhetné a lakók adatait — a jelszó ugyanaz, csak a képernyő más. A kliens oldali
 * terelés kényelmi funkció; a korlát itt van.
 *
 * AMI ÁTMEHET, és miért pont az:
 *   /auth/me              — enélkül a kliens meg sem tudná, hogy cserélnie kell;
 *   /auth/change-password — maga a kijárat;
 *   /auth/logout          — aki mégsem akar cserélni, tudjon kilépni;
 *   /auth/refresh         — nem is ér ide (nincs rajta authenticateToken).
 * Több nem kell. Minden további kivétel egy rés: az ideiglenes jelszó birtokosa pont
 * azokon a végpontokon látna adatot, amiket kivételnek jelölünk.
 */
const { logger } = require('../utils/logger');

// Az útvonal a mount ALATT érkezik (pl. '/me'), ezért a teljes útra is illesztünk.
const ATENGEDETT = [
  '/auth/me',
  '/auth/change-password',
  '/auth/logout',
];

function szabadUt(req) {
  const teljes = req.originalUrl.split('?')[0];
  return ATENGEDETT.some((p) => teljes.endsWith(p));
}

function mustChangePassword(req, res, next) {
  if (!req.user || !req.user.must_change_password) return next();
  if (szabadUt(req)) return next();

  // Naplózzuk, de csak `info` szinten: ez NEM támadás, hanem a szokásos eset — a
  // kliens még nem tudja, hogy cserélni kell, és nekifut egy lekérdezésnek.
  logger.info(`[mustChangePassword] elzárva: ${req.user.email} → ${req.method} ${req.originalUrl}`);

  return res.status(403).json({
    success: false,
    message: 'Ideiglenes jelszóval léptél be. Adj meg új jelszót, mielőtt folytatod.',
    code: 'MUST_CHANGE_PASSWORD',
  });
}

module.exports = { mustChangePassword, ATENGEDETT };
