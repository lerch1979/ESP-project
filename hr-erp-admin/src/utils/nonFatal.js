/**
 * halkHiba — egy NEM végzetes hiba kezelése úgy, hogy azért nyoma maradjon.
 *
 * MIÉRT KELL: a kódbázisban 64 üres `catch {}` van. Egyik sincs valódi mentési úton
 * (ezt megnéztük), tehát pénz vagy adat nem vész el bennük — de többségük opcionális
 * LISTABETÖLTÉS, és ha az elbukik, a felhasználó egy ÜRES legördülőt lát, magyarázat
 * nélkül. „Nincs egyetlen dolgozó sem?" — de van, csak a lekérdezés hibázott.
 *
 * A két rossz véglet helyett:
 *   • `catch {}`            → a hiba nyomtalanul eltűnik, a támogatásnak sincs mit néznie;
 *   • minden hibára toast   → három párhuzamos betöltésnél három felugró ablak.
 *
 * Ez a segéd a konzolba MINDIG ír (a támogatás ebből dolgozik), a felhasználónak pedig
 * csak akkor szól, ha a hiányzó adat miatt egy vezérlő HASZNÁLHATATLAN lesz.
 */
import { toast } from 'react-toastify';

const mar = new Set();   // egy adott helyről egyszer szólunk, ne ismételje magát

export function halkHiba(hol, error, opts = {}) {
  const uzenet = error?.response?.data?.message || error?.message || 'ismeretlen hiba';
  // eslint-disable-next-line no-console
  console.warn(`[nem végzetes] ${hol}: ${uzenet}`, error);

  // `felhasznaloiUzenet`: csak ott add meg, ahol a hiány LÁTHATÓ következménnyel jár
  // (üres választólista, betöltetlen űrlap) — különben a konzol elég.
  if (opts.felhasznaloiUzenet && !mar.has(hol)) {
    mar.add(hol);
    toast.warn(opts.felhasznaloiUzenet, { autoClose: 6000 });
  }
}

export default halkHiba;
