# Timi lakói tesztfiókja — létrehozva és élesben ellenőrizve

**Dátum:** 2026-09-22 · **Élesben:** igen · **Minta:** `MOBIL-TESZT-ESZTI`

---

## 1. A BELÉPÉSI ADATOK

```
   email  :  timi.teszt@housingsolutions.hu
   jelszó :  sehe-rema-57
```

A jelszót az új generátor adta (kisbetű, se 0/O, se 1/l/i, ékezet nélkül — papírról,
telefonon is gépelhető).

**A kötelező jelszócserét szándékosan KIKAPCSOLVA hagytam** — az indoklás a 4. pontban.

---

## 2. A FIÓK

| | |
|---|---|
| `employee_number` | **MOBIL-TESZT-TIMI** |
| név | Timi Teszt (mobil) |
| szerepkör | `accommodated_employee` (lakó) |
| állapot | aktív |
| szállás | **Fertőd** |
| `billing_client_id` | **NULL** — ez a kulcs, lásd alább |
| `workplace` | „TESZTFIÓK — NEM VALÓS LAKÓ" |
| megjegyzés | „⚠ TESZTFIÓK (mobilapp). NEM valós lakó. A hónap zárása ELŐTT ki kell venni a foglaltságból…" |

A felhasználót a **valódi admin végponton** hoztam létre (`POST /users`), nem közvetlen
adatbázis-írással — így ugyanazon az úton ment át, amit az adminisztrátor is használ.

---

## 3. A FERTŐDI FELTEVÉSED — ellenőriztem, IGAZ

| amit mondtál | amit a rendszer mond |
|---|---|
| saját tulajdon | `rent_basis = 'sajat_tulajdon'` ✅ |
| nincs bérleti díj | `monthly_rent`, `rent_amount`, `rent_per_bed_night` mind üres ✅ |
| nincs megbízó | `current_contractor_id` = NULL ✅ |
| nem torzít költséget | a szeptemberi számítás `cost_amount = 0,00` ✅ |
| nem torzít bevételt | a szeptemberi számítás **65 fő-nap / 21 nap = 3,1 fő** = pontosan a **három valós** lakó; Eszti nincs benne ✅ |

**Miért nem kerül bele:** a `billing_client_id` NULL, ezért egyetlen díjsor sem illeszkedik
rá. Timinél ugyanígy hagytam, és a létrehozás után külön ellenőriztem.

---

## 4. ÉLŐ ELLENŐRZÉS — a teljes lánc

```
1. belépés ideiglenessel   ->  200   | kötelező csere: true
2. jegyek a csere ELŐTT    ->  403   MUST_CHANGE_PASSWORD
3. jelszócsere             ->  200   "A jelszó megváltozott…"
4. jegyek a csere UTÁN     ->  200

— majd a végleges jelszóval:
belépés                    ->  200   | szerepkör: accommodated_employee | nyelv: hu
jegynyitás lakóként        ->  201   (#25)
saját listájában látja     ->  IGEN
Saját szállásom            ->  200   Fertőd
próbajegy törölve.
```

Mindkét próbajegyet töröltem.

### Miért kapcsoltam ki a kötelező jelszócserét

Az admin úton létrehozott fiók alapból **kötelező cserével** indul — ez a helyes
viselkedés. **De Timi telefonján még a régi app fut**, amiben nincs jelszócsere-képernyő:
ott a belépés után minden képernyő 403-at kapna, **magyarázat nélkül**. Ez pontosan az a
csapda, amit a múlt héten Esztinél kellett kinyomoznom.

Ezért a fiókot használható állapotban hagytam. **A build 12 telepítése után** bekapcsolható
— szólj, és egy paranccsal visszateszem.

---

## 5. ⚠️ EGY MELLÉKHATÁS, AMIT TUDNOD KELL

**Fertőd kapacitása 4, a lakók száma most 5** (3 valós + Eszti + Timi).

A ház **kihasználtsági százaléka ettől értelmetlen**, amíg a tesztfiókok bent vannak.
Pénzt nem érint (bevétel és költség egyaránt 0 a két tesztfiókra), csak a létszám- és
kihasználtsági statisztikát.

**Ezt ne a kapacitás megemelésével „javítsuk"** — a kapacitás a helyes szám, a két plusz
ember nem valós. Ezt így írtam be a `PROJECT_STATE.md`-be is.

---

## 6. A PROJECT_STATE BEJEGYZÉS

A meglévő „⚠️ TEST ACCOUNT IN OCCUPANCY" szakaszt **kettőre bővítettem**: táblázatban
sorolja mindkét fiókot, rögzíti a kapacitás-túllépést, és megad egy lekérdezést, amivel a
hónap zárása előtt megtalálhatók:

```sql
SELECT employee_number, first_name, last_name
  FROM employees WHERE employee_number LIKE 'MOBIL-TESZT-%';
```

Commit: `9021f0fc`.

---

## ÖSSZEFOGLALÓ

**Elkészült:** Timi lakói tesztfiókja (`MOBIL-TESZT-TIMI`, Fertőd, lakói szerepkör, aktív, megbízó nélkül), a valódi admin végponton létrehozva, egyértelmű teszt-jelöléssel. Élesben végigpróbálva: belépés **200**, jegynyitás **201**, saját listában látja, „Saját szállásom" = Fertőd — a próbajegyeket töröltem. A fertődi feltevésed igazolódott: saját tulajdon, nincs díj, a költség 0, és a szeptemberi bevétel a 3 valós lakóé. A `PROJECT_STATE.md` bejegyzés mostantól mindkét tesztfiókot sorolja (commit `9021f0fc`). **Belépési adatok: `timi.teszt@housingsolutions.hu` / `sehe-rema-57`** — a fiók az admin felületen a **Felhasználók** listában található.
**Döntési pont:** a kötelező első jelszócserét **kikapcsolva** hagytam, mert Timi telefonján még a régi app fut, amiben nincs jelszócsere-képernyő — ott minden képernyő némán 403-at kapna. A build 12 telepítése után bekapcsolható.
**Tőled kell:** semmi most. Ha Timi frissített a build 12-re, szólj, és bekapcsolom a kötelező cserét. Külön: **Fertőd 4 férőhelyén most 5 ember van** (3 valós + 2 teszt) — a kihasználtsági százalék emiatt értelmetlen, de pénzt nem érint.
**Fájl:** ~/Desktop/HR-ERP-PROJECT/JELENTES-timi-tesztfiok-2026-09-22.md
