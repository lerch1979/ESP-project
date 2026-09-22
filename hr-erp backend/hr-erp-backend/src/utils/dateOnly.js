/**
 * NAPTÁRI NAP (DATE) kezelése — egy helyen, mindkét bemeneti formára.
 *
 * MIÉRT LÉTEZIK EZ A FÁJL
 * -----------------------
 * A pg driver 2026-09-22 óta a DATE oszlopokat SZÖVEGKÉNT adja vissza ('YYYY-MM-DD',
 * `connection.js` `setTypeParser(1082)`), mert Date objektumként az időzóna bele tudott
 * nyúlni: `toISOString()` Budapesten egy nappal visszatolt. Ez a hiba ötször fordult elő
 * — 209 születési dátumot rontott el az áprilisi importnál, és négy saját szkript
 * kimenetét.
 *
 * A kódban viszont maradnak Date objektumok is: a `timestamp`/`timestamptz` oszlopok
 * továbbra is azok (helyesen — ott az időpont maga az adat), és a `new Date()` is az.
 * Ezért a formázónak MINDKETTŐT kell kezelnie, különben a javítás új hibát szül.
 *
 * NÉGY MÁSOLAT HELYETT EGY. Ugyanez a függvény `localDateStr` néven négy külön
 * szolgáltatásban élt (billingEngine, accommodationHistory, accountantShare,
 * videoSequence), egymástól függetlenül. Egy javítás egyikben nem ért el a többihez —
 * pontosan az a minta, ami miatt a hiba ötször tudott visszajönni.
 */

/**
 * 'YYYY-MM-DD' alakra hozás.
 *
 * - már 'YYYY-MM-DD' szöveg → változatlanul vissza (ez a DATE oszlopok új alakja),
 * - Date objektum → HELYI dátumrészekből (soha nem `toISOString()`),
 * - ISO időbélyeg szöveg → a nap része,
 * - null/érvénytelen → null.
 */
function ymd(value) {
  if (value === null || value === undefined || value === '') return null;

  // A DATE oszlopok új alakja. Nem megyünk át Date-en: pont azt kerüljük el.
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : ymd(d);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`
      + `-${String(value.getDate()).padStart(2, '0')}`;
  }

  return null;
}

/** 'YYYY-MM' — számlázási hónap. Ugyanazon a szabályon. */
function ym(value) {
  const s = ymd(value);
  return s ? s.slice(0, 7) : null;
}

/**
 * MAI nap helyi idő szerint.
 *
 * NEM `new Date().toISOString().slice(0,10)` — az 00:00 és 02:00 között (CEST) még az
 * ELŐZŐ napot adná vissza. Egy éjféli cron pont ettől számolna rossz napra.
 */
function today() {
  return ymd(new Date());
}

/** Naptári napok hozzáadása egy naphoz, 'YYYY-MM-DD' be és ki. */
function addDays(value, days) {
  const s = ymd(value);
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  // Helyi konstruktor + setDate: átlépi a hónap- és évhatárt, és a nyári időszámítás
  // váltását is (a `+ n * 86400000` aritmetika októberben egy napot tévedne).
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return ymd(dt);
}

/** Két naptári nap különbsége napokban (a − b). */
function diffDays(a, b) {
  const sa = ymd(a); const sb = ymd(b);
  if (!sa || !sb) return null;
  // UTC-ben számolunk, hogy a nyári időszámítás ne adjon 23 vagy 25 órás napokat.
  const [ya, ma, da] = sa.split('-').map(Number);
  const [yb, mb, db] = sb.split('-').map(Number);
  return Math.round((Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86400000);
}

module.exports = { ymd, ym, today, addDays, diffDays };
