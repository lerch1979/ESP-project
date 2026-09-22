/**
 * passwordScope — melyik jelszószabály vonatkozik erre a felhasználóra.
 *
 * KÉT SZINT VAN, és a HATÁR a LAKÓKNÁL húzódik, nem a pénzügyi jognál (tulajdonosi
 * döntés, 2026-09-22 — a korábbi, pénzügyi jogra épülő besorolás felváltva).
 *
 *   'lako'       — KIZÁRÓLAG az, akinek egyetlen szerepköre `accommodated_employee`.
 *   'szemelyzet' — MINDENKI MÁS. Alapértelmezésben ide esik az is, akinek nincs
 *                  szerepköre, és az is, akit nem tudunk besorolni.
 *
 * MIÉRT ÍGY, ÉS MIÉRT NEM A PÉNZÜGYI JOG ALAPJÁN: a megengedő szabálynak (8 karakter,
 * karakterosztály nélkül, 10 próba) EGYETLEN indoka van, és az a lakók helyzete — a
 * belépésüket PAPÍRON kapják, telefonon gépelik be, öt nyelven, és az első képernyőn
 * találkoznak vele. Akire ez nem áll, arra az indok sem áll.
 *
 * A pénzügyi jogra épülő korábbi határ éppen a legfontosabb eseteket hagyta kint: a
 * karbantartó, a feladat-felelős és a szállásfelelős ~300 ember nevéhez, szállásához és
 * szobaszámához fér hozzá, pénzügyi joga viszont nincs — a szállásfelelősnek pedig
 * SOHA nem is lesz (állandó kikötés), tehát magától sosem került volna át a szigorú ágra.
 *
 * A LISTA FORDÍTVA MŰKÖDIK, MINT ELŐTTE, ÉS EZ SZÁNDÉKOS. Nem azt soroljuk fel, ki
 * szigorú (ott egy új szerepkör csendben kimaradna), hanem azt, ki NEM az. Egy később
 * létrehozott szerepkör így alapértelmezésben a szigorú ágra kerül — a kimaradás iránya
 * a biztonság felé mutat, nem attól el.
 */
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

// Az EGYETLEN megengedő szerepkör. Akinek ezen kívül BÁRMI más szerepköre is van
// (mondjuk lakó ÉS karbantartó egyszerre), az a szigorú ágra kerül: a szigorúbb
// hozzáférés dönt, nem a kedvezőbb.
const LAKOI_SZEREPEK = ['accommodated_employee'];

/**
 * @param {string} userId
 * @returns {Promise<'szemelyzet'|'lako'>}
 */
async function scopeFor(userId) {
  try {
    const r = await query(
      `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1`, [userId]);
    const szerepek = r.rows.map((x) => x.slug);

    // Szerepkör nélküli fiók → szigorú. Nem tudjuk, mit érhet el, tehát nem
    // feltételezünk róla a kedvezőbbet.
    if (szerepek.length === 0) return 'szemelyzet';

    const csakLako = szerepek.every((sz) => LAKOI_SZEREPEK.includes(sz));
    return csakLako ? 'lako' : 'szemelyzet';
  } catch (err) {
    // HIBA ESETÉN A SZIGORÚBB ÁG. Egy elérhetetlen lekérdezés nem lazíthat a szabályon.
    logger.warn(`[passwordScope] nem sikerült besorolni (${userId}): ${err.message} — szigorú ág`);
    return 'szemelyzet';
  }
}

module.exports = { scopeFor, LAKOI_SZEREPEK };
