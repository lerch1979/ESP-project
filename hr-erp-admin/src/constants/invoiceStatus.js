/**
 * A számla fizetési állapotai — EGY forrásból.
 *
 * Ez a lista négy képernyőn élt külön másolatban, és mind a négy ugyanazt a hibás
 * készletet tartalmazta: szerepelt benne egy `pending`, amit a szerver nem ismer, és
 * hiányzott belőle a `draft` meg a `sent`, amit viszont használ. Egy frissen rögzített
 * számla ezért piszkozatban ragadt: a legördülő egyetlen felkínált értéke sem volt
 * érvényes következő lépés, a sztornót leszámítva.
 *
 * Az értékek a szerver `VALID_STATUSES` és `VALID_TRANSITIONS` konstansaival egyeznek
 * (controllers/invoice.controller.js). Ha ott változik valami, itt is változtatni kell —
 * ezért van mellette az ALLOWED_NEXT, nem csak a címkék.
 */

export const PAYMENT_STATUSES = {
  draft:     { label: 'Piszkozat', color: 'default' },
  sent:      { label: 'Kiállítva', color: 'info' },
  paid:      { label: 'Fizetve',   color: 'success' },
  overdue:   { label: 'Lejárt',    color: 'error' },
  cancelled: { label: 'Sztornó',   color: 'default' },
};

/** A szerver állapotgépe. Amit itt nem sorolunk fel, arra a mentés 400-zal válaszol. */
export const ALLOWED_NEXT = {
  draft:     ['sent', 'cancelled'],
  sent:      ['paid', 'overdue', 'cancelled'],
  paid:      ['overdue'],          // téves túlfizetés visszavezetése
  overdue:   ['paid', 'cancelled'],
  cancelled: [],                   // végállapot
};

/**
 * A listában felkínálható értékek: a jelenlegi állapot (hogy látszódjon, hol tartunk) és
 * a belőle elérhető lépések. Így a felhasználó nem tud olyat választani, amit a szerver
 * visszautasít.
 */
export function selectableFrom(current) {
  const next = ALLOWED_NEXT[current] || [];
  return [current, ...next].filter((v, i, a) => v && a.indexOf(v) === i);
}

/**
 * Rögzítéskor szabadon megadható — egy már kifizetett régi számla feltöltésekor nincs
 * értelme végigvinni a piszkozat → kiállítva → fizetve úton. A sztornó itt nem szerepel:
 * sztornó számlát nem "létrehozunk", hanem egy meglévőt állítunk arra.
 */
export const CREATE_STATUSES = ['draft', 'sent', 'paid', 'overdue'];

/** Ismeretlen (pl. régi `pending`) értéknél a nyers kód látszódjon, ne egy üres cella. */
export const statusLabel = (v) => PAYMENT_STATUSES[v]?.label || v || '-';
export const statusColor = (v) => PAYMENT_STATUSES[v]?.color || 'default';
