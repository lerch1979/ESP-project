# Három tesztelési észrevétel — vizsgálat és javítás

**Dátum:** 2026-09-22 · **Commit:** `c25a0664` · **Functest:** 309 passed / 0 failed
**Állapot:** sandboxban kész, **élesben még NINCS**

---

## 1. PUSH NEM ÉRKEZIK — **nem az APNs volt a hiba**

### A diagnosztika (új `scripts/push-diagnose.js`, élesben futtatva)

| Lépcső | Eredmény |
|---|---|
| Token | ✅ érvényes Expo-formátum, ios/iPhone |
| **Expo TICKET** | ✅ `status=ok`, id=`01a0c911-…` |
| **Expo RECEIPT** | ✅ **`status=ok`** — az APNs kézbesítette |

**Az APNs tehát rendben van, nem kell tőled semmi.**

### A valódi ok a mi kódunkban volt

A lakói értesítés és a szállásadói továbbítás az **`if (!assigned_to)` ágon BELÜL** futott.
Ha az admin a létrehozáskor **felelőst is választott** — márpedig Eszti azt tette —, a
teljes blokk kimaradt.

**Javítva:** mindkettő kiemelve a feltételes ágból. Az értesítésnek semmi köze ahhoz, hogy
választottak-e felelőst. A `RESTICK-07` teszt pontosan ezt a helyzetet méri.

### Egy külön lelet, amit érdemes tudni

A `sendToUser` **csak a TICKET-et nézi**, és `status:'ok'` esetén sikert jelent. A
**RECEIPT-et — ahol az APNs-hibák megjelennek — soha nem kérdezi le.** Vagyis a `{"sent":1}`
megtévesztő lehet: úgy néz ki, mint siker, miközben a telefon néma marad.

Most ezt a diagnosztikai szkript pótolja, magyarázó szöveggel a gyakori hibakódokhoz
(`InvalidCredentials` = hiányzó APNs/FCM hitelesítés, `MismatchSenderId`,
`DeviceNotRegistered`). **Javaslat külön körre:** a receipt-lekérdezést érdemes beépíteni a
rendszeres működésbe, hogy a halott tokenek és a hitelesítési hibák maguktól kiderüljenek.

---

## 2. TÖBB ÉRINTETT LAKÓ EGY JEGYEN (mig 173)

### Két hatókör, nem egy

| Hatókör | Mit jelent | Névsor keletkezik? |
|---|---|---|
| `employee` | konkrét, felsorolt lakók | ✅ `ticket_affected_employees` |
| `accommodation` | az **egész szállás** | ❌ **szándékosan nem** |

### ⚠️ A szivárgás-kérdésre a válaszom: ne készüljön névsor

Kézenfekvő volna a húsz lakót húsz sorként beírni. **Két okból nem tesszük:**

**1. Adatszivárgás vegyes szálláson.** Sarród I./II. és Sopronhorpács vegyes. Egy
személyenként felsorolt „egész szállás" jegyen a megbízói oldal **más cég dolgozóinak
nevét** látná — miközben a folyosón égő lámpához semmi köze a névsornak. **Ami nem
létezik, azt nem lehet kiszivárogtatni.**

**2. A névsor elavul.** Egy beköltöző a jegy megnyitása után is ugyanazt a folyosót
használja; egy kiköltöző viszont már nem. A hatókör-alapú láthatóság magától követi a
mozgást, a befagyasztott névsor nem.

**A megbízói oldal így a jegyet látja** (van ott dolgozója), **de a lakók névsorát nem
kapja meg — mert olyan nem is keletkezik.**

*Megjegyzés az éles adatról: ma minden lakó ugyanahhoz a megbízóhoz (Man At Work Győr)
tartozik, a vegyesség **munkahely** szerinti (Autoliv / IKEA). A szivárgás tehát ma még
latens — akkor válik élessé, amikor a Man At Work Budapest lakói bekerülnek.*

### A láthatóság EGY töredékben bővült

Négy ág, három használati helyen (lista, részletek, üzenet-őr) — **másolat nélkül**:

1. ő jelentette be, 2. ő az elsődleges érintett, 3. szerepel a több érintett között,
4. ház-hatókör ÉS ő **most** ott lakik.

---

## 3. BESZÁLLÍTÓI SZÁMLASZÁM (mig 174)

### Az éles állapot: 22 számlából **8-on** a belső sorszám áll a valódi szám helyett

| Belső sorszám | Beszállító | Dátum | Összeg |
|---|---|---|---|
| INV-000012 | Darázs Lívia e.v. | 2026-09-02 | 152 400 |
| INV-000013 | RA-TOX Kártevőírtó | 2026-09-02 | 87 630 |
| INV-000014 | Tri-Home Kft. | 2026-09-10 | **6 029 032** |
| INV-000015 | Darázs Lívia e.v. | 2026-09-11 | 10 000 |
| INV-000008 | Anthropic PBC | 2026-09-11 | 41 561 |
| INV-000010 | MVM Next Zrt. | 2026-09-13 | **1 255 406** |
| INV-000009 | Adria Invest Kft. | 2026-09-14 | 25 580 |
| INV-000011 | Gede László (Győr) | 2026-09-21 | 17 989 |

**Ezeket kézzel kell pótolni** — a migráció szándékosan üresen hagyja őket. Egy kitalált
számlaszám rosszabb a hiányzónál: azt hinnénk, megvan.

### Amit megépítettem

- **A lista a beszállítói számot mutatja elsődlegesen**, a belső sorszám alatta halványan.
  Ahol hiányzik, ott narancssárga **„hiányzik"** jelzés áll.
- **Kötelező a rögzítéskor** — kivéve a **bérbeadói rezsi-jelzést**, ahol nincs számla.
- **Duplikáció-védelem:** részleges egyedi index (szállító + szám, kisbetűsítve, trimmelve)
  — a kis-nagybetű és a szóköz nem kerüli meg (SUPNUM-04). Két **különböző** szállító
  azonos száma viszont megengedett (SUPNUM-06).
- A belső sorszám **megmarad**: activity_logs bejegyzések és korábbi jelentések kötik
  hozzá, felülírva a régi nyomok a semmibe mutatnának.

### Mellékhatás, amit a suite kapott el

A kötelezőség **30 meglévő teszt-esetet elbuktatott** (ALLOC terület) — azok számlát
hoztak létre szám nélkül. A fixtúrák **egyedi** számot kaptak, mert a duplikáció-védelem
különben a másodikat elutasítaná. Ez jó jel: a védelem azonnal dolgozott.

---

## 4. Állapot

| | |
|---|---|
| Functest | **309 passed / 0 failed** (RESTICK 7 → 10, új SUPNUM 6) |
| Admin build | zöld |
| Migrációk | 173, 174 — **élesben még nincsenek** |
| Mobil | a több-érintett felület **nincs megépítve** — a soron következő buildbe kerül |
