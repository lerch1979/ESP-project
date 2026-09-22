# Jelszószabály és fiókzárolás — bekötve, szerepkör szerint elágazva

**Dátum:** 2026-09-22 · **Élesítve:** igen · **Teljes functest:** 343 passed / 0 failed

---

## 0. ELŐSZÖR A KÉRDÉSEDRE

**A több érintett lakó vizsgálata LEFUTOTT**, az előző körben. Az eredmény röviden:

- A választó **sehol nem volt** az admin felületen — sem az új-jegy űrlapon, sem a
  szerkesztésnél. A deployolt bundle 110 JS fájljában nulla találat volt rá.
- Megépítettem **mindkét űrlapra**, és hozzá a backend szerkesztő útját is, ami szintén
  nem létezett.
- Élesben végigpróbálva: létrehozás 2 érintettel (201), lakó levétele (2 → 1 fő),
  ház-hatókörre váltás (`scope=accommodation`, névsor **0**).
- Megtalálod: **Hibajegyek → „Új hibajegy" → az űrlap alján „Kit érint még?"**

Részletek: `~/Desktop/HR-ERP-PROJECT/JELENTES-tobb-erintett-lako-admin-2026-09-22.md`

---

## 1. A BESOROLÁS — és miért a jogosultságból jön

A `passwordScope.js` két szintet ismer:

| szint | kik | miért |
|---|---|---|
| **szemelyzet** | szuperadmin, admin, **vagy akinek bármilyen `finance.*` joga van** | ~300 ember személyes és pénzügyi adatához férnek hozzá |
| **lako** | mindenki más | papírról, telefonon, öt nyelven gépel |

**A pénzügyi jog dönt, nem a szerepkör NEVE.** Egy később létrehozott szerepkör, ami
`finance.*` jogot kap, **magától** a szigorú ágra kerül — nem kell hozzá senkinek eszébe
jutnia, hogy ezt a fájlt is frissítse. A hallgatólagos kimaradás okozza a legtöbb
jogosultsági rést.

**Besorolási hiba esetén a szigorúbb ág lép életbe:** egy elérhetetlen
jogosultság-lekérdezés nem lazíthat a szabályon.

### Így néz ki élesben, mind a 9 fiókra

```
SZEMÉLYZET  12 kar +osztályok  admin@hr-erp.com                       (superadmin)
SZEMÉLYZET  12 kar +osztályok  fulop.eszter87@gmail.com               (superadmin)
SZEMÉLYZET  12 kar +osztályok  lerchbalazs@gmail.com                  (superadmin)
SZEMÉLYZET  12 kar +osztályok  noemi@virtualis-asszisztens-online.hu  (superadmin)
lakó         8 kar             eszti.teszt@housingsolutions.hu        (accommodated_employee)
lakó         8 kar             ios.teszt@housingsolutions.hu          (accommodated_employee)
lakó         8 kar             teszt.lakos@housingsolutions.hu        (accommodated_employee)
lakó         8 kar             rejtekkozert@gmail.com                 (maintenance_worker)  ⚠️
lakó         8 kar             timcsilak@gmail.com                    (task_owner)          ⚠️
```

⚠️ **Ez a két fiók a definíciód kiskapujában van** — erről lásd a 6. fejezetet.

---

## 2. A JELSZÓSZABÁLY

| | személyzet | lakó |
|---|---|---|
| hossz | **12 karakter** | **8 karakter** |
| karakterosztályok | **nagybetű + kisbetű + szám + speciális** | nem kötelező |
| gyakori jelszavak tiltása | igen | – |
| ne egyezzen a jelenlegivel | **igen** | **igen** |

A „ne egyezzen a jelenlegivel" **mindkét** ágra érvényes, és a kötelező cserénél ez a
lényeg: ott a jelenlegi jelszó **AZ ideiglenes**, amit más is ismer.

---

## 3. A ZÁROLÁS — mindkét ág IDŐALAPÚ

| | személyzet | lakó |
|---|---|---|
| hány rossz próba után | **5** | **10** |
| meddig tart | **30 perc** | **15 perc** |
| feloldás | **magától** | **magától** |

**Egy véglegesen zárolt lakói fiók azt jelentené, hogy a lakónak minden elgépelés után
telefonálnia kell az irodába** — este tizenegykor, idegen nyelven. Az ilyen szabályt nem
betartják, hanem megkerülik: a jelszó felkerül egy papírra, vagy közösen használnak egy
fiókot.

### Két döntés a részletekben

**a) A zárolást a jelszó ELŐTT nézzük.** Fordított sorrendben egy zárolt fiókon a
**helyes** jelszó is „hibás email vagy jelszó"-t adna, és a felhasználó azt hinné,
elfelejtette a jelszavát.

**b) A hibaüzenet NEM árulja el, hány próba van hátra.** Aki próbálgat, abból tudná,
mikor álljon meg a zárlat elkerüléséhez; a valódi felhasználónak pedig nem segít, mert ő
nem próbálgat, hanem elgépelt.

---

## 4. AZ ÜZENET — 5 nyelven

A szerver **423**-mal tér vissza, `ACCOUNT_LOCKED` kóddal és a **hátralévő percekkel**.
Egy időtartam nélküli „zárolva" ugyanolyan tehetetlenné tesz, mintha végleges lenne.

**Mobilon**, a lakó saját nyelvén (hu/en/uk/tl/de):

> **A fiók átmenetileg zárolva**
> Túl sok sikertelen próbálkozás miatt a fiók **15 percre** zárolva. Várj ennyit, utána
> **MAGÁTÓL feloldódik** — nem kell segítséget kérned. Ha nem emlékszel a jelszavadra,
> szólj a szállásfelelősnek.

**Az adminban** a 423 külön ágat kapott: a 401-től gyökeresen más a teendő — ott újra
kell próbálni, itt **várni**.

### A követelmény szövege is a szervertől jön

A két felület eddig fix „legalább 8 karakter"-t írt ki — ami a **személyzetnek egyszerűen
nem igaz**, és zöldnek látszó jelszóval futottak volna bele egy szerveroldali
elutasításba. Mostantól a `password_rule` mező (login + `/auth/me`) mondja meg, mit vár a
szerver, és a felület azt írja ki.

---

## 5. A 90 NAPOS CSERE — nem él, és teszt őrzi

A kérésed szerint **nem kapcsoltam be.** A `checkPasswordExpiry` middleware megmaradt, de
sehol nem fut, és ezt **teszt rögzíti** (AUTH-21): ha valaki később bekötné, a teszt
elbukik, és a döntést ki kell mondani.

*(Az indok a kódban is ott van: az időszakos kényszercsere a gyakorlatban gyengébb
jelszavakhoz vezet — jelszo1 → jelszo2 → … —, nem erősebbekhez.)*

---

## 6. ⚠️ EGY DÖNTÉS, AMI RÁD TARTOZIK

A definíciód: *„szuperadmin, admin, és akinek pénzügyi joga van"*. **Pontosan ezt
építettem meg.** Ebből viszont két fiók a **megengedő** ágra került:

| fiók | szerepkör | mit lát | most |
|---|---|---|---|
| `rejtekkozert@gmail.com` | `maintenance_worker` | karbantartási jegyek: lakók neve, szállás, szoba | 8 kar, 10 próba / 15 perc |
| `timcsilak@gmail.com` | `task_owner` | feladatok, hozzájuk rendelt személyek | 8 kar, 10 próba / 15 perc |

**Ők nem lakók** — nem papírról gépelnek, nem idegen nyelven, és nem az első képernyőn
találkoznak a jelszóval. Viszont pénzügyi joguk sincs, tehát a definíciód szerint a
megengedő ágra esnek.

A **szállásfelelős** ugyanide fog esni, amikor élesítjük — és neki a te állandó kikötésed
szerint **soha nem lesz pénzügyi joga**, tehát sosem kerül át magától a szigorú ágra.

**Három lehetőség:**

1. **Marad így** — a definíciód szó szerint. Egyszerű, de a szállásfelelős 8 karakteres
   jelszóval fér hozzá 300 ember lakhatási adatához.
2. **A szigorú ág feltétele bővül:** „nem lakó" = személyzet. Vagyis minden szerepkör a
   szigorú ágra kerül, kivéve az `accommodated_employee`-t.
3. **Középút:** külön, harmadik szint a nem-pénzügyes személyzetnek (pl. 10 karakter,
   karakterosztály nélkül, 7 próba / 20 perc).

**Javaslom a 2-est.** A megengedő szabály indoka kizárólag a lakók helyzete volt (papír,
telefon, idegen nyelv, első képernyő); akire ez nem áll, arra az indok sem áll.

---

## 7. ÉLES PRÓBA

Teszt fiókon (`ios.teszt`), a takarítással együtt:

```
 1. próba ->  401
 9. próba ->  401
10. próba ->  423  ACCOUNT_LOCKED  15 perc
üzenet     ->  "Túl sok sikertelen próbálkozás miatt a fiók 15 percre zárolva…"
adatbázis  ->  próbák: 10 | zárlat vége: 18:16:00
takarítva.
```

A functestben végpont-szintű bizonyíték is van rá, hogy a zárlat alatt a **helyes**
jelszó sem enged be (AUTH-22).

---

## 8. TESZTEK — az AUTH terület 15 → 24 esetre nőtt

```
AUTH-16  SZEMÉLYZET: 12 karakter és négy karakterosztály kell
AUTH-17  LAKÓ: 8 karakter elég, karakterosztály NEM kötelező
AUTH-18  a besorolás a PÉNZÜGYI JOGBÓL jön, nem a szerepkör nevéből
AUTH-19  a zárolás IDŐALAPÚ és megmondja, MEDDIG tart
AUTH-20  a LEJÁRT zárolás magától feloldódik
AUTH-21  a 90 napos kötelező csere NINCS bekötve
AUTH-22  VÉGPONT-SZINTŰ: 10 rossz próba után zárol, és a JÓ jelszó sem enged be
AUTH-23  a hibaüzenet NEM árulja el, hány próba van hátra
AUTH-24  a szerver MEGMONDJA a kliensnek, milyen jelszót vár
```

**343 passed / 0 failed**, háromszor egymás után. i18n-őr zöld.

---

## ÖSSZEFOGLALÓ

**Elkészült:** a `passwordPolicy.js` bekötve, szerepkör szerint elágazva — személyzet (szuperadmin, admin, pénzügyi jog): 12 karakter + négy osztály, 5 próba / 30 perc; lakó: 8 karakter, 10 próba / 15 perc. Mindkét zárolás **időalapú**, magától feloldódik, és a felhasználó megkapja a hátralévő perceket — a lakó a saját nyelvén, 5 nyelven. A 90 napos csere kérésed szerint **nem él**, és ezt teszt őrzi. Élesítve, élő próbával igazolva (10. próba → 423, 15 perc). AUTH 15 → 24 eset, suite **343/0**.
**Döntési pont:** két fiók (`maintenance_worker`, `task_owner`) a definíciód szerint a **megengedő** ágra esett — és a szállásfelelős is ide fog, mert neki a kikötésed szerint sosem lesz pénzügyi joga. Maradjon így, vagy a szigorú ág feltétele legyen „nem lakó"? **A másodikat javaslom:** a megengedő szabály indoka (papír, telefon, idegen nyelv) rájuk nem áll.
**Tőled kell:** döntés a fenti három lehetőség közül (6. fejezet).
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-jelszoszabaly-zarolas-2026-09-22.md
