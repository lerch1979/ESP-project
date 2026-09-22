# Hibajegy-szignálás — deploy előtti jelentés

**Dátum:** 2026-09-22 · **Állapot:** sandboxban kész, **élesben még NINCS** · **Commit:** `92a52d1d`
**Functest:** 274 passed / 0 failed (új `ASSIGN` terület, 10 eset)

---

## Miért maradt gazdátlan Eszti jegye — három hiba, mindegyik elég volt önmagában

| # | A hiba | Következmény |
|---|---|---|
| 1 | A szabályok `admin` és `facility_manager` szerepkörre mutattak | **Nulla aktív felhasználó** van mindkettőben — mind a négy valódi ember `superadmin` |
| 2 | A „normál hibajegyek" szabály `medium`/`low` prioritásra várt | A rendszer **`normal`** értéket használ — egyetlen szabály sem illeszkedett |
| 3 | A végfogás azonos `contractor_id`-jú admint keresett | Eszti fiókja a **„Housing Solutions Kft"** partnersoron ül, a superadminok a **`00000000-…-0001`** bérlőn — nulla találat |

**A tanulság adja a megoldás felépítését:** minden eddigi ág *feltételes* volt. Elég volt
egy hiányzó szerepkör vagy egy elgépelt slug, és a jegy némán gazdátlan maradt.

---

## 1–2. A szignálási lánc — a vége már nem lehet üres

```
1. szakértelem szerinti szakember      (worker_specializations)
2. a lakó szállásának felelőse         (inspection_schedules)
3. szabály szerinti szerepkör          (assignment_rules)
4. ALAPÉRTELMEZETT FELELŐS             (ticket_assignment_config)  ← feltétel nélküli
```

A 4. lépés **nem függ se szerepkörtől, se bérlőtől, se szabálytól**. Kezdőértéke
**Lerch-Fülöp Eszter**, és **nem a kódba van égetve** — a `ticket_assignment_config`
táblából jön, deploy nélkül átállítható (ezt a `ASSIGN-01` teszt méri is).

**A ház-felelős nem új táblából jön.** A Phase 4-ben az a döntés született, hogy nem
építünk `user_accommodations` hozzárendelő táblát. Az `inspection_schedules` viszont már
ma is pont ezt fejezi ki — `(accommodation_id, default_inspector_id)` —, csak nem volt
feltöltve. Aki a házat ellenőrzi, ismeri a házat; nincs okunk két listát vezetni
ugyanarról az emberről.

## 3. Értesítés — eddig egyáltalán nem létezett

A `ticket_created` értesítés-típus **nem létezett**. Csak a *szignálásról* ment hír, tehát
ha a szignálás elbukott, a jegyről **senki nem tudott**. Mostantól a felelős minden új
jegyről értesül, és **külön hangos üzenetet** kap, ha a szállásadói levél nem tudott
kimenni.

E-mail: amint az SMTP él. Appban már most működik.

## 4. Szállásadói továbbítás

**Új:** `accommodation_maintenance_rules` — ház × kategória → `mi` / `szallasado`.
Külön tábla, mert kategóriánként eltér: a kazán a szállásadóé, a villanykörte a miénk.
Ahol nincs sor, az alapértelmezés `mi` — a korábbi viselkedés.

**A továbbítás nem helyettesíti a szignálást.** A jegy nálunk is felelősnél marad, aki
követi, hogy a szállásadó megcsinálja-e. Ha X napig (alapból 3) nincs visszajelzés, a
felelős jelzést kap.

A szállásadó a lejáró linken **látja a hibát, de nem látja a lakót** — se név, se telefon,
se belső megjegyzés, se előzmény. A karbantartáshoz a hiba kell, nem a személy.
Visszajelzés: **megkaptam / folyamatban / javítva**.

### Negyedik megosztási mechanizmus NEM épült

Ehelyett a meglévő hármat vontam össze, ahogy a 2026-09-03-i döntésed előírta:

| Eddig | Mostantól |
|---|---|
| `accountant_share_links` (mig 117) | `share_links` — `target_type='accountant'` |
| `settlement_share_links` (mig 149) | `share_links` — `target_type='settlement'` |
| `quotes.share_token` (mig 150) | `share_links` — `target_type='quote'` |
| *(új)* hibajegy | `share_links` — `target_type='ticket'` |

A lejárat és a visszavonás mostantól **egyetlen függvényben** dől el mind a négyre.
A régi táblák megmaradnak, de már nem olvas és nem ír beléjük senki — így az átállás
visszagördíthető.

**Az egyesítés indokát menet közben a séma is megerősítette:** a három tábla ugyanazt a
fogalmat más-más oszlopnévvel tárolta (`accessed_count` vs `view_count`,
`last_accessed_at` vs `last_viewed_at`). Élesben összesen 3 sor van bennük, tehát most
volt a legolcsóbb megtenni.

### Egy döntés, amit külön kiemelek

A szállásadó visszajelzése **szándékosan nem kerül a jegy üzenet-idővonalára**. Ott a
`sender_id` kötelező, a szállásadó viszont nem felhasználónk — bármelyik létező user
azonosítójával beírni azt jelentené, hogy **egy kollégánk nevében jelenik meg egy üzenet,
amit nem ő írt**. Egy vitában ez rosszabb, mint ha a bejegyzés nincs ott. A visszajelzés
ezért a jegy saját mezőiben él, és a felelős értesítést kap róla.

## 5. A mostani gazdátlan jegyek

`scripts/assign-orphan-tickets.js` — a **szignálási láncon** vezeti át őket, nem kézi
UPDATE-tel, hogy ugyanaz a logika döntsön, mint egy új jegynél. Élesben ez ma a két jegy
(#19, #20). **Deploy után futtatom**, száraz futással kezdve.

---

## 6. Mi kell tőled az SMTP-hez

**Enélkül a szállásadói e-mailes rész nem él.** Élesben mind a hat változó üres:
`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_USER`, `EMAIL_PASSWORD`, `SMTP_FROM`.

**Amit kérek:**

1. **Egy dedikált postafiók** — javaslatom `hibajegy@housingsolutions.hu`, ne személyes
   fiók. Ha Gmail, **alkalmazásjelszó** kell (kétlépcsős azonosítás mellett), nem a sima
   jelszó.
2. **Négy érték a prod `.env`-be:** `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Ez egyben a régóta nyitott tételt is megoldaná: az **ütemezett riportok e-mailjei**
ugyanezért nem kézbesülnek ma.

### A második, kevésbé látható blokkoló

| | |
|---|---|
| szállásadó partner | **19** |
| ebből van e-mail a partneren | **2** |
| elsődleges kapcsolattartó e-mail címmel | **1** |

Tizenkilenc szállásadóból **egyetlen egyhez** van olyan elsődleges kapcsolattartónk,
akinek e-mail címe is van. Ha az SMTP-t ma beállítanád, a funkció **18 szállásadónál akkor
is néma maradna**. Készíthetek kitöltő Excelt a kapcsolattartókhoz — szólj.

---

## Amit még NEM építettem meg

- **Felület a karbantartási mátrixhoz** (ház × kategória → mi/szállásadó). A tábla és a
  logika kész, de ma csak SQL-ből tölthető. Enélkül a 4. pont élesben nem kapcsol be,
  mert nincs egyetlen `szallasado` sor sem.
- **Felület az alapértelmezett felelős átállításához.** Ma is átállítható, de SQL-ből.
- **A tényleges levélküldés.** A link és a jelölés elkészül, de az `email.service` ma csak
  számlaküldést tud — generikus küldő kell hozzá. Az SMTP hiánya miatt ez ma úgysem élne.
- **Az X napos emlékeztető ütemezése.** A lekérdezés kész
  (`overdueWithoutResponse()`), a cron-bekötés nincs.

---

## Deploy

Push megtörtént, CI-t nem vártam meg. A deploy a jóváhagyásodra vár:

```
push → CI → backup → pull && up -d → mig 170 a runnerrel
```

**Amire figyelj:** a mig 170 hozzányúl a megosztási linkekhez. Élesben 2 könyvelői + 1
elszámoló-lapi link van, ezek átmásolódnak az egyesített táblába. A régi táblák
megmaradnak, tehát ha bármi gond van, visszagördíthető.

Deploy után futtatom: a gazdátlan jegyek rendezését, és ellenőrzöm, hogy a két meglévő
könyvelői link és az elszámoló-lapi link továbbra is megnyílik.
