/**
 * normalizer-tesztek — nyelvfelismerés, whitespace, azonosító-kiemelés.
 *
 * A NYELVFELISMERÉS TESZTJEI A BACKFILL MÉRÉSÉBŐL SZÜLETTEK: az első futáson 56
 * meglévő üzenetből 40 lett `unknown`, köztük a "Csöpög a csap" és a "Mosógép
 * meghibásodott" — félreérthetetlenül magyar szövegek. A hiba az volt, hogy csak az
 * ő/ű betűt figyeltem, az ö/ü/á/é/í/ó/ú-t nem. Ezek a tesztek azt őrzik, hogy ez
 * ne csúszhasson vissza.
 */
const { normalize, nyelvFelismeres, szobaKiemeles, jegyHivatkozas } = require('../../src/agent/normalizer');

describe('nyelvfelismerés', () => {
  test.each([
    ['A fűtés nem megy a 12-es szobában', 'hu'],
    ['Csöpög a csap', 'hu'],                       // csak ö — a regresszió-teszt
    ['Mosógép meghibásodott', 'hu'],
    ['Takarítás szükséges', 'hu'],
    ['The heating is not working in room 3', 'en'],
    ['Tumutulo ang tubig sa kuwarto 4', 'tl'],
    ['Тече вода в кімнаті', 'uk'],
    ['Холодно, батарея не працює', 'uk'],
  ])('%s → %s', (s, v) => expect(nyelvFelismeres(s)).toBe(v));

  test('a CIRILL írásrendszer egyedül dönt — szólista nélkül is', () => {
    expect(nyelvFelismeres('Привіт')).toBe('uk');
  });

  test('BIZONYTALANSÁGBAN "unknown", NEM tippelés', () => {
    // A rossz nyelvű válasz a lakó számára rosszabb, mint ha megkérdezzük.
    expect(nyelvFelismeres('xyz 123')).toBe('unknown');
    expect(nyelvFelismeres('')).toBe('unknown');
    expect(nyelvFelismeres('4')).toBe('unknown');
  });

  test('funkciószó nélküli angol szókapcsolat is "unknown" — ez szándékos', () => {
    // "Integration Test Ticket": tartalmas szavak, funkciószó nélkül. Nincs
    // bizonyíték egyik nyelvre sem, tehát nem állítunk semmit.
    expect(nyelvFelismeres('Integration Test Ticket')).toBe('unknown');
  });
});

describe('normalize', () => {
  test('a whitespace egységesítése determinisztikus', () => {
    const a = normalize({ channel: 'chat', source_id: '1', body: 'Egy  sor\r\n\n\n\nMás sor   ' });
    expect(a.body).toBe('Egy sor\n\nMás sor');
  });

  test('a subject bekerül a nyelvfelismerésbe, de külön mezőben marad', () => {
    const a = normalize({ channel: 'email', source_id: 'x', subject: 'Nincs melegvíz', body: 'room 4' });
    expect(a.subject).toBe('Nincs melegvíz');
    expect(a.body).toBe('room 4');
    expect(a.lang).toBe('hu');            // a tárgyból derül ki, hogy magyar
  });

  test('üres subject → null, nem üres sztring', () => {
    expect(normalize({ channel: 'chat', source_id: '1', subject: '   ', body: 'x' }).subject).toBeNull();
  });

  test('body nélkül HIBÁT dob — nem ír be üres sort az adatbázisba', () => {
    expect(() => normalize({ channel: 'chat', source_id: '1' })).toThrow(/body/);
    expect(() => normalize(null)).toThrow();
  });
});

describe('azonosító-kiemelés', () => {
  test.each([
    ['A 4-es szobában csöpög', '4'],
    ['there is water in room 12', '12'],
    ['Tumutulo sa kuwarto 3', '3'],
    ['Тече вода в кімнаті 7', '7'],
  ])('szoba: %s → %s', (s, v) => expect(szobaKiemeles(s)).toBe(v));

  test('ahol nincs szobaszám, null — nem az első szám a szövegből', () => {
    // Ha bármelyik számot elfogadnánk, a "2 napja folyik a víz" a 2-es szobát
    // jelölné meg, és a szerelő rossz helyre menne.
    expect(szobaKiemeles('2 napja folyik a víz')).toBeNull();
  });

  test('jegyszám-hivatkozás', () => {
    expect(jegyHivatkozas('lásd #25 és #26, meg újra #25')).toEqual(['25', '26']);
    expect(jegyHivatkozas('nincs benne hivatkozás')).toEqual([]);
  });
});
