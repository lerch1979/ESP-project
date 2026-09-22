# A szigorú jelszóág feltétele: „NEM lakó"

**Dátum:** 2026-09-22 · **Élesítve:** igen · **Teljes functest:** 344 passed / 0 failed

---

## 1. AZ ELLENŐRZÉS, AMIT KÉRTÉL — nem zár ki senkit

**Ez volt a kérdés, ezért ezzel kezdem.**

A jelszószabály **egyetlen** helyen fut a teljes kódbázisban: a jelszóváltásnál
(`changeOwnPassword`). A belépés csak `bcrypt.compare`-t végez — **semmilyen szabályhoz
nem méri a meglévő jelszót.**

| | méri-e a szabályhoz? |
|---|---|
| `POST /auth/login` | **nem** — csak a hash egyezését nézi |
| `POST /auth/change-password` | **igen** — itt kell megfelelni |

Vagyis pontosan az történik, amit kértél: **akinek a mostani jelszava nem felel meg az új
szabálynak, az nincs kizárva — a KÖVETKEZŐ jelszóváltásnál kell megfelelnie.**

### Élő bizonyíték (nem sandbox)

Egy teszt fiókon előállítottam pont a félt helyzetet — szigorú ág + szabálytalan
meglévő jelszó —, majd visszaállítottam:

```
a fiók most: szemelyzet | a jelszava: "rovid12" (7 karakter, szabálytalan)
belépés a RÉGI jelszóval -> 200  BEENGEDTE (nincs kizárás)
visszaállítva.
```

### És teszt is őrzi (AUTH-25)

```
AUTH-25  ⚠️ a SZIGORÍTÁS NEM ZÁRJA KI a meglévő fiókokat
         szigorú ág + 7 karakteres meglévő jelszó
           → belépés        : 200
           → jelszóváltás   : 400  (a következő cserénél már meg kell felelnie)
```

Ha valaki később a belépésbe is beépítené a szabály-ellenőrzést, ez a teszt bukik el.

---

## 2. AZ ÚJ HATÁR

| | régi (pénzügyi jog) | **új (nem lakó)** |
|---|---|---|
| `lako` | akinek nincs `finance.*` joga | **kizárólag** akinek egyetlen szerepköre `accommodated_employee` |
| `szemelyzet` | superadmin, admin, `finance.*` | **mindenki más** |

**Három fontos részlet:**

1. **A szerepkör nélküli fiók is szigorú.** Nem tudjuk, mit érhet el — nem feltételezünk
   róla a kedvezőbbet.
2. **Aki lakó ÉS valami más is, az szigorú.** A szigorúbb hozzáférés dönt, nem a
   kedvezőbb.
3. **A lista fordítva működik, mint előtte — és ez a lényeg.** Nem azt soroljuk fel, ki
   szigorú (ott egy új szerepkör csendben kimaradna), hanem azt, ki **nem** az. Egy
   később létrehozott szerepkör így **alapértelmezésben** a szigorú ágra kerül: a
   kimaradás iránya a biztonság felé mutat, nem attól el.

Ez utóbbi pontosan az a hiba volt, ami a régi besorolásban benne volt: a szállásfelelős
sosem került volna át magától, mert a te állandó kikötésed szerint **sosem lesz pénzügyi
joga**.

---

## 3. A BESOROLÁS ÉLESBEN, MIND A 9 FIÓKRA

```
SZIGORÚ  12 kar +osztályok  superadmin             admin@hr-erp.com
SZIGORÚ  12 kar +osztályok  superadmin             fulop.eszter87@gmail.com
SZIGORÚ  12 kar +osztályok  superadmin             lerchbalazs@gmail.com
SZIGORÚ  12 kar +osztályok  superadmin             noemi@virtualis-asszisztens-online.hu
SZIGORÚ  12 kar +osztályok  maintenance_worker     rejtekkozert@gmail.com     ← átkerült
SZIGORÚ  12 kar +osztályok  task_owner             timcsilak@gmail.com        ← átkerült
lakó      8 kar             accommodated_employee  eszti.teszt@housingsolutions.hu
lakó      8 kar             accommodated_employee  ios.teszt@housingsolutions.hu
lakó      8 kar             accommodated_employee  teszt.lakos@housingsolutions.hu
```

**6 / 9 fiók a szigorú ágon.** A jövőbeli szállásfelelős szintén ide fog kerülni,
automatikusan.

---

## 4. EGY EGYSÉGESÍTÉS, AMI MENET KÖZBEN KELLETT

A login válaszában a `password_rule` mezőt eddig egy **ott megismételt** feltétel
számolta ki (superadmin / admin / `finance.*`). Ha ezt otthagyom, a besorolás két helyen
élne, és a mostani változtatás után a **felület mást ígért volna, mint amit a szerver
elfogad** — a személyzet 8 karaktert látna, aztán elutasítást kapna.

Most mindkét hely a `scopeFor`-t hívja.

---

## 5. TESZTEK

```
AUTH-18  csak a LAKÓ megengedő — mindenki más, és a szerepkör nélküli is, szigorú
         (valódi adaton mérve: karbantartóvá tett fiók + szerepkör nélküli fiók)
AUTH-25  ⚠️ a SZIGORÍTÁS NEM ZÁRJA KI a meglévő fiókokat
```

**344 passed / 0 failed**, négyszer egymás után.

---

## 6. EGY GAP, AMIT NEM ZÁRTAM BE — döntést igényel

**Az adminisztrátor által beállított ideiglenes jelszóra ma SEMMILYEN szabály nem
vonatkozik.** A `PUT /users/:id` `password` mezője validálás nélkül megy át: egy
háromkarakteres ideiglenes jelszó is beállítható.

Ez nem katasztrófa — a jelszó ideiglenes, és a `must_change_password` úgyis
kikényszeríti a cserét az első belépéskor —, de a papíron kiadott jelszó addig él, amíg
a lakó be nem lép, ami napok is lehetnek.

**Nem építettem meg, mert valódi döntés van benne:** milyen bar legyen? Ha a teljes
szigorú szabályt kérnénk, az adminisztrátor nem tud kézzel begépelni egy papírra írható,
felolvasható jelszót. **Javaslatom: 8 karakteres minimum, karakterosztály nélkül** —
ugyanaz, mint a lakói szabály, függetlenül a célfelhasználó besorolásától, mert a valódi
szabályt úgyis az első kötelező csere érvényesíti.

---

## 7. A MOBIL BUILD — a 11-es nem elég, a 12-es megy ki

A build 11 iOS-en elkészült, de a `e9939f33` commitból — **vagyis nincs benne a zárolás
5 nyelvű üzenete**, az a következő commitban (`8716633f`) jött. A zárolás viszont
**élesben már működik**, tehát egy lakó ma a magyar szerverüzenetet kapná.

Mivel a 11-est **még nem küldtem be** a TestFlightra, nem kell két buildet kiadni: a
11-est nem küldöm be, helyette elindítottam a 12-est, amiben minden benne van.

**Mit visz a build 12:**

1. jelszóváltó képernyő (Egyéb → Jelszó módosítása)
2. kötelező jelszócsere az első belépéskor, az onboarding előtt
3. **a zárolás üzenete 5 nyelven**, a hátralévő percekkel
4. a jelszó-követelmény szövege a szervertől (a személyzet a 12 karaktert és a
   karakterosztályokat látja, nem a 8-at)
5. az előző körökből: chat-kép, push-javítások, teendőlista, közös jegyek, Face ID

---

## ÖSSZEFOGLALÓ

**Elkészült:** a szigorú ág feltétele „NEM lakó" — `lako` kizárólag az, akinek egyetlen szerepköre `accommodated_employee`; a szerepkör nélküli fiók, a vegyes szerepkörű és minden jövőbeli új szerepkör alapértelmezésben szigorú. Élesben a 9 fiókból 6 került a szigorú ágra (a karbantartó és a feladat-felelős átkerült). **A kizárás-ellenőrzés megtörtént és negatív:** a szabály egyetlen helyen fut, a jelszóváltásnál — élő próbával igazolva, hogy szigorú ágon egy 7 karakteres meglévő jelszóval a belépés **200**, a következő csere viszont **400**. Teszt is őrzi (AUTH-25). Suite **344/0**. Megtalálod: **fejléc-menü (jobb felül) → „Jelszó módosítása"**, mobilon **Egyéb → Jelszó módosítása** — ez utóbbi a telefonokra a **build 12**-vel jut ki, ami most fut.
**Döntési pont:** az adminisztrátor által beállított **ideiglenes** jelszóra ma semmilyen minimum nem vonatkozik (egy háromkarakteres is beállítható). Javaslom a 8 karakteres minimumot, karakterosztály nélkül.
**Tőled kell:** döntés a fenti ideiglenes-jelszó minimumról.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-jelszo-besorolas-nem-lako-2026-09-22.md
