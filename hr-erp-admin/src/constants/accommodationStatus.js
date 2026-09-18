/**
 * Szálláshely-státuszok — EGY szótár.
 *
 * Eddig két helyen élt ugyanez a három érték (Accommodations.jsx és
 * AccommodationDetailModal.jsx), külön STATUS_LABELS/STATUS_COLORS párokkal. Egy új
 * állapot felvétele így mindig két fájl szinkronban tartását jelentette — ugyanaz a
 * minta, ami a számla-státuszoknál négy széttartó másolatig jutott.
 *
 * A 'reserve' azért kell, mert egy szállás lehet úgy is a miénk, hogy nem lakik ott
 * senki: a szerződés él, fizetjük vagy fizetnénk, de nincs kihelyezett munkavállaló.
 * Erre az `is_active=false` NEM jó — ebben a rendszerben az a törlés jele (a DELETE
 * végpont is azt állítja), és a szállás eltűnne a listáról, ahol aktiválni kellene.
 */
export const ACCOMMODATION_STATUS_LABELS = {
  available: 'Szabad',
  occupied: 'Foglalt',
  maintenance: 'Karbantartás',
  reserve: 'Tartalék',
};

export const ACCOMMODATION_STATUS_COLORS = {
  available: 'success',
  occupied: 'warning',
  maintenance: 'error',
  reserve: 'info',
};

/** Legördülőkhöz és szűrőkhöz — a sorrend a képernyőn is ez. */
export const ACCOMMODATION_STATUS_OPTIONS = Object.entries(ACCOMMODATION_STATUS_LABELS)
  .map(([value, label]) => ({ value, label }));
