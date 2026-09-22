# Jelszóváltó felület + kötelező csere az első belépéskor

**Dátum:** 2026-09-22 · **Élesítve:** igen (mig 176) · **Teljes functest:** 331 passed / 0 failed

---

## 0. AMIT ELŐSZÖR TUDNOD KELL

A repóban **van egy kész jelszószabály-modul, amit soha senki nem kapcsolt be.**
A `passwordPolicy.js` tartalmaz 12 karakteres minimumot, négyféle karakterosztályt,
fiókzárolást 10 hibás próbálkozás után, 90 napos jelszó-elévülést és jelszótörténetet —
**és egyetlen sor sem importálja.** Ma tehát **semmilyen jelszószabály nem él**, a
fiókzárolás sem. (Ezért volt Eszti `failed_login_attempts` mezője végig 0.)

Ez a legrosszabb fajta állapot: meg van írva, tehát azt hisszük, véd.

**Nem azt kapcsoltam be.** A 4. pontodat egy új, szándékosan szerényebb szabályban
valósítottam meg — az indoklás a 3. fejezetben. A régi modul bekapcsolása külön döntés,
és a nyitott tételek közé tettem.

---

## 1. KÖTELEZŐ CSERE AZ ELSŐ BELÉPÉSKOR (3. pont)

**Migráció 176:** `users.must_change_password`.

| mikor kerül fel | ki veszi le |
|---|---|
| adminisztrátor **létrehoz** egy fiókot | **kizárólag** a saját jelszóváltás |
| adminisztrátor **visszaállítja** a jelszót | |

**Amíg fent van, a felhasználó SEMMIT nem lát.** Három út megy át: `/auth/me` (enélkül a
kliens meg sem tudná, hogy cserélnie kell), `/auth/change-password` (maga a kijárat) és
`/auth/logout`.

### A korlát a szerveren van, nem a kliensen

Ez nem stílusdöntés. Ha a kapu a mobilappban lenne, akkor **ugyanazzal a papírra írt
jelszóval egy böngészőből, az admin felületen keresztül ugyanúgy elérhetők lennének a
lakók adatai** — a jelszó ugyanaz, csak a képernyő más. A kliensoldali terelés kényelmi
funkció; a korlát a `middleware/mustChangePassword.js`.

A kapu ráadásul az `authenticateToken`-en **belül** van, nem a route-oknál — ugyanazon
okból, mint a modul-korlát: egy újonnan felvett végpont csendben kimaradna belőle.

**Meglévő fiókokat nem érint:** az élesítés után mind a 9 felhasználónál `false`. Senki
nem találkozik váratlanul egy jelszócsere-képernyővel.

---

## 2. A FELÜLETEK (1. és 2. pont)

### Mobil — lakói beállítások

Új képernyő: **Egyéb → Jelszó módosítása**. Három mező (jelenlegi, új, új még egyszer),
szem-ikon a megjelenítéshez, **öt nyelven** (hu/en/uk/tl/de).

A hibaüzenetek a mezők **alatt** jelennek meg, nem felugró ablakban: felugróban a szöveg
eltűnik, mire a felhasználó visszanéz a mezőre, és nem tudja összevetni azzal, amit beírt.

**Ugyanaz a kód szolgálja a kötelező első belépést**, egyetlen különbséggel: ott nincs
„Mégse" — de **kilépni lehet**, mert senki ne ragadjon be egy képernyőre, amiből nincs
kiút.

A kötelező ág az **onboarding ELŐTT** van: amíg a fiók nem a lakóé, még köszöntőt sem
mutatunk.

### Admin — saját profil

A fejléc felhasználói menüjébe került egy **„Jelszó módosítása"** pont, **minden
felhasználónak** (nem jogosultsághoz kötött — a saját jelszavához mindenkinek joga van).

Kötelező módban a párbeszéd **nem bezárható**, és a megnyitottsága közvetlenül a jelzőn
múlik, tehát a csere után **magától eltűnik**.

---

## 3. A JELSZÓSZABÁLY (4. pont) — és miért ilyen szerény

**A szabály:** legalább **8 karakter**, és **nem lehet ugyanaz, mint a jelenlegi**.
Egy helyen él (`src/utils/passwordRule.js`), és a kliensek ugyanezt a 8-as minimumot
mutatják — ha a két érték szétcsúszna, a felület zöld utat mutatna egy jelszóra, amit a
szerver aztán elutasít.

**Miért nem a meglévő, szigorúbb szabályt kapcsoltam be:**

> A lakók a belépésüket **papíron** kapják, **telefonon** gépelik be, **öt nyelven**, és
> ez a **legelső képernyő**, amit az appból látnak — még a köszöntő előtt. Ott egy 12
> karakteres, nagybetűt, számot és speciális karaktert követelő szabály nem biztonságot
> ad, hanem elakadást. A leggyakoribb kimenetele pedig az, hogy a jelszó **felkerül egy
> papírra** — vagyis pontosan az, ami ellen az egész védekezés szól.

**A „ne egyezzen a jelenlegivel" ág a kötelező cserénél a lényeg:** ott a jelenlegi
jelszó **AZ ideiglenes**. Enélkül a kötelező csere úgy is teljesíthető lenne, hogy a
papírra írt jelszó marad érvényben — a szabály nem csinálna semmit.

---

## 4. TESZTEK — az AUTH terület 10 → 15 esetre nőtt

```
AUTH-11  ideiglenes jelszóval a felhasználó SEMMIT nem lát a cseréig
AUTH-12  a csere LEVESZI a kötelezettséget, és onnantól minden megnyílik
AUTH-13  az IDEIGLENES jelszó nem tartható meg új jelszóként
AUTH-14  a túl rövid új jelszót elutasítja
AUTH-15  admin jelszó-visszaállítás UTÁN kötelező a csere
```

Teljes suite: **331 passed / 0 failed.**

### Mellékesen: felszámoltam egy ingadozó tesztosztályt

Munka közben nagyjából **minden tizedik futás elbukott, mindig MÁSHOL** (ASSIGN-08,
RESTASK-04). Az ok közös: több végpont **szándékosan** nem várja meg a belső értesítés
kiírását — az `inApp.notify` nincs `await`-elve, mert a szállásadó visszajelzése vagy a
lakó státuszváltása nem bukhat el azon, hogy a **mi** belső értesítésünk hibázik. A
tesztek viszont azonnal olvastak a `notifications` táblából, és versenyt futottak vele.

Ez a legnehezebben megfogható hibafajta: a bukás nem a vizsgált viselkedésről szólt,
hanem az időzítésről — **és elfedte volna a valódi hibákat is.**

Megoldás: közös várakozó segéd (`tests/functest/lib/wait.js`) + `teardown`-kampó a
futtatóban, amivel egy terület visszaállíthatja, amit a közös fixture-ön elrontott (az
AUTH terület a lakó jelszavát írja át — enélkül a később futó területek buktak volna el,
a futási sorrendtől függően). **10 egymást követő futás tiszta.**

---

## 5. ÉLESÍTÉS ÉS ÉLŐ PRÓBA

```
backup     pre_mig176_20260922T170403Z.dump (4,3 MB)
migráció   ▶ [176] must_change_password — applied
jelző      mind a 9 meglévő felhasználónál false
```

Élő próba egy tesztfiókkal:

```
jelzővel     /tickets/my  ->  403  MUST_CHANGE_PASSWORD
jelzővel     /auth/me     ->  200   (a kliens megtudhatja, hogy cserélnie kell)
jelző nélkül /tickets/my  ->  200
```

---

## 6. BUILD 11 — elindítva

iOS TestFlight + Android APK, a kérésed szerint **ebben a buildben**, nem külön.

*(Megjegyzés: az előző kör iOS buildje a 10-es számot kapta, nem a 9-est — az Apple nem
fogad be kétszer ugyanazt a build-számot. A mostani a 11.)*

---

## 7. NYITOTT TÉTEL, AMIT EZ A KÖR HOZOTT

**A `passwordPolicy.js` bekapcsolása.** A modul kész: 12 karakteres minimum, négy
karakterosztály, **fiókzárolás 10 hibás próbálkozás után**, 90 napos elévülés,
jelszótörténet. Ma egyik sem él.

A fiókzárolás hiánya a legfontosabb: **ma korlátlanul lehet jelszót próbálgatni.**
Javaslom, hogy legalább ezt kapcsoljuk be — a hosszra és a karakterosztályokra vonatkozó
részt viszont szerepkör szerint érdemes elágaztatni, hogy a lakókat ne zárja ki.

---

## ÖSSZEFOGLALÓ

**Elkészült:** mind a négy pont. Mobil jelszóváltó képernyő 5 nyelven (lakói beállításokból), admin jelszóváltás a fejléc menüjéből minden felhasználónak, kötelező csere az első belépéskor (mig 176) — a korlát a szerveren van, tehát böngészőből sem kerülhető meg —, és egy közös jelszószabály (8 karakter + ne egyezzen az ideiglenessel). Élesítve, élő próbával igazolva; a 9 meglévő fiókot nem érinti. AUTH 10 → 15 eset, suite **331/0**. Ráadásként felszámoltam egy ingadozó tesztosztályt, ami minden tizedik futást elrontott.
**Döntési pont:** a `passwordPolicy.js` (12 karakter, **fiókzárolás**, elévülés) meg van írva, de **soha nem volt bekötve** — ma korlátlanul lehet jelszót próbálgatni. Bekapcsoljuk-e, és ha igen, a hosszra vonatkozó részt szerepkör szerint elágaztatva?
**Tőled kell:** döntés a fentiről. A build 11 (iOS + Android) fut, szólok, ha kész.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-jelszovaltas-felulet-2026-09-22.md
