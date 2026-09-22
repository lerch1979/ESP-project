# Több érintett lakó — a választó hiányzott az admin felületről

**Dátum:** 2026-09-22 · **Élesítve:** igen · **Teljes functest:** 334 passed / 0 failed

---

## 0. A TESZTELŐNEK IGAZA VAN, ÉS AZ ELŐZŐ JELENTÉSEM FÉLREVEZETŐ VOLT

A mig 173 óta a **backend** tudja a több érintettet és az „egész szállás" hatókört, és a
**mobil** is mutatja őket a lakónak. Amit „élesítve"-ként jelentettem, az **ez a két
dolog** volt — a backend és a lakói **olvasási** oldal.

**Az admin felületen viszont soha nem volt hol megadni.** Nem a build maradt el: a
funkció nem készült el. Ezt így kellett volna írnom.

---

## 1. HOL VOLT A VÁLASZTÓ? SEHOL — egyik űrlapon sem

Megnéztem mindkettőt a forrásban: sem a `CreateTicketModal.jsx`, sem az
`EditTicketModal.jsx` nem ismerte az `affected_employee_ids` és a
`scope_accommodation_id` mezőket. A teljes admin forrásban **nulla** találat volt rájuk.

---

## 2. KIMENT-E AZ ADMIN FRISSÍTÉSE? IGEN — csak nem volt benne semmi

A deployolt admin bundle **110 JS fájljában nulla** `affected_employee_ids` előfordulás
volt. A frissítés kiment, a kód viszont nem tartalmazta a funkciót.

**Most már igen:**

```
/usr/share/nginx/html/assets/Tickets-zfSHVZRu.js       ← tartalmazza
/usr/share/nginx/html/assets/TicketDetail-CN9q7FQi.js  ← tartalmazza
```

---

## 3. ÉLES PRÓBA SZUPERADMINKÉNT

**Még a javítás előtt** leellenőriztem, hogy a backend valóban működik-e — működött:

```
két érintettel  -> 201   scope=employee       névsor-sorok=2
egész szállás   -> 201   scope=accommodation  névsor-sorok=0
```

**A javítás után, élesben**, mind a négy művelet:

```
létrehozás 2 érintettel : 201
  részletekben látszik  : 2 fő
szerkesztés 1 főre      : 200  ->  1 fő      (a levett lakó eltűnt)
ház-hatókörre váltás    : 200  |  scope=accommodation  |  névsor=0  |  ház=Fertőd
```

A próbajegyeket mindkét körben töröltem.

---

## 4. HOL TALÁLOD A FELÜLETEN

### Új jegy

> **Hibajegyek** → **„Új hibajegy"** gomb → az űrlap alján, a „Kapcsolódó dolgozó" alatt,
> egy elválasztó vonal után: **„Kit érint még? (opcionális)"**

Ott két gomb van:

| gomb | mit csinál |
|---|---|
| **Kiválasztott lakók** | többszörös választó, névre keresve — mindenki külön chipként jelenik meg |
| **Egész szállás** | egy ház kiválasztása; a ház minden lakója látja |

### Meglévő jegy szerkesztése

> **Hibajegyek** → a jegy megnyitása → **„Szerkesztés"** → ugyanaz a blokk, **„Kit érint
> még?"**, már kitöltve azzal, aki ma rajta van.

---

## 5. AMI A FELÜLETEN TÚL KELLETT

### A szerkesztő út a backenden sem létezett

A `updateTicket` engedélyezett mezői közt egyik sem szerepelt — a felület magában
**némán nem csinált volna semmit**. Most elfogadja mindkettőt, három fontos szabállyal:

**a) Az érintett-lista CSERE, nem hozzáfűzés.** Ha hozzáfűzne, egy tévedésből felvett
lakót soha nem lehetne levenni a jegyről.

**b) Ház-hatókörre váltáskor a névsor TÖRLŐDIK.** Vegyes (két megbízós) szálláson egy
bent felejtett névsor más cég dolgozójának nevét mutatná meg a megbízói oldalon — ez a
kikötésed volt a funkció feltételeként.

**c) Csak az ÚJONNAN felvettek kapnak értesítést.** Aki eddig is rajta volt, egy
szerkesztéstől ne kapjon újat. Az értesítés a tranzakción kívül megy, hogy egy
értesítési hiba ne görgessen vissza egy sikeres szerkesztést.

### A jegy részletei nem mondták meg, kiket érint

Enélkül a szerkesztő űrlap **üres listát** mutatna, és egy mentés **némán levenné az
összes eddigi érintettet** — a hiba észrevétlen maradna, mert semmi nem jelezné. A
`GET /tickets/:id` mostantól visszaadja az érintettek listáját és a ház-hatókör nevét.

---

## 6. TESZTEK

```
RESTICK-12  az érintettek UTÓLAG is módosíthatók — a levett lakó el is tűnik
RESTICK-13  ⚠️ ház-hatókörre váltáskor a NÉVSOR TÖRLŐDIK
RESTICK-14  a jegy részletei MEGMONDJÁK, kiket érint
```

Teljes suite: **334 passed / 0 failed.**

---

## 7. TANULSÁG, AMIT MAGAMRA VESZEK

A „több érintett lakó élesítve" állításom a backendre és a mobil olvasási oldalára volt
igaz, de **teljes funkcióként jelentettem**. Egy funkció akkor kész, ha **be is lehet
vinni az adatot** — nem akkor, ha a tárolása és a megjelenítése megvan. A következő
hasonló jelentésben külön ki fogom mondani, melyik felületen hol lehet használni, és ha
valahol nem, azt is.

---

## ÖSSZEFOGLALÓ

**Elkészült:** a több-lakós választó megépült **mindkét** admin űrlapon (új jegy + szerkesztés), és hozzá a backend szerkesztő útja is, ami eddig szintén nem létezett. Élesítve, élesben végigpróbálva: létrehozás 2 érintettel, lakó levétele, ház-hatókörre váltás — mind működik, a névsor a hatókörváltáskor törlődik (a megbízói szivárgás elleni kikötésed). A deployolt bundle most már tartalmazza. Suite **334/0**.
**Döntési pont:** nincs.
**Tőled kell:** semmi — a tesztelő próbálja újra. **Hibajegyek → Új hibajegy → az űrlap alján „Kit érint még?"**, két gombbal: *Kiválasztott lakók* / *Egész szállás*. Szerkesztésnél ugyanott, már kitöltve.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-tobb-erintett-lako-admin-2026-09-22.md
