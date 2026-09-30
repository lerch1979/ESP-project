/**
 * dedup — ugyanaz az üzenet ne kerüljön be kétszer, és a közeli ismétlés derüljön ki.
 *
 * KÉT KÜLÖN DOLOG, amit nem szabad összekeverni:
 *
 *   1. AZONOS üzenet (`sourceHash`): ugyanaz a bejelentés, kétszer beküldve (hálózati
 *      újrapróbálkozás, dupla kattintás). Ezt az `inbound_messages.source_hash` UNIQUE
 *      indexe utasítja el — fizikailag lehetetlen kétszer bekerülni. A hash itt csak
 *      azt számolja ki, a döntést az adatbázis hozza.
 *
 *   2. HASONLÓ bejelentés (`findDuplicateCandidates`): más szavakkal ugyanaz a hiba,
 *      esetleg más lakótól, ugyanarról a helyről. EZT NEM VONJUK ÖSSZE AUTOMATIKUSAN —
 *      a spec 6. táblázata szerint a `link_duplicate` min. 0.95 confidence-t kíván,
 *      mert a rossz összekötés rosszabb, mint a duplikált jegy: egy tévesen
 *      összekötött bejelentés miatt egy VALÓDI hiba maradhat kezeletlen.
 *
 * Ez a modul tehát JAVASOL, nem dönt. A döntés a policy gate-en és emberen múlik.
 */
const crypto = require('crypto');

/**
 * A fizikai dedup kulcsa.
 *
 * A body-t a normalizer már egységesítette — ha NYERSEN hashelnénk, két sortörésnyi
 * eltérés új sort eredményezne, vagyis a duplikátum átcsúszna a UNIQUE indexen.
 */
function sourceHash({ channel, source_id: sourceId, body }) {
  if (!channel || sourceId === undefined || sourceId === null || typeof body !== 'string') {
    throw new Error('sourceHash: channel, source_id és body kötelező');
  }
  return crypto.createHash('sha256')
    .update(`${channel} ${sourceId} ${body}`)
    .digest('hex');
}

/** Ékezet-eltávolítás: a lakók fele ékezet nélkül ír, a "fűtés" és a "futes" egy szó. */
function ekezetNelkul(szoveg) {
  return String(szoveg || '').normalize('NFD').replace(/\p{Mn}+/gu, '');
}

/**
 * Karakter-hármasok (trigramok) halmaza — ékezet és írásjel nélkül, szóhatárokkal.
 *
 * MIÉRT TRIGRAM ÉS NEM SZÓ: kipróbáltam szó-halmazzal, és a magyar ragozáson elhasalt.
 * A "csap" és a "csapból" szó szinten KÉT KÜLÖN token, így a "Csöpög a csap a 4-esben"
 * és az "a 4-es szobában folyik a víz a csapból" 0.17-et kapott — a valódi duplikátum
 * a zaj alá esett. Trigramon ugyanez 0.43, miközben két KÜLÖNBÖZŐ hiba 0.05 alatt van.
 * (A Postgres `pg_trgm` ugyanezért trigramozik.) Ugyanez kell az ukránhoz és a
 * filippínóhoz is, ahol szintén ragoznak/toldalékolnak.
 */
function trigramok(szoveg) {
  const t = ` ${ekezetNelkul(szoveg).toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')} `;
  const o = new Set();
  for (let i = 0; i + 3 <= t.length; i++) o.add(t.slice(i, i + 3));
  return o;
}

/** Jaccard-hasonlóság a trigram-halmazokon (0..1). */
function similarity(a, b) {
  const A = trigramok(a);
  const B = trigramok(b);
  if (A.size === 0 || B.size === 0) return 0;
  let metszet = 0;
  for (const x of A) if (B.has(x)) metszet++;
  return metszet / (A.size + B.size - metszet);
}

/**
 * Duplikátum-JELÖLTEK keresése a meglévő nyitott jegyek közt.
 *
 * A 0.28-as alapküszöb SZÁNDÉKOSAN alacsony: ez a lista emberhez megy, nem akcióhoz.
 * A mérésen (7 valós párra) a valódi ismétlés 0.29–0.53, a különböző hiba 0.05 alatt —
 * a küszöb a kettő közé esik. A 0.95-ös automatikus összekötési korlát így a
 * gyakorlatban CSAK a szinte szó szerint azonos szövegnél teljesül, vagyis pont ott,
 * ahol az összekötés veszélytelen. Ez nem hiba, hanem a spec szigorának a következménye.
 *
 * @param {{body:string, room?:string|null, accommodationId?:string|null}} uzenet
 * @param {Array<{id:*, title?:string, description?:string, room_number?:string,
 *                accommodation_id?:string, created_at?:Date}>} nyitottJegyek
 * @param {{minSimilarity?:number, maxAgeHours?:number, now?:Date}} opts
 * @returns {Array<{ticketId:*, similarity:number, reasons:string[]}>} csökkenő sorrendben
 */
function findDuplicateCandidates(uzenet, nyitottJegyek = [], opts = {}) {
  const minSim = opts.minSimilarity ?? 0.28;
  const maxOra = opts.maxAgeHours ?? 72;
  const most = opts.now ? opts.now.getTime() : Date.now();

  const talalatok = [];
  for (const jegy of nyitottJegyek) {
    // IDŐABLAK: egy fél éve lezáratlan jegy nem teszi duplikátummá a mai bejelentést.
    // A régi jegy lehet, hogy pont azért van nyitva, mert senki nem foglalkozott vele.
    if (jegy.created_at) {
      const oraja = (most - new Date(jegy.created_at).getTime()) / 3600000;
      if (oraja > maxOra) continue;
    }
    const jegySzoveg = [jegy.title, jegy.description].filter(Boolean).join(' ');
    const sim = similarity(uzenet.body, jegySzoveg);
    if (sim < minSim) continue;

    const okok = [`szöveg-hasonlóság ${sim.toFixed(2)}`];
    // A HELY EGYEZÉSE ERŐSÍT, de önmagában NEM elég, ezért csak a szöveg-küszöb
    // felett adunk rá pontot: egy szálláson egyszerre lehet csöpögő csap és rossz
    // fűtés — a hely azonos, a hiba nem.
    let bonusz = 0;
    if (uzenet.room && jegy.room_number && String(uzenet.room) === String(jegy.room_number)) {
      bonusz += 0.15;
      okok.push('azonos szoba');
    }
    if (uzenet.accommodationId && jegy.accommodation_id
        && String(uzenet.accommodationId) === String(jegy.accommodation_id)) {
      bonusz += 0.05;
      okok.push('azonos szállás');
    }
    talalatok.push({
      ticketId: jegy.id,
      similarity: Number(Math.min(1, sim + bonusz).toFixed(3)),
      reasons: okok,
    });
  }
  return talalatok.sort((a, b) => b.similarity - a.similarity);
}

module.exports = {
  sourceHash, similarity, findDuplicateCandidates, trigramok, ekezetNelkul,
};
