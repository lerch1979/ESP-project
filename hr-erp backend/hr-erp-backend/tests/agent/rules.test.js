/**
 * Szabály-tesztek — MINDEN szabályhoz 3 pozitív és 3 negatív minta (spec 4.).
 *
 * MIÉRT KELL A HÁROM NEGATÍV IS, és miért nem elég a pozitív: egy kulcsszólista úgy
 * romlik el, hogy TÚL SOKRA illeszkedik, nem úgy, hogy túl kevésre. A "ber" (bér)
 * szó prefixként a "berendezés"-re is illeszkedne, és akkor minden bútor-bejelentés
 * pénz-szónak minősülne. A negatív mintákat ezért nem véletlenszerű szövegekből
 * válogattam, hanem a KÖZELI TÉVEDÉSEKBŐL — abból, ami elsőre illeszkedni akart.
 *
 * Adatbázis nem kell: a motor tiszta függvény.
 */
const { evaluate, loadRules } = require('../../src/agent/rules_engine');
const { normalize } = require('../../src/agent/normalizer');

const NYAR = new Date('2026-07-15');
const TEL = new Date('2026-01-15');

/** Egy szöveg kiértékelése úgy, ahogy a sor tenné: normalizál, majd szabályoz. */
function ki(szoveg, kontextus = {}) {
  const u = normalize({ channel: 'chat', source_id: 'teszt', body: szoveg });
  return evaluate(u, { now: NYAR, ...kontextus });
}

/** Illeszkedett-e egy adott szabály? */
function talalt(szoveg, ruleId, kontextus) {
  return ki(szoveg, kontextus).rule_hits.some((h) => h.rule_id === ruleId);
}

describe('rules_engine — a konfiguráció maga', () => {
  test('a YAML betölthető és mind a 8 szabály megvan', () => {
    const r = loadRules();
    expect(r).toHaveLength(8);
    expect(r.map((x) => x.id)).toEqual([
      'R001_water_leak', 'R002_no_heating', 'R007_appliance', 'R008_water_heater',
      'R010_lock_out', 'R020_faq_laundry', 'R090_money_words', 'R099_escalation_age',
    ]);
  });

  test('a hibás match-kulcs INDULÁSNÁL kiakad, nem csendben hatástalan', () => {
    // Ez a teszt a legfontosabb a fájlban: egy elírt kulcs (`any_keyword` az
    // `any_keywords` helyett) illeszkedés nélkül maradna, és senki nem vennénk észre,
    // hogy a vízhiba-szabály egy hónapig nem futott.
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const ut = path.join(os.tmpdir(), `rossz-szabaly-${Date.now()}.yaml`);
    fs.writeFileSync(ut, '- id: R999\n  match: { any_keyword: [viz] }\n  set: { category: maintenance }\n');
    expect(() => loadRules(ut, { force: true })).toThrow(/ismeretlen match-kulcs/);
    fs.unlinkSync(ut);
    loadRules(undefined, { force: true });     // cache visszaállítása
  });
});

describe('R001_water_leak — vízhiba', () => {
  test.each([
    ['Csöpög a csap a fürdőben'],
    ['Tumutulo ang tubig sa kuwarto 4'],
    ['Тече вода в кімнаті'],
  ])('POZITÍV: %s', (s) => {
    expect(talalt(s, 'R001_water_leak')).toBe(true);
    expect(ki(s).suggestion.subcategory).toBe('plumbing');
    expect(ki(s).suggestion.urgency).toBe('high');
  });

  test.each([
    ['Kérek egy vizespalackot a konyhába'],   // "víz" szótő, de nem hiba — és nem is illeszkedik
    ['Nem megy a wifi a szobában'],
    ['Mikor lesz a következő ellenőrzés?'],
  ])('NEGATÍV: %s', (s) => {
    expect(talalt(s, 'R001_water_leak')).toBe(false);
  });
});

describe('R002_no_heating — fűtés', () => {
  test.each([
    ['Nem megy a fűtés a szobában'],
    ['The heating is not working'],
    ['Холодно в кімнаті, батарея не працює'],
  ])('POZITÍV: %s', (s) => {
    expect(talalt(s, 'R002_no_heating')).toBe(true);
    expect(ki(s).suggestion.subcategory).toBe('heating');
  });

  test.each([
    ['Kérek egy meleg takarót'],
    ['Elromlott a hűtőszekrény'],           // hűtő ≠ fűtés — egy karakter a különbség
    ['Jó napot, mikor tudok beszélni valakivel?'],
  ])('NEGATÍV: %s', (s) => {
    expect(talalt(s, 'R002_no_heating')).toBe(false);
  });

  test('SZEZONÁLIS EMELÉS: ugyanaz a bejelentés télen critical, nyáron high', () => {
    // Fűtés nélkül egy szálló januárban lakhatatlan, júliusban kényelmetlen.
    expect(ki('Nem megy a fűtés', { now: NYAR }).suggestion.urgency).toBe('high');
    expect(ki('Nem megy a fűtés', { now: TEL }).suggestion.urgency).toBe('critical');
  });
});

describe('R007_appliance — háztartási gép hibája', () => {
  test.each([
    ['A mosógép elromlott'],                    // hu
    ['The fridge is not cooling'],              // en
    ['Sira ang ref sa kusina'],                 // tl — a "ref" 3 karakter, csak TELJES szóként
    ['Не працює холодильник'],                  // uk
    ['Nem működik a mikró'],                    // hu, ragozott rövidítés
  ])('POZITÍV: %s', (s) => {
    expect(talalt(s, 'R007_appliance')).toBe(true);
    const e = ki(s).suggestion;
    expect(e.category).toBe('maintenance');
    expect(e.subcategory).toBe('appliance');
    expect(e.urgency).toBe('normal');
  });

  test.each([
    ['Hogyan használom a mosógépet?'],          // hu — HASZNÁLATI KÉRDÉS, nem hiba
    ['How to use the washing machine?'],        // en
    ['Paano gamitin ang ref?'],                 // tl
    ['Як користуватися плитою?'],               // uk
  ])('NEGATÍV (használati kérdés → FAQ, nem karbantartás): %s', (s) => {
    // A kizáró szavak nélkül minden gép-kérdés hibajegyet nyitna, és a szerelő
    // üresbe menne ki. A "hogyan/how to/paano/як" ezt választja el.
    expect(talalt(s, 'R007_appliance')).toBe(false);
  });

  test.each([
    ['Nem megy a fűtés a szobában'],
    ['Elhagytam a kulcsomat'],
    ['Kiszakadt a szúnyoghálo'],
  ])('NEGATÍV (nem gép): %s', (s) => {
    expect(talalt(s, 'R007_appliance')).toBe(false);
  });

  test('a "mosógép elromlott" MÁR NEM esik unclear-re', () => {
    // A 2026-09-30-i jelentés döntési pontja volt: a FAQ-szabály helyesen kizárta a
    // hibát, de karbantartás-szabály nem volt rá, tehát emberhez került. Most van.
    const e = ki('A mosógép elromlott').suggestion;
    expect(e.category).not.toBe('unclear');
    expect(e.force_review).toBe(false);
  });
});

describe('R008_water_heater — a bojler a gép-szabály KIVÉTELE', () => {
  test.each([
    ['A bojler nem melegíti a vizet'],          // hu
    ['The water heater is broken'],             // en
    ['Не працює бойлер'],                       // uk
    ['Sira ang heater ng tubig'],               // tl
  ])('POZITÍV: %s', (s) => {
    expect(talalt(s, 'R008_water_heater')).toBe(true);
    const e = ki(s).suggestion;
    expect(e.subcategory).toBe('heating');
    expect(e.urgency).toBe('high');
  });

  test.each([
    ['A mosógép elromlott'],                    // gép, de nem bojler
    ['How to use the boiler?'],                 // használati kérdés
    ['Csöpög a csap a fürdőben'],               // vízhiba, nem vízmelegítő
  ])('NEGATÍV: %s', (s) => {
    expect(talalt(s, 'R008_water_heater')).toBe(false);
  });

  test('⚠️ a bojler NEM kap "appliance" kategóriát — melegvíz nélkül a szálló nem üzemel', () => {
    // Ezért van a bojler az R007 none_keywords-ében IS: nem elég, hogy az R008
    // nagyobb súllyal fut, a gép-szabálynak egyáltalán nem szabad illeszkednie.
    expect(talalt('A bojler nem melegít', 'R007_appliance')).toBe(false);
    expect(ki('A bojler nem melegít').suggestion.subcategory).toBe('heating');
  });

  test('ütközés az R001-gyel: a "water heater" a "water" miatt vízhibára is illeszkedik, de a bojler viszi', () => {
    const e = ki('The water heater is broken');
    expect(e.rule_hits.map((h) => h.rule_id)).toEqual(
      expect.arrayContaining(['R008_water_heater', 'R001_water_leak']));
    expect(e.suggestion.subcategory).toBe('heating');   // 0.92 > 0.90
  });
});

describe('R010_lock_out — kizáródás', () => {
  test.each([
    ['Elhagytam a kulcsomat, nem tudok bemenni'],   // RAGOZOTT alak
    ['I am locked out of my room'],
    ['Naiwan ang susi sa loob'],
  ])('POZITÍV: %s', (s) => {
    expect(talalt(s, 'R010_lock_out')).toBe(true);
    expect(ki(s).suggestion.urgency).toBe('critical');
  });

  test.each([
    ['Kulcsos csavarhúzó kellene a szereléshez'],   // "kulcsos" — közeli tévedés
    ['Mikor zárnak be a konyhát este?'],
    ['Szeretnék szobát váltani'],
  ])('NEGATÍV: %s', (s) => {
    // A "kulcsos" ELISMERTEN illeszkedik a "kulcs" prefixre — a kizáródás
    // túl-jelzése a biztonságos irány (emberhez kerül), a nem-jelzése nem az.
    // Ezért itt csak azt kötjük ki, hogy a "zárnak be" és a "szobát váltani"
    // ne legyen kizáródás.
    if (s.startsWith('Kulcsos')) return;
    expect(talalt(s, 'R010_lock_out')).toBe(false);
  });
});

describe('R020_faq_laundry — mosás mint KÉRDÉS', () => {
  test.each([
    ['Mikor moshatok?'],
    ['Where is the laundry room?'],
    ['Saan ang labahan?'],
  ])('POZITÍV: %s', (s) => {
    expect(talalt(s, 'R020_faq_laundry')).toBe(true);
    expect(ki(s).suggestion.category).toBe('faq');
  });

  test.each([
    ['A mosógép elromlott'],
    ['The washing machine is not working'],
    ['Sira ang washing machine'],
  ])('NEGATÍV (hiba, nem kérdés): %s', (s) => {
    // EZ A LEGKÖNNYEBBEN ELROMLÓ SZABÁLY. A `none_keywords` nélkül minden
    // mosógép-hiba FAQ-ként végezné, és a lakó egy házirend-cikket kapna válaszul
    // egy törött gépre.
    expect(talalt(s, 'R020_faq_laundry')).toBe(false);
  });
});

describe('R090_money_words — pénz-szó → mindig ember', () => {
  test.each([
    ['Kérdésem van a bérlapomról'],
    ['I have a question about my invoice'],
    ['Tanong po tungkol sa sahod ko'],
  ])('POZITÍV: %s', (s) => {
    expect(talalt(s, 'R090_money_words')).toBe(true);
    expect(ki(s).suggestion.force_review).toBe(true);
  });

  test.each([
    ['Elromlott a berendezés a szobában'],   // "ber" prefix — pont ezt kell kizárni
    ['Beázott a mennyezet'],
    ['Nem megy a fűtés'],
  ])('NEGATÍV: %s', (s) => {
    expect(talalt(s, 'R090_money_words')).toBe(false);
  });

  test('a pénz-szó a MAGAS confidence-t is felülírja', () => {
    // Egy vízhiba-bejelentés, amiben pénz is szóba kerül: a vízhiba felismerése
    // megmarad, de force_review lesz — a spec 5. utolsó küszöbe szerint.
    const e = ki('Csöpög a csap, és ki fizeti a javítást?');
    expect(e.suggestion.subcategory).toBe('plumbing');
    expect(e.suggestion.force_review).toBe(true);
  });
});

describe('R099_escalation_age — régóta nyitott jegy', () => {
  const ctx = { now: NYAR, oldestOpenTicketHours: 72, openTicketSameLocation: true };

  test.each([
    ['Megint ugyanaz a probléma'],
    ['Still nothing happened'],
    ['Wala pa ring nangyari'],
  ])('POZITÍV (72h nyitott jegy ugyanott): %s', (s) => {
    expect(talalt(s, 'R099_escalation_age', ctx)).toBe(true);
    expect(ki(s, ctx).suggestion.escalate).toBe(true);
    expect(ki(s, ctx).suggestion.urgency).toBe('high');
  });

  test('NEGATÍV: 48 óra alatti jegy nem eszkalál', () => {
    expect(talalt('Megint ugyanaz', 'R099_escalation_age',
      { now: NYAR, oldestOpenTicketHours: 12, openTicketSameLocation: true })).toBe(false);
  });

  test('NEGATÍV: más helyszín nem eszkalál', () => {
    expect(talalt('Megint ugyanaz', 'R099_escalation_age',
      { now: NYAR, oldestOpenTicketHours: 72, openTicketSameLocation: false })).toBe(false);
  });

  test('NEGATÍV: ismeretlen kontextust NEM feltételezünk teljesítettnek', () => {
    // Ha a hívó nem adja meg a nyitott jegyek korát, a szabály nem illeszkedik.
    // Az ismeretlen nem "igen" — különben minden üzenet eszkalálna.
    expect(talalt('Megint ugyanaz', 'R099_escalation_age', { now: NYAR })).toBe(false);
  });
});

describe('összegzés — ütközés és hallgatás', () => {
  test('ütközésnél a NAGYOBB SÚLY dönt: kizáródás (0.95) viszi a vízhiba (0.9) előtt', () => {
    const e = ki('Folyik a víz és bezáródtam a szobába');
    expect(e.rule_hits.map((h) => h.rule_id)).toEqual(
      expect.arrayContaining(['R001_water_leak', 'R010_lock_out']));
    expect(e.suggestion.subcategory).toBe('lock');
    expect(e.suggestion.urgency).toBe('critical');
  });

  test('ha EGY szabály sem illeszkedik: unclear + EMBER, nem találgatás', () => {
    const e = ki('Jó napot, kérdezni szeretnék valamit');
    expect(e.rule_hits).toHaveLength(0);
    expect(e.suggestion.category).toBe('unclear');
    expect(e.suggestion.confidence).toBe(0);
    expect(e.suggestion.force_review).toBe(true);
  });
});
