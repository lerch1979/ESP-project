/**
 * dedup-tesztek.
 *
 * A KÉT DOLGOT KÜLÖN TESZTELJÜK, mert két külön garancia:
 *   • `sourceHash` — determinisztikus, és az adatbázis UNIQUE indexével együtt zárja
 *     ki a fizikai duplikátumot,
 *   • `findDuplicateCandidates` — JAVASOL. Külön teszt őrzi, hogy a hely egyezése
 *     önmagában ne legyen elég, és hogy a régi jegy ne szívja magába a mai bejelentést.
 */
const { sourceHash, similarity, findDuplicateCandidates } = require('../../src/agent/dedup');
const { normalize } = require('../../src/agent/normalizer');

describe('sourceHash — a fizikai dedup kulcsa', () => {
  const alap = { channel: 'chat', source_id: '42', body: 'csöpög a csap' };

  test('ugyanaz a bemenet ugyanazt a hasht adja', () => {
    expect(sourceHash(alap)).toBe(sourceHash({ ...alap }));
  });

  test('más csatorna, más source_id, más szöveg → más hash', () => {
    const h = sourceHash(alap);
    expect(sourceHash({ ...alap, channel: 'email' })).not.toBe(h);
    expect(sourceHash({ ...alap, source_id: '43' })).not.toBe(h);
    expect(sourceHash({ ...alap, body: 'csöpög a csap.' })).not.toBe(h);
  });

  test('a NORMALIZÁLT szövegen a sortörés-eltérés NEM ad új hasht', () => {
    // Ez a normalizer és a dedup együttműködése. Ha a nyers body-t hashelnénk,
    // ugyanaz a mondat két sortöréssel átcsúszna a UNIQUE indexen — vagyis a
    // duplikátum-védelem pont a leggyakoribb esetben nem működne.
    const a = normalize({ channel: 'chat', source_id: '1', body: 'Csöpög  a csap\r\n\n\n\nkérem' });
    const b = normalize({ channel: 'chat', source_id: '1', body: 'Csöpög a csap\n\nkérem  ' });
    expect(sourceHash(a)).toBe(sourceHash(b));
  });

  test('hiányos bemenetre HIBÁT dob, nem ad csendben rossz hasht', () => {
    expect(() => sourceHash({ channel: 'chat', body: 'x' })).toThrow();
    expect(() => sourceHash({ channel: 'chat', source_id: '1' })).toThrow();
  });
});

describe('similarity — a magyar ragozás miatt trigram', () => {
  test('ugyanaz MÁS SZAVAKKAL a küszöb felett van', () => {
    expect(similarity('Csöpög a csap a 4-es szobában',
      'A 4-es szobában folyik a víz a csapból')).toBeGreaterThan(0.28);
  });

  test('KÉT KÜLÖNBÖZŐ hiba jóval a küszöb alatt van', () => {
    expect(similarity('Csöpög a csap', 'Nem megy a fűtés')).toBeLessThan(0.1);
    expect(similarity('Kiszakadt a szúnyoghálo', 'Elromlott a mosógép')).toBeLessThan(0.1);
  });

  test('az ÉKEZET nem számít — a lakók fele ékezet nélkül ír', () => {
    expect(similarity('nem megy a fűtés', 'nem megy a futes')).toBe(1);
  });

  test('üres szöveg 0, nem hiba', () => {
    expect(similarity('', 'valami')).toBe(0);
  });
});

describe('findDuplicateCandidates — JAVASOL, nem dönt', () => {
  const most = new Date('2026-09-30T10:00:00Z');
  const jegy = (id, title, extra = {}) => ({
    id, title, room_number: '4', accommodation_id: 'A', created_at: most, ...extra,
  });

  test('a hasonló jegyet megtalálja, a másikat nem', () => {
    const t = findDuplicateCandidates(
      { body: 'folyik a víz a csapból a szobában', room: '4', accommodationId: 'A' },
      [jegy('X', 'Csöpög a csap a szobában'), jegy('Y', 'Nem megy a fűtés')],
      { now: most }
    );
    expect(t.map((x) => x.ticketId)).toEqual(['X']);
    expect(t[0].reasons).toContain('azonos szoba');
  });

  test('A HELY EGYEZÉSE ÖNMAGÁBAN NEM ELÉG', () => {
    // Egy szálláson egyszerre lehet csöpögő csap és rossz fűtés. Ha a hely önmagában
    // elég lenne, a két különböző hibát egy jegyre húznánk, és az egyik kezeletlen
    // maradna — pontosan a spec 7.6 stop-kritériuma.
    const t = findDuplicateCandidates(
      { body: 'Nem világít a lámpa', room: '4', accommodationId: 'A' },
      [jegy('X', 'Csöpög a csap')], { now: most }
    );
    expect(t).toHaveLength(0);
  });

  test('a RÉGI nyitott jegy nem szívja magába a mai bejelentést', () => {
    // Egy fél éve nyitva lévő jegy lehet, hogy pont azért van nyitva, mert senki nem
    // foglalkozott vele — az nem teszi a mai bejelentést duplikátummá.
    const regi = new Date(most.getTime() - 200 * 3600 * 1000);
    const t = findDuplicateCandidates(
      { body: 'folyik a víz a csapból a szobában', room: '4' },
      [jegy('X', 'folyik a víz a csapból a szobában', { created_at: regi })],
      { now: most }
    );
    expect(t).toHaveLength(0);
  });

  test('a 0.95-ös AUTOMATIKUS összekötési korlátot egy átlagos átfogalmazás NEM éri el', () => {
    // Ez nem hiba, hanem a spec szigorának a következménye (link_duplicate
    // min_confidence = 0.950): automatikusan csak a szinte szó szerint azonos
    // szöveget kötjük össze, vagyis pont ott, ahol az összekötés veszélytelen.
    const t = findDuplicateCandidates(
      { body: 'A 4-es szobában folyik a víz a csapból', room: '4', accommodationId: 'A' },
      [jegy('X', 'Csöpög a csap a 4-es szobában')], { now: most }
    );
    expect(t).toHaveLength(1);
    expect(t[0].similarity).toBeLessThan(0.95);
  });

  test('sorrend: a legerősebb jelölt az első', () => {
    const t = findDuplicateCandidates(
      { body: 'folyik a víz a csapból a szobában', room: '4' },
      [jegy('gyenge', 'víz a szobában', { room_number: '9' }),
        jegy('eros', 'folyik a víz a csapból a szobában')],
      { now: most }
    );
    expect(t[0].ticketId).toBe('eros');
  });
});
