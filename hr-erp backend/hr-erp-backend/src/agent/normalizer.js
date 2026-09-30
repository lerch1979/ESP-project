/**
 * normalizer — a nyers bejövő üzenetből egységes, feldolgozható alak.
 *
 * ELTÉRÉS A SPECTŐL, KIMONDVA: a spec `src/agent/normalizer.ts`-t ír. Ez a fájl `.js`.
 * Indok: a backend 100%-ban CommonJS JavaScript, a Dockerfile a forrást MÁSOLJA és
 * `node src/server.js`-t futtat — fordítási lépés nincs. Egy `.ts` fájl élesben el sem
 * indulna. TypeScript bevezetése tsconfigot, ts-jestet és egy build-lépést jelentene a
 * deploy-láncban, ami a futó éles szolgáltatást érinti; ez külön döntés, nem egy
 * 1. heti mellékhatás. A modulhatárok és a tesztelhetőség a spec szerintiek.
 *
 * MIT CSINÁL: nyelvfelismerés, whitespace-normalizálás, és az azonosítók kiemelése
 * (szoba, jegyszám). MIT NEM: nem dönt, nem hív LLM-et, nem ír adatbázisba.
 */

const NYELVEK = ['hu', 'en', 'tl', 'uk'];

/**
 * Nyelvfelismerés kulcsszavakból és írásrendszerből.
 *
 * MIÉRT NEM KÖNYVTÁR: a bejövő üzenetek rövidek ("tumutulo ang tubig"), és a
 * statisztikai nyelvfelismerők 3-5 szó alatt megbízhatatlanok — pont ott, ahol nekünk
 * kellene. A négy nyelv viszont írásrendszerben és gyakori szavakban jól elválik.
 * A bizonytalan eset 'unknown', nem találgatás: a hibás nyelv rosszabb, mint a hiánya,
 * mert rossz nyelvű választ eredményezne.
 */
const NYELVI_JEGYEK = {
  uk: { regex: /[Ѐ-ӿ]/, szavak: [] },   // cirill — egyértelmű
  // KÉT SZINTŰ ÍRÁSJEGY-BIZONYÍTÉK, és ez mérésből jött, nem elméletből:
  //   • `regex`      — ő/ű: a világon gyakorlatilag csak magyar. Erős jel (+3).
  //   • `regexGyenge` — ö/ü/á/é/í/ó/ú: más nyelvekben is van, DE a triage négy nyelve
  //     közül (hu/en/tl/uk) egyikben sem: az angol és a filippínó ékezet nélkül ír, az
  //     ukrán cirill. Ebben a mezőben tehát ez is bizonyíték (+2).
  // MIÉRT KELLETT: a backfill próbafutásán 40/56 üzenet lett `unknown`, köztük a
  // "Csöpög a csap" és a "Mosógép meghibásodott" — félreérthetetlenül magyar, de sem
  // ő/ű, sem a szólistám egyetlen szava nem volt bennük. A rövid bejelentés tipikusan
  // ilyen: két-három tartalmas szó, funkciószó nélkül.
  hu: { regex: /[őűŐŰ]/, regexGyenge: /[öüáéíóúÖÜÁÉÍÓÚ]/,
    szavak: ['nem', 'van', 'lett', 'kérem', 'köszönöm', 'szoba', 'szobában',
      'nincs', 'hogy', 'ez', 'az', 'és', 'de', 'mert', 'már', 'megint', 'kellene'] },
  tl: { regex: null, szavak: ['ang', 'ng', 'sa', 'po', 'ako', 'ito', 'yung', 'wala',
    'may', 'hindi', 'salamat', 'kuwarto'] },
  en: { regex: null, szavak: ['the', 'is', 'and', 'my', 'not', 'please', 'thanks',
    'room', 'there', 'it', 'was'] },
};

function nyelvFelismeres(szoveg) {
  if (!szoveg || !szoveg.trim()) return 'unknown';
  const kisbetus = szoveg.toLowerCase();

  // Írásrendszer először: a cirill nem lehet más nyelv.
  if (NYELVI_JEGYEK.uk.regex.test(szoveg)) return 'uk';

  const szavak = kisbetus.split(/[^\p{L}]+/u).filter(Boolean);
  const pont = { hu: 0, tl: 0, en: 0 };
  for (const [ny, jegy] of Object.entries(NYELVI_JEGYEK)) {
    if (ny === 'uk') continue;
    if (jegy.regex && jegy.regex.test(szoveg)) pont[ny] += 3;
    if (jegy.regexGyenge && jegy.regexGyenge.test(szoveg)) pont[ny] += 2;
    for (const sz of szavak) if (jegy.szavak.includes(sz)) pont[ny] += 1;
  }

  const sorrend = Object.entries(pont).sort((a, b) => b[1] - a[1]);
  const [elso, masodik] = sorrend;
  // HOLTVERSENY VAGY NULLA TALÁLAT → 'unknown'. Nem tippelünk: a rossz nyelvű
  // válasz a lakó számára rosszabb, mint ha megkérdezzük.
  if (elso[1] === 0) return 'unknown';
  if (masodik && elso[1] === masodik[1]) return 'unknown';
  return elso[0];
}

/** Szobaszám kiemelése — "4-es szoba", "room 12", "kuwarto 3", "302". */
function szobaKiemeles(szoveg) {
  if (!szoveg) return null;
  // A SZÓTŐRE illesztünk, nem a szótári alakra. A magyarban a tőhangzó megnyúlik:
  // a "szoba" ragozva "szobában" — amiben a "szoba" betűsor NINCS is benne (szob+á+ban).
  // Ezt a teszt fogta meg: a "A 4-es szobában csöpög" szövegből nem jött ki a szoba.
  const minta = [
    /(?:szob\p{L}*|room|kuwarto|кімнат\p{L}*)\s*[:\-]?\s*(\d{1,4})/iu,
    /(\d{1,4})[.\-\s]*(?:es|as|ös|ös|os)?\s*(?:szob\p{L}*|room|kuwarto|кімнат\p{L}*)/iu,
  ];
  for (const m of minta) {
    const t = szoveg.match(m);
    if (t) return t[1];
  }
  return null;
}

/** Hivatkozott jegyszám — "#25", "INS-2026-1". */
function jegyHivatkozas(szoveg) {
  if (!szoveg) return [];
  return [...new Set((szoveg.match(/#(\d{1,6})/g) || []).map((x) => x.slice(1)))];
}

/**
 * @param {{channel:string, source_id:string, body:string, subject?:string}} nyers
 * @returns normalizált alak — az `inbound_messages` sorhoz és a szabálymotorhoz
 */
function normalize(nyers) {
  if (!nyers || typeof nyers.body !== 'string') {
    throw new Error('normalize: a body kötelező és sztring kell legyen');
  }
  // A whitespace-normalizálás NEM kozmetika: a dedup hash a body-ból képződik, és
  // ugyanaz a mondat két sortöréssel más hasht adna — vagyis a duplikátum átcsúszna.
  const body = nyers.body.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n').trim();
  const subject = (nyers.subject || '').replace(/\s+/g, ' ').trim() || null;

  const egyben = [subject, body].filter(Boolean).join('\n');
  return {
    channel: nyers.channel,
    source_id: String(nyers.source_id),
    subject,
    body,
    lang: nyelvFelismeres(egyben),
    entities: {
      room: szobaKiemeles(egyben),
      ticket_refs: jegyHivatkozas(egyben),
    },
  };
}

module.exports = { normalize, nyelvFelismeres, szobaKiemeles, jegyHivatkozas, NYELVEK };
