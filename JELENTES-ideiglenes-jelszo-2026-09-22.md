# Ideiglenes jelszó: minimum, generált javaslat, 30 napos lejárat

**Dátum:** 2026-09-22 · **Élesítve:** igen · **Teljes functest:** 349 passed / 0 failed

**Mindkét kiegészítés belefért** — a 2. pont nem volt nagyobb munka, mert nem kellett
hozzá új adatbázis-oszlop (lásd a 3. fejezetet).

---

## 1. A MINIMUM — 8 karakter, karakterosztály nélkül

Ahogy jóváhagytad. **A célfelhasználó besorolásától függetlenül**, tehát akkor is, ha a
fiók a szigorú ágra tartozik.

> Ha itt a szigorú szabályt kérnénk, az adminisztrátor nem tudna papírra írható,
> telefonon felolvasható jelszót adni. A valódi szabályt úgyis az első **kötelező csere**
> érvényesíti, a felhasználó saját besorolása szerint.

Érvényes **mindkét** admin úton: felhasználó létrehozása és jelszó-visszaállítás.

---

## 2. A GENERÁLT JAVASLAT

### Hol találod

> **Felhasználók** → „Új felhasználó" (vagy egy meglévő szerkesztése) →
> az **„Ideiglenes jelszó"** mező mellett a **„Javaslat"** gomb.

Egy kattintás, és a mező kitöltődik. Példák élesből:

```
sufe-vefu-88      megu-rave-62      mare-maga-54
kave-vafu-87      nuge-cega-38      huda-rafe-38
```

### Miért így néz ki

Ezt a jelszót **papírra írjuk**, és egy lakó gépeli be **telefonon, idegen
anyanyelvvel**, esetleg gyenge fényben. Egy `xK9mL2pQ` ott nem biztonság, hanem három
sikertelen próbálkozás és egy telefonhívás az irodába.

| döntés | miért |
|---|---|
| **csak kisbetű** | az O/0 és az l/1/I összetéveszthetősége fel sem merül, és nincs shift-nyomkodás a telefon billentyűzetén |
| **nincs 0 és 1 számjegy** | ezek a leggyakoribb félreolvasások |
| **nincs `i` és `o` betű** | kézírásban az `i` az 1-re, az `o` a 0-ra hasonlít — **a papír a gyenge láncszem, nem a képernyő** |
| **csak angol ábécé, semmi ékezet** | a lakók ukrán, filippínó és német billentyűzetet használnak; ott egy `ü` nem elgépelés kérdése, hanem azé, hogy **megtalálja-e a billentyűt egyáltalán** |
| **szótagokból épül** | egy ember fel tudja olvasni telefonon, és vissza tudja keresni, ha elvesztette a sorát |
| **kötőjelekkel tagolt** | a 12 karakter ne egy összefolyó massza legyen |

*(Az ékezetmentesség menet közben derült ki: az első változat `ü`-t is használt — az
ukrán vagy filippínó billentyűzeten ez elakadás lett volna.)*

**Erősség:** 45 szótag, 45⁴ × 64 ≈ **262 millió** kombináció. A 10 próba / 15 perc
zárolás mellett naponta ~960 próba — több százezer év.

**A generálás a szerveren történik**, nem a böngészőben: így a szabály egy helyen él.
Egy böngészőbeli másolat idővel olyan jelszót ajánlana, amit a mentés aztán elutasít.
(`crypto.randomInt`, nem `Math.random` — ez hitelesítő adat, nem megjelenítési sorrend.)

### Egy apró, de fontos döntés az űrlapon

A jelszómező típusa mostantól **`text`, nem `password`** — a jelszó **látszik**.

> Ezt a jelszót az adminisztrátor **papírra írja és átadja**. Ha csillagozva látja, nem
> tudja leírni — és ilyenkor a gyakorlat az lesz, hogy „Jelszo123"-at gépel be, mert azt
> legalább meg tudja jegyezni. A titkosság itt nem a képernyőn múlik: a jelszó úgyis
> kézen-közön megy. Épp ezért ideiglenes, ezért jár le, és ezért kötelező lecserélni.

---

## 3. A 30 NAPOS LEJÁRAT

**Nem volt nagyobb munka, mert nem kellett hozzá új oszlop** — és ez nem ügyeskedés,
hanem a helyes megoldás:

- a `must_change_password` mondja meg, hogy a jelszó **még az adminisztrátoré**,
- a `password_changed_at` pedig azt, **mikor adta**.

A kettő együtt pontosan az, amit tudni kell. Egy külön lejárat-oszlop csak egy harmadik
hely lenne, ahol elcsúszhat az igazság.

### A lejáratot KÉT helyen nézzük

**a) A bejelentkezésnél** — 403, `TEMP_PASSWORD_EXPIRED` kóddal.

**b) A munkamenetben is** (`authenticateToken`). Csak a bejelentkezést őrizni nem elég:

> Aki a 29. napon belépett, a refresh tokenjével (30 nap) a lejárat **után** is
> dolgozhatna tovább — és pont az a jelszó tartaná életben, amit érvénytelennek
> nyilvánítottunk.

A csere sem járható út ilyenkor: **lejárt ideiglenes jelszóból nem lehet saját jelszót
csinálni**, mert nem tudjuk, ki tartja a papírt. Új jelszót az adminisztrátor ad.

**Mindkét ellenőrzés a jelszó vizsgálata ELŐTT fut.** Utána a *helyes* ideiglenes jelszó
is „hibás email vagy jelszó"-t adna, és a lakó azt hinné, rosszul olvasta le a papírról.

### Élő próba

```
5 napos ideiglenes   ->  200  Sikeres bejelentkezés
31 napos ideiglenes  ->  403  TEMP_PASSWORD_EXPIRED
                            "Az ideiglenes jelszó lejárt. Kérj újat a szállásfelelősödtől…"
```

### Az üzenet 5 nyelven

A teendő gyökeresen más, mint a zárolásnál — ott **várni** kell, itt **új jelszót kérni**
—, ezért külön mondatot kapott:

> **Az ideiglenes jelszó lejárt**
> A papíron kapott jelszó már nem érvényes — 30 nap után lejár. Kérj újat a
> szállásfelelősödtől vagy az irodától. A régi jelszót dobd ki.

---

## 4. TESZTEK — az AUTH terület 25 → 30 esetre nőtt

```
AUTH-26  a generált jelszó papírról GÉPELHETŐ — 3000 mintán: nincs 0/O, 1/l/i, ékezet,
         csak ASCII, mind érvényes, mind egyedi
AUTH-27  az ADMIN nem adhat 8 karakternél rövidebb ideiglenes jelszót
AUTH-28  ⚠️ a 30 napnál régebbi ideiglenes jelszóval nem lehet belépni (5 napos még jó)
AUTH-29  a lejárt ideiglenes jelszóval szerzett KORÁBBI munkamenet sem él tovább
AUTH-30  a javaslat-végpont a saját szabályának megfelelő jelszót ad
```

**349 passed / 0 failed**, háromszor egymás után. i18n-őr zöld.

Ellenőriztem a **deployolt** admin csomagot is: `Users-_vDVGrCH.js` tartalmazza a
„Javaslat" gombot, az `index-CCAVFLOF.js` a `temp-password` hívást.

---

## 5. A MOBIL BUILD — amit TÉNYKÉNT kell kimondanom

A build 12 a `8fbb61a6` commitból készült, **vagyis a lejárt ideiglenes jelszó 5 nyelvű
üzenete NINCS benne** — az a mai utolsó commitban (`dc0e479a`) jött.

**Beküldtem a 12-est a TestFlightra**, mert amit visz, az most számít (jelszóváltó
képernyő, kötelező első csere, a zárolás 5 nyelvű üzenete), és mert **ez a hiány ma
senkit nem érint**: élesben **0 fiók** van ideiglenes jelszóval, tehát a lejárati üzenet
leghamarabb 30 nappal az első ilyen fiók létrehozása után jelenhetne meg. Addig lesz
újabb build.

| | build 12-ben | következő buildben |
|---|---|---|
| jelszóváltó képernyő | ✅ | |
| kötelező csere az első belépéskor | ✅ | |
| zárolás üzenete 5 nyelven | ✅ | |
| jelszó-követelmény a szervertől | ✅ | |
| **lejárt ideiglenes jelszó üzenete 5 nyelven** | ❌ | ✅ |

---

## ÖSSZEFOGLALÓ

**Elkészült:** mindkét kiegészítés, plusz a 8 karakteres minimum. Az ideiglenes jelszót a rendszer felajánlja, papírról gépelhető alakban (`kave-vafu-87` — csak kisbetű, se 0/O, se 1/l/i, **semmi ékezet**, mert a lakók ukrán és filippínó billentyűzetet használnak), és **30 nap után lejár** — a bejelentkezésnél ÉS a már élő munkamenetben is. Élő próbával igazolva: 5 napos → 200, 31 napos → 403. AUTH 25 → 30 eset, suite **349/0**. Megtalálod: **Felhasználók → „Új felhasználó" → az „Ideiglenes jelszó" mező melletti „Javaslat" gomb**.
**Döntési pont:** nincs.
**Tőled kell:** semmi. Egy dolgot tényként mondok: a **lejárt ideiglenes jelszó 5 nyelvű üzenete nincs benne a build 12-ben** (az a mai utolsó commitban jött) — ma ez senkit nem érint, mert 0 fiók van ideiglenes jelszóval, de a következő buildbe bele kell kerülnie.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-ideiglenes-jelszo-2026-09-22.md
