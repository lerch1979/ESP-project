/**
 * policy gate + idempotencia tesztek.
 *
 * A KAPU AZ, AMI NEMET MOND, ezért a tesztek többsége NEGATÍV: nem azt bizonyítják,
 * hogy az agent tud cselekedni, hanem azt, hogy a felsorolt esetekben NEM tud.
 *
 * Adatbázis nem kell: a `gate()` elfogadja a policy táblát és az üzemmódot
 * paraméterként. Ez nem a teszt kedvéért van így — egy kapu, amit csak élő
 * adatbázissal lehet vizsgálni, a gyakorlatban nem lesz megvizsgálva.
 */
const { gate, idempotencyKey, kanonikus, OROK_L1 } = require('../../src/agent/policy');

/** A mig 183 seedjének megfelelő policy-térkép, kézzel — a teszt ne a DB-től függjön. */
function policyMap(felulir = {}) {
  const alap = {
    ack_resident: { max_autonomy_level: 2, min_confidence: 0.9, enabled: true },
    create_ticket: { max_autonomy_level: 2, min_confidence: 0.9, enabled: true },
    link_duplicate: { max_autonomy_level: 2, min_confidence: 0.95, enabled: true },
    close_ticket: { max_autonomy_level: 1, min_confidence: 0.9, enabled: true },
    terminate: { max_autonomy_level: 1, min_confidence: 0.9, enabled: true },
    faq_reply: { max_autonomy_level: 2, min_confidence: 0.9, enabled: false },
  };
  const m = new Map();
  for (const [k, v] of Object.entries({ ...alap, ...felulir })) m.set(k, { action_type: k, ...v });
  return m;
}

const LIVE = { policy: policyMap(), mode: 'live' };

describe('policy gate — üzemmód', () => {
  test('off → BLOKK, nem "terv"', async () => {
    const r = await gate({ action_type: 'create_ticket', confidence: 1 },
      { policy: policyMap(), mode: 'off' });
    expect(r.decision).toBe('blocked');
  });

  test('shadow → MINDEN terv marad, a magas confidence sem visz át', async () => {
    // Ez a shadow lényege (spec 7.2): mindent kiszámol, semmit nem hajt végre.
    const r = await gate({ action_type: 'create_ticket', confidence: 1 },
      { policy: policyMap(), mode: 'shadow' });
    expect(r.decision).toBe('planned');
    expect(r.reason).toMatch(/shadow/);
  });

  test('live + engedélyezett + magas confidence → végrehajtható', async () => {
    const r = await gate({ action_type: 'create_ticket', confidence: 0.95 }, LIVE);
    expect(r.decision).toBe('execute');
    expect(r.autonomy_level).toBe(2);
  });
});

describe('policy gate — amire NINCS engedély', () => {
  test('ISMERETLEN akciótípus → blokk, nem "valószínűleg rendben"', async () => {
    const r = await gate({ action_type: 'kiutalas', confidence: 1 }, LIVE);
    expect(r.decision).toBe('blocked');
    expect(r.reason).toMatch(/nincs policy sor/);
  });

  test('enabled=false → terv, akkor is, ha minden más stimmel', async () => {
    const r = await gate({ action_type: 'faq_reply', confidence: 1 }, LIVE);
    expect(r.decision).toBe('planned');
    expect(r.reason).toMatch(/enabled=false/);
  });

  test('L1 → EMBER, még 100% confidence-nél is', async () => {
    for (const a of ['close_ticket', 'terminate']) {
      const r = await gate({ action_type: a, confidence: 1 }, LIVE);
      expect(r.decision).toBe('planned');
      expect(r.autonomy_level).toBe(1);
    }
  });

  test('ÖRÖK L1: ha a TÁBLA hibásan L2-t engedne, a kód akkor is L1-re fog', async () => {
    // Két független helyen kell hibázni ahhoz, hogy baj legyen: az adatbázis CHECK-je
    // (mig 183) és ez a lista. Ez a teszt a második réteget bizonyítja — azt az esetet,
    // amikor egy kézi INSERT, visszaállított backup vagy migrációs hiba után a táblában
    // mégis L2 áll.
    const romlott = policyMap({ close_ticket: { max_autonomy_level: 2, min_confidence: 0.5, enabled: true } });
    const r = await gate({ action_type: 'close_ticket', confidence: 1 }, { policy: romlott, mode: 'live' });
    expect(r.decision).toBe('planned');
    expect(r.autonomy_level).toBe(1);
    expect(OROK_L1.has('close_ticket')).toBe(true);
  });

  test('force_review (pénz-szó) felülírja a confidence-t', async () => {
    const r = await gate({ action_type: 'create_ticket', confidence: 1, force_review: true }, LIVE);
    expect(r.decision).toBe('planned');
    expect(r.reason).toMatch(/force_review/);
  });

  test('admin / partner / authority kategória MINDIG emberhez megy', async () => {
    for (const k of ['admin', 'partner', 'authority']) {
      const r = await gate({ action_type: 'create_ticket', confidence: 1, category: k }, LIVE);
      expect(r.decision).toBe('planned');
    }
  });

  test('confidence a küszöb alatt → terv', async () => {
    const r = await gate({ action_type: 'create_ticket', confidence: 0.89 }, LIVE);
    expect(r.decision).toBe('planned');
    expect(r.reason).toMatch(/0\.890 < 0\.900/);
  });

  test('a link_duplicate SZIGORÚBB küszöbe érvényesül: 0.94 nem elég, 0.96 elég', async () => {
    // "Rossz összekötés rosszabb, mint duplikált jegy" — a 0.95 a táblából jön,
    // nem a kódból, és itt azt bizonyítjuk, hogy tényleg onnan.
    expect((await gate({ action_type: 'link_duplicate', confidence: 0.94 }, LIVE)).decision).toBe('planned');
    expect((await gate({ action_type: 'link_duplicate', confidence: 0.96 }, LIVE)).decision).toBe('execute');
  });

  test('confidence megadás NÉLKÜL nem fut le semmi', async () => {
    const r = await gate({ action_type: 'create_ticket' }, LIVE);
    expect(r.decision).toBe('planned');
  });

  test('rule és LLM eltérése → terv', async () => {
    const r = await gate({ action_type: 'create_ticket', confidence: 1, rule_llm_agree: false }, LIVE);
    expect(r.decision).toBe('planned');
    expect(r.reason).toMatch(/nem ért egyet/);
  });
});

describe('idempotencia', () => {
  test('ugyanaz a forrás + akció + payload UGYANAZT a kulcsot adja', () => {
    const a = idempotencyKey('ticket:7', 'create_ticket', { room: '4', urgency: 'high' });
    const b = idempotencyKey('ticket:7', 'create_ticket', { room: '4', urgency: 'high' });
    expect(a).toBe(b);
  });

  test('A KULCSOK SORRENDJE nem számít', () => {
    // Ha számítana, ugyanaz az akció két JSON-sorrenddel két külön kulcsot kapna —
    // vagyis kétszer futna le. A `create_ticket` kétszer két jegyet jelent.
    const a = idempotencyKey('ticket:7', 'create_ticket', { room: '4', urgency: 'high' });
    const b = idempotencyKey('ticket:7', 'create_ticket', { urgency: 'high', room: '4' });
    expect(a).toBe(b);
  });

  test('a beágyazott objektumok sorrendje sem számít', () => {
    const a = idempotencyKey('m:1', 'assign_ticket', { hol: { szoba: '4', szint: 2 } });
    const b = idempotencyKey('m:1', 'assign_ticket', { hol: { szint: 2, szoba: '4' } });
    expect(a).toBe(b);
  });

  test('MÁS forrás, MÁS akció vagy MÁS payload → más kulcs', () => {
    const a = idempotencyKey('ticket:7', 'create_ticket', { room: '4' });
    expect(idempotencyKey('ticket:8', 'create_ticket', { room: '4' })).not.toBe(a);
    expect(idempotencyKey('ticket:7', 'ack_resident', { room: '4' })).not.toBe(a);
    expect(idempotencyKey('ticket:7', 'create_ticket', { room: '5' })).not.toBe(a);
  });

  test('a kulcs olvasható marad — a naplóban látszik, mi volt', () => {
    expect(idempotencyKey('ticket:7', 'create_ticket', {})).toMatch(/^ticket:7:create_ticket:[0-9a-f]{16}$/);
  });

  test('hiányos bemenetre hibát dob', () => {
    expect(() => idempotencyKey(null, 'create_ticket', {})).toThrow();
    expect(() => idempotencyKey('m:1', null, {})).toThrow();
  });

  test('a tömbök sorrendje SZÁMÍT — az nem kulcs-sorrend, hanem tartalom', () => {
    // [1,2] és [2,1] két különböző lista. Ha ezeket egyenlővé tennénk, két
    // különböző akciót kezelnénk ugyanannak.
    expect(kanonikus({ a: [1, 2] })).toEqual({ a: [1, 2] });
    expect(idempotencyKey('m:1', 'x', { a: [1, 2] }))
      .not.toBe(idempotencyKey('m:1', 'x', { a: [2, 1] }));
  });
});
