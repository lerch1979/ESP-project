/**
 * rules_engine — determinisztikus szabálymotor (spec 4. fejezet).
 *
 * A SZABÁLYOK ELŐSZÖR FUTNAK (spec 2.): amit szabály eldönt, azt nem LLM dönti el.
 * Ez a hét ennek a motornak a hete — LLM-hívás egyáltalán nincs a kódban.
 *
 * MIT AD VISSZA: találatokat (`rule_hits`) és egy belőlük összegzett javaslatot.
 * MIT NEM TESZ: nem ír adatbázisba, nem hajt végre akciót, nem hív külső szolgáltatást.
 * A motor tiszta függvény — ugyanaz a bemenet ugyanazt adja, ezért tesztelhető, és
 * ezért lehet a golden seten visszamérni.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { ekezetNelkul } = require('./dedup');

const ALAP_UTVONAL = path.join(__dirname, '..', '..', 'config', 'triage_rules.yaml');

// A sürgősség RENDEZETT — a "legalább ennyi" (`urgency_min`) és a szezonális emelés
// összehasonlítást igényel, nem egyenlőség-vizsgálatot.
const SURGOSSEG = ['low', 'normal', 'high', 'critical'];
const surgosebb = (a, b) => (SURGOSSEG.indexOf(a) >= SURGOSSEG.indexOf(b) ? a : b);

/**
 * Szöveg előkészítése illesztéshez: ékezet le, kisbetű, minden nem betű/szám egy szóköz,
 * és szóközök a két végén, hogy a szóhatár-vizsgálat indexeléssel elvégezhető legyen.
 */
function illesztheto(szoveg) {
  return ` ${ekezetNelkul(szoveg).toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')} `;
}

/**
 * Egy kulcsszó illeszkedik-e — a MAGYAR RAGOZÁS miatt ez nem egyszerű `includes`.
 *
 * A "kulcs" kulcsszónak illeszkednie KELL a "kulcsom", "kulcsomat", "kulcsaim" szavakra,
 * különben a bejelentések fele átcsúszik. Ezért szó ELEJÉTŐL prefixet illesztünk.
 *
 * DE: a rövid kulcsszó prefixként pusztít. Az ékezet nélküli "ber" (bér) illeszkedne a
 * "berendezés"-re, és egy bútor-bejelentés PÉNZ-szónak minősülne — vagyis kötelező
 * emberi felülvizsgálatot kapna, hamis okból. Ezért:
 *
 *   • 4 karakternél rövidebb kulcsszó  → csak TELJES szó egyezés
 *   • 4 karakter vagy hosszabb         → szó elejétől prefix
 *
 * A többszavas kulcsszó ("no heat", "nem működik", "naiwan ang susi") kifejezésként
 * illeszkedik, szóhatárral az elején.
 */
function kulcsszoTalal(elokeszitett, kulcsszo) {
  const k = illesztheto(kulcsszo).trim();
  if (!k) return false;
  const tobbSzavas = k.includes(' ');
  const hosszu = k.replace(/ /g, '').length >= 4;

  if (tobbSzavas || hosszu) {
    // szóhatár az elején: a keresett szöveg egy szóközzel kezdődjön
    return elokeszitett.includes(` ${k}`);
  }
  return elokeszitett.includes(` ${k} `);
}

function talaltKulcsszavak(elokeszitett, kulcsszavak = []) {
  return kulcsszavak.filter((k) => kulcsszoTalal(elokeszitett, k));
}

/** YAML betöltés + cache. A cache az mtime-ra figyel: szerkesztés után nincs újraindítás. */
let cache = { utvonal: null, mtime: 0, szabalyok: null };

function loadRules(utvonal = ALAP_UTVONAL, { force = false } = {}) {
  const st = fs.statSync(utvonal);
  if (!force && cache.szabalyok && cache.utvonal === utvonal && cache.mtime === st.mtimeMs) {
    return cache.szabalyok;
  }
  // js-yaml 5.x: a `load` NEM instanciál tetszőleges típust (a régi `safeLoad` ebben a
  // verzióban már nem is létezik), tehát külön "safe" változat nem kell.
  const nyers = yaml.load(fs.readFileSync(utvonal, 'utf8'));
  if (!Array.isArray(nyers)) {
    throw new Error(`rules_engine: a ${utvonal} nem szabály-lista`);
  }
  // A HIBÁS SZABÁLY NE CSENDBEN LEGYEN HATÁSTALAN. Egy elírt kulcs (`any_keyword`
  // `any_keywords` helyett) illeszkedés nélkül maradna, és senki nem vennénk észre,
  // hogy a vízhiba-szabály egy hónapig nem futott. Ezért indulásnál kiakad.
  const ismertMatch = new Set(['any_keywords', 'all_keywords', 'none_keywords', 'lang',
    'existing_ticket_open_hours_gt', 'same_location']);
  const idk = new Set();
  for (const sz of nyers) {
    if (!sz || !sz.id) throw new Error('rules_engine: van szabály `id` nélkül');
    if (idk.has(sz.id)) throw new Error(`rules_engine: ismétlődő szabály-id: ${sz.id}`);
    idk.add(sz.id);
    if (!sz.match || typeof sz.match !== 'object') {
      throw new Error(`rules_engine: ${sz.id} — hiányzó \`match\``);
    }
    for (const kulcs of Object.keys(sz.match)) {
      if (!ismertMatch.has(kulcs)) {
        throw new Error(`rules_engine: ${sz.id} — ismeretlen match-kulcs: ${kulcs}`);
      }
    }
    if (!sz.set || typeof sz.set !== 'object') {
      throw new Error(`rules_engine: ${sz.id} — hiányzó \`set\``);
    }
    if (sz.set.urgency && !SURGOSSEG.includes(sz.set.urgency)) {
      throw new Error(`rules_engine: ${sz.id} — érvénytelen urgency: ${sz.set.urgency}`);
    }
  }
  cache = { utvonal, mtime: st.mtimeMs, szabalyok: nyers };
  return nyers;
}

/**
 * Egy szabály kiértékelése.
 * @returns {null|{rule_id:string, weight:number, matched:string[], set:object}}
 */
function szabalyKiertekel(szabaly, elokeszitett, uzenet, kontextus) {
  const m = szabaly.match;
  const talalt = [];

  // NYELVI SZŰRÉS: `lang: any` vagy nincs megadva → minden nyelv. Egyébként lista/érték.
  if (m.lang && m.lang !== 'any') {
    const engedett = Array.isArray(m.lang) ? m.lang : [m.lang];
    if (!engedett.includes(uzenet.lang)) return null;
  }

  // KIZÁRÓ SZAVAK ELŐSZÖR: a "mosógép nem működik" ne FAQ legyen. Ha a kizárás
  // utólag futna, egy sorrend-hiba mosógép-hibákat küldene a FAQ-ra.
  if (m.none_keywords && talaltKulcsszavak(elokeszitett, m.none_keywords).length > 0) {
    return null;
  }

  if (m.all_keywords) {
    const t = talaltKulcsszavak(elokeszitett, m.all_keywords);
    if (t.length !== m.all_keywords.length) return null;
    talalt.push(...t);
  }
  if (m.any_keywords) {
    const t = talaltKulcsszavak(elokeszitett, m.any_keywords);
    if (t.length === 0) return null;
    talalt.push(...t);
  }

  // KONTEXTUS-FELTÉTELEK (R099): nem a szövegből, hanem a rendszer állapotából.
  // Ha a kontextus nem ismert, a szabály NEM illeszkedik — nem feltételezzük.
  if (m.existing_ticket_open_hours_gt !== undefined) {
    const ora = kontextus.oldestOpenTicketHours;
    if (typeof ora !== 'number' || ora <= m.existing_ticket_open_hours_gt) return null;
    if (m.same_location && !kontextus.openTicketSameLocation) return null;
    talalt.push(`nyitott jegy ${Math.round(ora)} órája`);
  } else if (m.same_location && !kontextus.openTicketSameLocation) {
    return null;
  }

  // Volt-e egyáltalán illeszkedési feltétel? Egy üres `match` mindenre illeszkedne.
  if (talalt.length === 0) return null;

  const set = { ...szabaly.set };

  // SZEZONÁLIS EMELÉS: fűtés nélkül egy szálló januárban lakhatatlan, júliusban
  // kényelmetlen. A hónap a kiértékelés idejéből jön, nem a bejelentés szövegéből.
  if (szabaly.season_boost && Array.isArray(szabaly.season_boost.months)) {
    const honap = (kontextus.now || new Date()).getMonth() + 1;
    if (szabaly.season_boost.months.includes(honap) && szabaly.season_boost.urgency) {
      set.urgency = surgosebb(set.urgency || 'low', szabaly.season_boost.urgency);
      talalt.push(`szezonális emelés (${honap}. hónap)`);
    }
  }

  return {
    rule_id: szabaly.id,
    weight: typeof szabaly.weight === 'number' ? szabaly.weight : 0.5,
    matched: talalt,
    set,
  };
}

/**
 * A teljes kiértékelés.
 *
 * @param {{body:string, subject?:string, lang?:string}} uzenet — a normalizer kimenete
 * @param {{now?:Date, oldestOpenTicketHours?:number, openTicketSameLocation?:boolean}} kontextus
 * @returns {{rule_hits:Array, suggestion:object}}
 */
function evaluate(uzenet, kontextus = {}, opts = {}) {
  const szabalyok = opts.rules || loadRules(opts.rulesPath || ALAP_UTVONAL);
  const elokeszitett = illesztheto([uzenet.subject, uzenet.body].filter(Boolean).join(' '));

  const hits = [];
  for (const sz of szabalyok) {
    const h = szabalyKiertekel(sz, elokeszitett, uzenet, kontextus);
    if (h) hits.push(h);
  }
  // A NAGYOBB SÚLY DÖNT az ütköző mezőkről. Ha egy üzenet vízhibát ÉS kizáródást is
  // említ, a kizáródás (0.95) viszi — aki kint áll, az most áll kint.
  hits.sort((a, b) => b.weight - a.weight);

  const s = {
    category: null, subcategory: null, kb_article: null,
    urgency: null, force_review: false, escalate: false,
    confidence: 0, decided_by: [],
  };
  for (const h of hits) {
    let hozzajart = false;
    for (const mezo of ['category', 'subcategory', 'kb_article']) {
      if (h.set[mezo] !== undefined && s[mezo] === null) { s[mezo] = h.set[mezo]; hozzajart = true; }
    }
    if (h.set.urgency) {
      s.urgency = s.urgency === null ? h.set.urgency : surgosebb(s.urgency, h.set.urgency);
      hozzajart = true;
    }
    // `urgency_min` csak EMEL, nem állít be kategóriát — az eszkaláció nem osztályozás.
    if (h.set.urgency_min) s.urgency = surgosebb(s.urgency || 'low', h.set.urgency_min);
    if (h.set.force_review) { s.force_review = true; hozzajart = true; }
    if (h.set.escalate) { s.escalate = true; hozzajart = true; }
    if (hozzajart && h.set.category) s.confidence = Math.max(s.confidence, h.weight);
    if (hozzajart) s.decided_by.push(h.rule_id);
  }

  // NINCS TALÁLAT → `unclear` és EMBER. A szabálymotor hallgatása nem jelenti, hogy
  // a bejelentés lényegtelen — csak azt, hogy erről nincs szabályunk.
  if (s.category === null) {
    s.category = 'unclear';
    s.confidence = 0;
    s.force_review = true;
  }
  if (s.urgency === null) s.urgency = 'normal';

  return { rule_hits: hits, suggestion: s };
}

module.exports = {
  evaluate, loadRules, illesztheto, kulcsszoTalal, talaltKulcsszavak,
  SURGOSSEG, surgosebb, ALAP_UTVONAL,
};
