# „A Face ID sikerül, mégsem enged be" — vizsgálat és javítás

**Dátum:** 2026-09-22 · **Fiók:** eszti.teszt@housingsolutions.hu · **Teljes functest:** 321 passed / 0 failed

---

## 0. AZONNALI MEGOLDÁS ESZTINEK

**Lépjen be a jelszavával a belépő képernyőn.** Ez most, a mai appal (build 6) is
működik — a fiókjával semmi baj nincs. A Face ID a jelszavas belépés után újra
használható lesz.

---

## 1. A DÖNTŐ TÉNY: a szerver soha nem utasította el

A mobilapp **egyetlen elutasított kérést sem kapott ma.** Ezt három, egymástól független
adat mondja:

| bizonyíték | érték |
|---|---|
| a mobilapp NEM 200-as válaszai ma | **0 db** (174 kérésből mind 200/201) |
| belépési kísérlet a naplóban | **1 db**, 07:40:01-kor, **sikeres** |
| `users.failed_login_attempts` | **0** |
| a mobilapp utolsó kérése | **12:29:16** |

Ha az app elküldött volna bármit, az látszana. **Nem küldött semmit** — a hiba tehát
teljes egészében a telefonon történik, a hálózat előtt.

**A fiókkal sincs baj:** aktív, nincs zárolva, a jelszó 2026-09-18-án változott (nem
lejárt).

---

## 2. A NÉGY GYANÚD — pontról pontra

### 1. gyanú: érvényteleníti-e a szerver a jelszóváltás előtti tokeneket?

**NEM.** Megnéztem: a `password_changed_at` mezőt a kódban **egyetlen** hely olvassa
(`passwordPolicy.js:271`), és az is csak a jelszó **elévülését** vizsgálja — ráadásul az
a middleware **sehová nincs bekötve**, tehát ma nem is fut. A tokenek JWT-k, a szerver
csak az aláírást és a lejáratot nézi; nincs visszavonási lista, nincs token-verzió.

➡️ **Egy jelszóváltás nem öli meg a telefonon tárolt belépést.** A feltevés logikus volt,
de a kód nem ezt csinálja.

*Ez viszont döntési kérdés:* biztonsági szempontból a jelszóváltásnak **kellene** ölnie a
régi munkameneteket (épp ez a jelszóváltás értelme kompromittálódás után). Ma nem teszi.
Ezért **tesztet tettem alá** (AUTH-01): ha valaki bevezeti az érvénytelenítést, a teszt
elbukik, és a döntést ki kell mondani — mert minden eszközön kilépteti a felhasználókat.

### 2. gyanú: a build 8 felülírta-e a secure storage tartalmát?

**Nem tudta felülírni, mert Eszti nincs build 8-on.** A napló szerint ma **kizárólag
`HousingSolutionsHR/6`** járt a szerveren — 174 kérés, más verzió egy sem. A build 8 a
TestFlightra 15:27-kor ment be, tehát nála még a build 6 fut.

### 3. gyanú: mit küldött az app és mit válaszolt a szerver?

**Semmit nem küldött.** Lásd az 1. pontot. Az utolsó kérése 12:29:16-kor ment,
sikeresen. Azóta a szerver felé néma.

### 4. gyanú: mit csinál az app, ha a biometria után elutasítás jön?

**Ez a találat — és a tényleges hiba.** Két helyen is némán elvész:

**a) A hazug üzenet.** Az `unlockWithBiometric()` puszta igaz/hamis értéket adott vissza:

```js
const ok = await authenticate(...);   // ← a Face ID SIKERÜLT
if (!ok) return false;
const storedUser = await getItem('user');
if (!storedUser) return false;        // ← ide fut: nincs mit kinyitni
```

A hívó mindkét `false`-ra ugyanazt írta ki: **„a biometrikus azonosítás nem sikerült"** —
ami **nem igaz**, hiszen az arcfelismerés épp hogy sikerült. A felhasználó ebből azt
tanulja, hogy próbálja újra a Face ID-t — és ezt teszi a végtelenségig, ahelyett hogy
jelszót írna.

**b) A ragadós állapot.** A 401-es ág (`api.js`) a tárolt belépést **némán** törölte:

```js
await deleteItem('token');
await deleteItem('refreshToken');
await deleteItem('user');
// …de a 'biometricEnabled' = 'true' MARADT
```

Ettől a telefon beragad: a belépő képernyő továbbra is felkínálja a Face ID-t, az mindig
sikerül, és soha nem történik semmi. Senki nem mondja meg, hogy jelszó kellene.

**c) Ráadás:** a `hydrateUser` üres `catch {}` blokkja a `/me` hibáját is lenyelte,
miközben a felhasználót már „bejelentkezettnek" állította. Egy halott tokennel tehát be
is lehetett jutni — csak minden képernyő üresen jött vissza.

---

## 3. A JAVÍTÁS

| mi változott | miért |
|---|---|
| `unlockWithBiometric` mostantól **okot** ad vissza (`biometric` / `session_expired`) | a két kudarc nem ugyanaz, és eddig ugyanazt az üzenetet kapták |
| külön üzenet a lejárt munkamenetre, 5 nyelven | „Az arcfelismerés sikerült — a telefonon tárolt belépés járt le. Lépj be a jelszavaddal; utána a Face ID újra működni fog." |
| **állandó sáv** a belépő képernyőn, nem eltűnő felugró | a felhasználó a belépő képernyőt nézi; látnia kell, miért került oda |
| a 401-es ág **jelez** az AuthContextnek | eddig némán törölt |
| a biometrikus kapcsoló **megmarad** a lejáratkor | nem ő kapcsolta ki; jelszavas belépés után menjen újra, kérdés nélkül |
| `hydrateUser` szétválasztja: **401 = halott belépés**, **hálózati hiba = maradunk** | egy pillanatnyi netkimaradás nem léptethet ki |
| a jelszavas belépés frissíti a biometrikus adatot | a `login()` amúgy is felülírja a három SecureStore kulcsot — most kimondva, és a figyelmeztetés ettől szűnik meg, nem elrejtve |

### Új functest terület: AUTH (5 eset, mind zöld)

```
AUTH-01  a jelszóváltás ELŐTT kiadott token a váltás UTÁN is érvényes
AUTH-02  a LEJÁRT token 401-et kap — enélkül a kliens nem tudná, mikor frissítsen
AUTH-03  érvényes refresh tokenből ÚJ belépési token jön
AUTH-04  ÉRVÉNYTELEN refresh token 401 — a kliens innen tudja, hogy jelszó kell
AUTH-05  refresh token NÉLKÜL nem jár új belépés
```

Teljes suite: **321 passed / 0 failed**. i18n-őr zöld.

---

## 4. AMIT NEM TUDOK BIZONYÍTANI

Azt **nem** tudom megmondani, mi törölte a telefonján a tárolt belépést — mert a törlés a
készüléken történt, nyom nélkül. Két lehetőség maradt, és mindkettőt ugyanaz a javítás
kezeli:

1. a 12:29 utáni első kérés 401-et kapott volna, és a frissítés helyben elbukott
   (refresh token hiányában **hálózat nélkül** is törli a tárolt adatot) — ez magyarázza,
   miért nincs nyoma a szerveren;
2. a belépési token 8 órás élettartama a 07:40-es belépés után **15:40-kor** járt le —
   pont akkor, amikor a hibát jelezted.

A lényeg: **mindkét esetben az app eddig hallgatott, mostantól kimondja.**

---

## 5. BUILD 9 — elindítva

A javítás **nincs benne a build 8-ban** (az 15:03-kor, a javítás előtt épült). Ezért
elindítottam a build 9-et: iOS TestFlight + Android APK.

---

## 6. EGY MELLÉKES MEGFIGYELÉS

A `checkPasswordExpiry` middleware (90 napos jelszó-elévülés) **meg van írva, de sehová
nincs bekötve** — tehát a jelszó-elévülési szabály ma nem működik. Ez nem része ennek a
hibának, csak jelzem.

---

## ÖSSZEFOGLALÓ

**Elkészült:** a hiba a kliensen van — a szerver ma egyetlen kérést sem utasított el az apptól (0 db nem-200, 0 sikertelen belépés), Eszti ráadásul még build 6-on van. Az ok: sikeres Face ID után az app „a biometrikus azonosítás nem sikerült" üzenetet írt ki, pedig a tárolt belépés járt le, a biometrikus kapcsolót pedig bekapcsolva hagyta — ragadós, kimondatlan állapot. Javítva: külön üzenet 5 nyelven, állandó sáv a belépő képernyőn, jelszavas belépés után a biometrikus adat frissül. Új AUTH functest terület (5 eset), suite 321/0.
**Döntési pont:** a jelszóváltás ma **nem** érvényteleníti a korábbi tokeneket — biztonságilag kellene, de bevezetése minden eszközön kilépteti a felhasználókat. Kérem a döntést.
**Tőled kell:** (1) Eszti most a **jelszavával** lépjen be — ez ma is működik; (2) döntés a fenti tokenérvénytelenítésről.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-faceid-belepes-2026-09-22.md
