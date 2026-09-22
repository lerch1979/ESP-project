const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const { getUserPermissions } = require('../middleware/permission');
const { sanitizeString } = require('../utils/validation');
const { isTokenStale } = require('../utils/tokenFreshness');
const passwordRule = require('../utils/passwordRule');
const { scopeFor } = require('../utils/passwordScope');
const passwordPolicy = require('../middleware/passwordPolicy');

/**
 * Felhasználó bejelentkezés
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validáció
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email és jelszó megadása kötelező'
      });
    }

    // Sanitize email input
    const cleanEmail = sanitizeString(email, 255);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen email formátum' });
    }

    // Felhasználó keresése
    const userResult = await query(
      `SELECT u.*, t.name as contractor_name, t.slug as contractor_slug, t.is_active as contractor_active
       FROM users u
       LEFT JOIN contractors t ON u.contractor_id = t.id
       WHERE u.email = $1`,
      [cleanEmail.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Hibás email vagy jelszó'
      });
    }

    const user = userResult.rows[0];

    // Ellenőrzések
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'A fiók inaktív'
      });
    }

    if (!user.contractor_active) {
      return res.status(401).json({
        success: false,
        message: 'A cég fiók inaktív'
      });
    }

    // ── ZÁROLÁS ELLENŐRZÉSE, a jelszó vizsgálata ELŐTT ────────────────────────
    // Fontos a sorrend: ha előbb néznénk a jelszót, egy zárolt fiókon a helyes jelszó
    // "sikertelen belépés"-t adna, és a felhasználó azt hinné, elfelejtette a jelszavát.
    // Azt is meg kell mondani, MEDDIG tart — egy időtartam nélküli "zárolva" ugyanolyan
    // tehetetlenné tesz, mintha végleges lenne, és az irodát fogja hívni.
    const zar = await passwordPolicy.lockStatus(user.id);
    if (zar.locked) {
      logger.warn(`[auth] zárolt fiók belépési kísérlete: ${user.email} (${zar.percek} perc van hátra)`);
      return res.status(423).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        minutes: zar.percek,
        message: `Túl sok sikertelen próbálkozás miatt a fiók ${zar.percek} percre zárolva. `
          + 'Utána magától feloldódik — nem kell segítséget kérned.',
      });
    }

    // Jelszó ellenőrzés
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // A számlálás szerepkör szerint más küszöbhöz mér: a személyzet 5, a lakó 10
      // próbát kap. A lakó papírról, telefonon, idegen nyelven gépel — nála a 10 próba
      // valódi elgépeléseket nyel el.
      const scope = await scopeFor(user.id);
      const proba = await passwordPolicy.recordFailedLogin(user.id, scope);
      if (proba.locked) {
        return res.status(423).json({
          success: false,
          code: 'ACCOUNT_LOCKED',
          minutes: proba.percek,
          message: `Túl sok sikertelen próbálkozás miatt a fiók ${proba.percek} percre zárolva. `
            + 'Utána magától feloldódik — nem kell segítséget kérned.',
        });
      }
      return res.status(401).json({
        success: false,
        // A HÁTRALÉVŐ PRÓBÁK SZÁMÁT NEM ÍRJUK KI. Aki jelszót próbálgat, abból tudná,
        // mikor kell megállnia, hogy elkerülje a zárlatot; a valódi felhasználónak
        // pedig nem segít, mert ő nem próbálgat, hanem elgépelt.
        message: 'Hibás email vagy jelszó'
      });
    }

    // Sikeres belépés → a számláló nullázódik. Enélkül a korábbi elgépelések
    // összegyűlnének, és egy hét múlva két rossz próbálkozás zárolná a fiókot.
    await passwordPolicy.resetFailedLogins(user.id);

    // Szerepkörök lekérése
    const rolesResult = await query(
      `SELECT r.slug, r.name 
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND ur.contractor_id = $2`,
      [user.id, user.contractor_id]
    );

    const roles = rolesResult.rows.map(r => r.slug);
    const roleNames = rolesResult.rows.map(r => r.name);

    // Jogosultságok lekérése
    let permissions = [];
    if (!roles.includes('superadmin')) {
      permissions = await getUserPermissions(user.id);
    }

    // JWT token generálás
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        contractorId: user.contractor_id,
        roles: roles
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Refresh token
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
    );

    // Utolsó bejelentkezés frissítése
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    logger.info('Sikeres bejelentkezés', {
      userId: user.id,
      email: user.email,
      contractor: user.contractor_name
    });

    res.json({
      success: true,
      message: 'Sikeres bejelentkezés',
      data: {
        token,
        refreshToken,
  changeOwnPassword,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          contractor: {
            id: user.contractor_id,
            name: user.contractor_name,
            slug: user.contractor_slug
          },
          roles: roleNames,
          roleSlugs: roles,
          permissions: roles.includes('superadmin') ? ['*'] : permissions,
          preferred_language: user.preferred_language || 'hu',
          // A kliens ebből tudja, hogy a belépés után AZONNAL a jelszócsere-képernyőt
          // kell mutatnia. A tényleges korlát a szerveren van (mustChangePassword),
          // ez csak azért kell, hogy a felhasználó ne 403-akba fusson bele.
          must_change_password: user.must_change_password === true,
          // A rá vonatkozó jelszószabály — a felület ebből írja ki a követelményt,
          // hogy ne mutasson mást, mint amit a szerver elfogad. A besorolást a
          // `scopeFor` adja, NEM egy itt megismételt feltétel: két másolat idővel
          // szétcsúszik, és a felület akkor mást ígérne, mint amit a szerver elfogad.
          password_rule: passwordRule.szabalyLeiras(await scopeFor(user.id))
        }
      }
    });

  } catch (error) {
    logger.error('Bejelentkezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Bejelentkezési hiba történt'
    });
  }
};

/**
 * Saját jelszó megváltoztatása.
 *
 * MIÉRT KELL EZ A VÉGPONT: a `password_changed_at` mostantól MINDEN korábbi tokent
 * érvénytelenít. Ha a felhasználó a saját jelszavát váltja, ez őt magát is kidobná —
 * pedig ő van a gép előtt, és épp most bizonyította a régi jelszavával, hogy ő az.
 * Ezért a váltás UTÁN azonnal kap egy friss token-párt, és a saját munkamenete
 * folytatódik. A TÖBBI eszköz viszont kilép, és pontosan ez a cél.
 *
 * Az adminisztrátori jelszó-visszaállítás (`PUT /users/:id`) szándékosan NEM ad új
 * tokent senkinek: ott minden munkamenet kilép, a felhasználót is beleértve. Ez a
 * különbség a két út között, és ez a lényeg — az admin-visszaállítást épp azért
 * használjuk, mert a fiókhoz valaki más is hozzáférhetett.
 */
const changeOwnPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'A jelenlegi és az új jelszó is szükséges',
      });
    }
    // A szabály EGY helyen van (utils/passwordRule.js). A "ne egyezzen a jelenlegivel"
    // ág a kötelező cserénél a lényeg: ott a jelenlegi jelszó AZ ideiglenes, amit a lakó
    // papíron kapott — ha azt meg lehetne tartani, a kötelező csere nem csinálna semmit.
    // `req.user.id`, NEM `user.id`: a `user` csak lejjebb, az adatbázis-lekérdezés után
    // jön létre. Ugyanarról a személyről van szó — a hívó a saját jelszavát váltja.
    const scope = await scopeFor(req.user.id);
    const szabaly = passwordRule.ellenorizScope(scope, newPassword, { jelenlegi: currentPassword });
    if (!szabaly.valid) {
      return res.status(400).json({ success: false, message: szabaly.message });
    }

    const r = await query(
      'SELECT id, email, password_hash, contractor_id FROM users WHERE id = $1 AND is_active = true',
      [req.user.id]
    );
    if (r.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Érvénytelen felhasználó' });
    }
    const user = r.rows[0];

    // A RÉGI JELSZÓ ELLENŐRZÉSE NEM FORMASÁG: enélkül egy eltulajdonított, még élő
    // munkamenet át tudná írni a jelszót, és kizárná a tulajdonost a saját fiókjából.
    const egyezik = await bcrypt.compare(currentPassword, user.password_hash);
    if (!egyezik) {
      logger.warn(`[auth] sikertelen saját jelszóváltás (rossz jelenlegi jelszó): ${user.email}`);
      return res.status(401).json({ success: false, message: 'A jelenlegi jelszó nem megfelelő' });
    }

    const hash = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    await query(
      `UPDATE users SET password_hash = $1, password_changed_at = CURRENT_TIMESTAMP,
              must_change_password = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
      [hash, user.id]
    );

    const rolesResult = await query(
      'SELECT r.slug FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1',
      [user.id]
    );
    const payload = {
      userId: user.id,
      email: user.email,
      contractorId: user.contractor_id,
      roles: rolesResult.rows.map((x) => x.slug),
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
    const newRefreshToken = jwt.sign(payload, process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' });

    logger.info(`[auth] saját jelszóváltás: ${user.email} — a többi eszköz kilépett`);

    res.json({
      success: true,
      message: 'A jelszó megváltozott. A többi eszközödön újra be kell lépned.',
      data: { token, refreshToken: newRefreshToken },
    });
  } catch (error) {
    logger.error(`[auth] changeOwnPassword hiba: ${error.message}`);
    res.status(500).json({ success: false, message: 'A jelszó megváltoztatása nem sikerült' });
  }
};

/**
 * Token frissítés
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token szükséges'
      });
    }

    // Token ellenőrzés
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

    // Új access token generálás
    const userResult = await query(
      'SELECT id, email, contractor_id, preferred_language, password_changed_at FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Érvénytelen refresh token'
      });
    }

    const user = userResult.rows[0];

    // A FRISSÍTÉST IS ŐRIZNI KELL. Ha csak a belépési tokent néznénk, a jelszóváltás
    // után a RÉGI refresh tokennel (30 nap!) bármikor új, érvényes belépési tokent
    // lehetne váltani — az érvénytelenítés díszlet lenne.
    if (isTokenStale(decoded, user.password_changed_at)) {
      return res.status(401).json({
        success: false,
        message: 'A jelszó megváltozott, ezért ez a belépés érvénytelen. Lépj be újra.',
        code: 'PASSWORD_CHANGED',
      });
    }

    // Szerepkörök lekérése
    const rolesResult = await query(
      'SELECT r.slug FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = $1',
      [user.id]
    );

    const newToken = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        contractorId: user.contractor_id,
        roles: rolesResult.rows.map(r => r.slug)
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      // Surface the saved language so a session-restore via refresh can keep it
      // (the JWT payload intentionally doesn't carry this mutable preference).
      data: { token: newToken, preferred_language: user.preferred_language || 'hu' }
    });

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token lejárt, kérjük jelentkezz be újra'
      });
    }

    // Malformed / tampered / signed-with-wrong-secret tokens should also be 401,
    // not 500 — they're client errors, not server errors.
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError') {
      return res.status(401).json({
        success: false,
        message: 'Érvénytelen refresh token'
      });
    }

    logger.error('Token frissítési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Token frissítési hiba'
    });
  }
};

/**
 * Jelenlegi felhasználó adatai
 */
const me = async (req, res) => {
  try {
    // preferred_language is a runtime-mutable preference that lives in the DB
    // and is NOT carried in the JWT payload, so req.user lacks it. Read it fresh
    // here — otherwise the app's session-restore via /me loses the saved
    // language and the UI falls back to Hungarian ("resets on re-login").
    let preferred_language = 'hu';
    try {
      const r = await query('SELECT preferred_language FROM users WHERE id = $1', [req.user.id]);
      preferred_language = r.rows[0]?.preferred_language || 'hu';
    } catch (e) {
      logger.warn('[auth.me] preferred_language lookup failed:', e.message);
    }
    res.json({
      success: true,
      data: {
        user: {
          ...req.user,
          preferred_language,
          password_rule: passwordRule.szabalyLeiras(await scopeFor(req.user.id)),
        }
      }
    });
  } catch (error) {
    logger.error('Me endpoint hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Hiba történt'
    });
  }
};

/**
 * Kijelentkezés (token invalidálás később implementálható Redis-szel)
 */
const logout = async (req, res) => {
  try {
    // Jelenleg csak sikeres választ küldünk
    // Későbbi továbbfejlesztés: token blacklist Redis-ben
    
    logger.info('Kijelentkezés', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Sikeres kijelentkezés'
    });
  } catch (error) {
    logger.error('Kijelentkezési hiba:', error);
    res.status(500).json({
      success: false,
      message: 'Kijelentkezési hiba'
    });
  }
};

module.exports = {
  login,
  refreshToken,
  changeOwnPassword,
  me,
  logout
};
