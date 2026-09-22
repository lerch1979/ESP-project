# Tokenérvénytelenítés jelszóváltáskor — bevezetve és élesítve

**Dátum:** 2026-09-22 · **Élesítve:** igen · **Teljes functest:** 326 passed / 0 failed

---

## 1. MI VOLT A BAJ

A jelszóváltás eddig **csak az új belépésekre** hatott. A korábban kiadott tokenek tovább
éltek:

| token | élettartam | mit jelentett ez |
|---|---|---|
| belépési token | **8 óra** | egy ellopott telefon a váltás után még 8 órán át dolgozott |
| refresh token | **30 nap** | és ebből 30 napig újra és újra lehetett friss belépési tokent váltani |

Márpedig a jelszót épp azért váltják, hogy ennek vége legyen. Most, **amíg csak
tesztfiókok vannak**, volt a jó pillanat bevezetni.

---

## 2. A HÁROM SZABÁLY — és a köztük lévő különbség

A lényeg nem a három ág külön-külön, hanem az, hogy **miben térnek el**. Ez csúszik el
legkönnyebben egy későbbi átíráskor, ezért mindháromnak külön tesztje van.

### a) Saját jelszóváltás → a hívó eszköze BENT marad

Új végpont: **`POST /auth/change-password`**. Ellenőrzi a jelenlegi jelszót, beállítja az
újat, és a válaszban **friss token-párt ad** — így a hívó eszköze folytatja. **A többi
eszköz kilép.**

> Miért így: a felhasználó a gép előtt ül, és a régi jelszavával **épp most igazolta
> magát**. Kidobni őt értelmetlen lenne.

A jelenlegi jelszó ellenőrzése nem formaság: enélkül egy eltulajdonított, még élő
munkamenet át tudná írni a jelszót, és **kizárná a tulajdonost a saját fiókjából**.

### b) Adminisztrátori visszaállítás → MINDEN munkamenet kilép

A `PUT /users/:id` `password` mezővel (ez történt Esztinél) mostantól beállítja a
`password_changed_at`-et, és **kivétel nélkül minden munkamenet kilép** — a felhasználóé
is.

> Miért nincs kivétel: ezt az utat épp akkor használjuk, amikor a fiókhoz valaki más is
> hozzáférhetett. Egy „de a telefonja maradjon bent" kivétel pont azt a munkamenetet
> hagyná életben, ami miatt a visszaállítás történik.

A visszaállítás **nyomot hagy a naplóban** (`warn` szinten, a visszaállító nevével) —
ha a felhasználó nem érti, miért lépett ki mindenhol, legyen mit megnézni.

### c) A frissítési út is záródik

A `/auth/refresh` ugyanezt a szabályt alkalmazza.

> Enélkül a 30 napos **régi** refresh tokennel a váltás után is új, érvényes belépési
> tokent lehetne váltani — és az egész érvénytelenítés **díszlet** lenne.

---

## 3. KÉT MEGVALÓSÍTÁSI DÖNTÉS, AMIT ÉRDEMES TUDNOD

**Egy függvény, két hívó.** A döntést a `src/utils/tokenFreshness.js` hozza, és a
middleware is, a refresh is ezt hívja. Két másolat idővel szétcsúszik, és a rés pont a
ritkábban olvasott ágon nyílna meg.

**Egy másodperc tűrés.** A JWT `iat` mezője másodperc pontosságú és **lefelé kerekít**, a
`password_changed_at` viszont ezredmásodperc pontosságú. Aki a saját jelszavát váltja,
annak ugyanabban a másodpercben adunk új tokent — tűrés nélkül **a frissen kiadottat
dobnánk el**, vagyis pont azt a munkamenetet, amit meg akarunk tartani. Ez nem
„biztonsági ráhagyás": a támadó tokenje nem egy másodperccel korábbi, hanem órákkal.

---

## 4. A MOBIL OLDAL

A szerver `PASSWORD_CHANGED` kódja eljut a belépő képernyőig, és **külön mondatot** kap:

| helyzet | üzenet |
|---|---|
| lejárt munkamenet | „A mentett belépés lejárt… Lépj be a jelszavaddal." |
| **megváltozott jelszó** | „A jelszavad megváltozott… Lépj be az **ÚJ** jelszavaddal — a régi már nem működik." |

> Miért nem elég egy üzenet: aki azt hiszi, csak lejárt, a **régi** jelszavát próbálja
> újra és újra — és a fiókja végül zárolódik.

Öt nyelven (hu/en/uk/tl/de), az i18n-őr zöld.

---

## 5. TESZTEK — az AUTH terület 5-ről 10 esetre nőtt

```
AUTH-01  a jelszóváltás ELŐTT kiadott token a váltás UTÁN ÉRVÉNYTELEN   ← megfordított elvárás
AUTH-02  a LEJÁRT token 401-et kap
AUTH-03  érvényes refresh tokenből ÚJ belépési token jön
AUTH-04  ÉRVÉNYTELEN refresh token 401
AUTH-05  refresh token NÉLKÜL nem jár új belépés
AUTH-06  a jelszóváltás UTÁN kiadott token érvényes marad            ← a tűrést őrzi
AUTH-07  SAJÁT jelszóváltás: a hívó eszköze BENT marad, a régi token kiesik
AUTH-08  saját jelszóváltás ROSSZ jelenlegi jelszóval elbukik
AUTH-09  ADMIN jelszó-visszaállítás: MINDEN munkamenet kilép
AUTH-10  a RÉGI refresh token a jelszóváltás után nem vált új belépést
```

**Egy tanulság a tesztírásból:** az AUTH-01 és AUTH-09 elsőre elbukott — de nem a kódon,
hanem a **teszt saját kiindulásán**. A fixture-felhasználó `password_changed_at`-je a
létrehozás pillanata (az oszlop alapértelmezése `CURRENT_TIMESTAMP`), így egy „egy órával
korábbi" token eleve régebbi volt a fióknál. A kiindulást külön segéd teszi a múltba —
enélkül a teszt a saját beállítását mérte volna, nem a viselkedést.

Teljes suite: **326 passed / 0 failed.**

---

## 6. ÉLESÍTÉS ÉS ÉLŐ ELLENŐRZÉS

```
backup   pre_tokeninvalid_20260922T154534Z.dump (4,3 MB)
pull+up  backend és admin újraindult
```

Élő próba a `app.housingsolutions.hu`-n (Eszti fiókjával, `password_changed_at` =
2026-09-18 06:31:59):

```
friss token          -> 200
jelszóváltás előtti  -> 401  PASSWORD_CHANGED
régi refresh token   -> 401  PASSWORD_CHANGED
```

A határeset is helyes: a váltással **azonos másodpercben** kiadott token **érvényes
marad** (a tűrés működik).

**Nem léptetett ki senkit feleslegesen:** csak azok a tokenek esnek ki, amelyek a
felhasználó jelszóváltása ELŐTT keltek. Aki a váltás óta lépett be, marad.

---

## 7. A BUILD — egy build, mindkét változással

Ahogy kérted, **nem külön buildben** megy ki. A build 9 iOS-en már elkészült, de **még nem
küldtem be** a TestFlightra, amikor ez a munka rákerült — ezért leállítottam a régi
commitból futó Android buildet, és mindkét platformot újraindítottam a végleges kóddal.

⚠️ **A build száma ezért 10 lett, nem 9.** Az Apple nem fogad be kétszer ugyanazt a
build-számot, a build 9 pedig már létezett a szervereiken. **Egyetlen build megy ki a
tesztelőkhöz**, és az mindent visz:

1. chat-kép · 2. push-javítások · 3. teendőlista · 4. közös jegyek
5. Face ID: a halott munkamenet kimondása · 6. a jelszóváltás külön üzenete

| platform | build | állapot |
|---|---|---|
| iOS | **10** | elkészült, beküldve a TestFlightra |
| Android | **4** (APK) | az EAS sorában áll |

---

## ÖSSZEFOGLALÓ

**Elkészült:** a jelszóváltás mostantól minden korábbi tokent érvénytelenít, mindhárom szabályod szerint — saját váltásnál a hívó eszköze bent marad (új `POST /auth/change-password` végpont), admin-visszaállításnál minden munkamenet kilép, és a refresh út is zárva (különben a 30 napos refresh tokennel megkerülhető lenne). Élesítve és élesben ellenőrizve: a váltás előtti token és a régi refresh token is 401/`PASSWORD_CHANGED`. AUTH terület 5 → 10 eset, suite **326/0**. A mobil külön mondatot kap a jelszóváltásra, 5 nyelven.
**Döntési pont:** nincs.
**Tőled kell:** semmi — Eszti a **jelszavával** lépjen be. Egy dologra figyelj: **a build száma 10 lett, nem 9**, mert a 9-es iOS build már létezett az Apple-nél, amikor ez a változás rákerült; egyetlen build megy ki, mindkét változással.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-token-ervenytelenites-2026-09-22.md
