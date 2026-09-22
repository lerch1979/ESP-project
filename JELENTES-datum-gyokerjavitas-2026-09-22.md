# pg DATE → JS Date időzóna-hiba — gyökérjavítás

**Dátum:** 2026-09-22 · **Commit:** `c5a46d77` · **Functest:** 287 passed / 0 failed
**Állapot:** sandboxban kész, **élesben még NINCS**

---

## A hiba, ami ötször jött vissza

A pg driver alapból JS `Date`-té alakította a DATE oszlopokat, **lokális éjfélre**. Egy
`toISOString()` ezen Budapesten **egy nappal visszatolt**:

```
2026-10-01 00:00 CEST  →  "2026-09-30T22:00:00Z"  →  "2026-09-30"
```

| Mikor | Mit rontott el |
|---|---|
| 2026-04 | **209 születési dátum** az importnál |
| 2026-09 | három saját szkript kimenete |
| 2026-09-22 | a gazdátlan jegyeket rendező szkript (`Tue Sep 22 2026 00:00:00 GMT+0000`) |

**Miért jött vissza mindig:** minden javítás **helyi** volt — kézi
`getFullYear/getMonth/getDate` formázás azon az egy hívási helyen. A következő új hívási
hely ugyanúgy elkövethette.

---

## 1. A driver-beállítás

`src/database/connection.js`:

```js
types.setTypeParser(types.builtins.DATE, (value) => value);   // OID 1082
```

A DATE mostantól pontosan az marad, ami az adatbázisban van: egy **`'YYYY-MM-DD'`
szöveg**, amibe az időzóna nem tud belenyúlni.

**Amit NEM érint:** a `timestamp` (1114) és a `timestamptz` (1184) továbbra is `Date`
objektumként jön. Ott az **időpont maga az adat**, tehát a `Date` a helyes forma — a
DATE-nél viszont nincs is időpont, csak egy naptári nap. Ez a megkülönböztetés az egész
javítás lényege, és a `DATE-07` teszt őrzi.

---

## 2. Amit a kódban igazítani kellett

**Jó hír előre:** a meglévő `new Date(x).toISOString().slice(0,10)` hívások ettől
**javulnak, nem törnek**. A `'YYYY-MM-DD'` szöveg UTC-éjfélként parse-olódik, tehát
ugyanazt a napot adja vissza — korábban épp ezek voltak a hibásak.

**Ami tört:** a `localDateStr` segédfüggvény, ami `Date`-et várt. És itt jött elő a
második, mélyebb probléma:

> **Ugyanaz a függvény négy külön szolgáltatásban élt** — `billingEngine`,
> `accommodationHistory`, `accountantShare`, `videoSequence` —, egymástól függetlenül,
> részben eltérő törzzsel. Egy javítás egyikben **nem ért el a többihez**. Pontosan az a
> minta, amitől a hiba ötször vissza tudott jönni.

**Megoldás:** egy közös `src/utils/dateOnly.js`:

| Függvény | Mit ad |
|---|---|
| `ymd(v)` | `'YYYY-MM-DD'` — **szövegből és `Date`-ből is** |
| `ym(v)` | `'YYYY-MM'` — számlázási hónap |
| `today()` | a mai nap **helyi idő szerint** |
| `addDays(v, n)` | naptári napok hozzáadása |
| `diffDays(a, b)` | napok különbsége |

Két dolog, ami külön figyelmet kapott:

- **`today()` nem `toISOString()`-alapú.** Az 00:00 és 02:00 között (CEST) az **előző
  napot** adná vissza — egy éjféli cron pont ettől számolna rossz napra.
- **`addDays` nem `+ n * 86400000`.** Az az aritmetika az októberi óraátállításkor **egy
  napot téved**; a helyi `setDate()` átlépi a váltást. (Ez a hiba egyszer már elkapott
  minket a PART-06 tesztnél.)

---

## 3. A regressziós teszt

Új `DATE` functest-terület, **7 eset, mind zöld**:

| | |
|---|---|
| DATE-01 | a DATE oszlop **szövegként** jön vissza |
| DATE-02 | **hónaphatár**: 2026-10-01 és 2027-01-01 nem csúszik vissza |
| DATE-03 | a hónap **utolsó napja** sem csúszik előre |
| DATE-04 | **valódi táblából** írva-olvasva is pontos |
| DATE-05 | **nyári időszámítás**: az átállítás hetében sem csúszik |
| DATE-06 | a **mai nap** egyezik a `CURRENT_DATE`-tel |
| DATE-07 | a **timestamp nem változott** — ott továbbra is `Date` |

**Miért épp hónap- és évhatár:** az egynapos csúszás **csak ott látszik**. Egy hónap
közepén a rossz és a jó eredmény is ugyanabba a hónapba esik — egy 15-ei dátummal írt
teszt akkor is zöld lenne, ha a hiba visszajön.

---

## 4. Maradt-e elcsúszott dátum az éles adatbázisban?

**Nem találtam nyomát.** Előre kell bocsátanom, hogy egy egynapos csúszás **utólag nem
bizonyítható** független forrás nélkül — de van egy statisztikai ujjlenyomata: ha a
dátumok visszafelé csúsztak, a **hónap első napjai alulreprezentáltak**, az utolsók pedig
túl.

| Oszlop | 1-jei | 28–31-i | összes | várható 1-jei |
|---|---|---|---|---|
| `employees.birth_date` | 15 | 51 | 535 | ~17,6 |
| `invoices.invoice_date` | 3 | 1 | 18 | ~0,6 |

A születési dátumoknál a 15 az elvárt 17,6-hez képest a szóráson belül van, és a hónap
utolsó napjainál sincs többlet. **Nincs rendszeres −1 eltolódás.**

**A `check_in_date` eloszlása degenerált** (282 db 2026-05-19, 47 db 2026-09-03), de ez
nem dátumhiba: ezeket a saját epizód-újraépítő szkriptem írta egyetlen napra. Naptári
eloszlást ott nem is lehet várni.

**Az egyetlen ismert incidens ellenőrizve:** Abiog Jessien születési dátuma ma
**1989-03-13** — pontosan az az érték, amit annak idején megerősítettél. Az áprilisi
javítás tehát tart.

---

## Mi a következő

1. **Deploy** — a változás driver-szintű, tehát minden DATE-olvasást érint.
   Ajánlásom: `push → CI → backup → pull && up -d`, és utána egy gyors éles próba
   (`SELECT ... ::date` típusa + egy profit-lekérdezés).
2. **Utána a karbantartási mátrix felülete** a szállás adatlapján, ahogy kérted.

## Amit érdemes tudni a deploy kockázatáról

A 287 functest zöld, és a változás **szűkebb, mint amilyennek hangzik**: csak a DATE
típust érinti, a `timestamp`-eket nem. A legnagyobb kockázat az olyan kód, ami **implicit
módon** számít `Date` objektumra — ezeket a suite átfésülte, de a lefedetlen területeken
(pl. ritkán futó riportok) maradhat meglepetés.

Ha deploy után bárhol `d.getFullYear is not a function` vagy hasonló jön elő, az ugyanez
a család: a `utils/dateOnly.js` `ymd()`-je a javítás, és **nem kell helyben formázni**.
