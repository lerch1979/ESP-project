# Négy tesztelési észrevétel + push — vizsgálati jelentés

**Dátum:** 2026-09-22 · **Állapot:** READ-ONLY vizsgálat, **semmit nem építettem**
Minden megállapítás az **éles** rendszerből származik.

---

## ELŐSZÖR AZ 5. PONT, mert az minden másra hat

### ✅ Eszti iPhone-ja REGISZTRÁLT push-tokent

| Felhasználó | Platform | Eszköz | Regisztrálva | Utoljára használva |
|---|---|---|---|---|
| **eszti.teszt@** | ios | iPhone | **2026-09-22** | **2026-09-22** |
| ios.teszt@ | ios | iPhone | 2026-06-27 | 2026-09-11 |
| teszt.lakos@ | android | Power Armor 13 | 2026-06-19 | 2026-07-14 |

**Tehát a token NEM hiányzik** — a push elmaradása nem ezen múlik.

### ⛔ A VALÓDI OK: a legtöbb értesítés nem is kér push-t

Az `inAppNotification.notify()` **csak akkor** küld push-t, ha a hívó külön kéri:

```js
if (id && push) { pushService.sendToUser(...) }   // push = null az alapértelmezés
```

**A 31 hívási helyből mindössze 5 kér push-t:**

| Kér push-t ✅ | Nem kér ⛔ |
|---|---|
| jegy-üzenet (chat válasz) | **feladat-hozzárendelés** |
| videó-értesítés (×2) | **új hibajegy** *(ezt én írtam, szintén push nélkül)* |
| OCR-feldolgozás | **jegy-szignálás** |
| lejárat-figyelő | …és további ~23 |

Vagyis az appban megjelenik a harang-értesítés, de **a telefon nem csörren**. Ez magyarázza
a 2. és a 4. pont push-részét is.

---

## 1. MOBIL CHAT — kép utólagos csatolása

### Ami MEGVAN

| Réteg | Állapot |
|---|---|
| Végpont | ✅ `POST /tickets/my/:ticketId/attachments` |
| Jogosultság | ✅ `requireOwnTicket` — csak a saját jegyére tölthet |
| Tárolás | ✅ `storage.service` → `uploads/tickets/ÉÉÉÉ/HH/<jegy>/<uuid>.jpg` — a **nightly backup viszi** |
| Letöltés | ✅ `GET /tickets/my/:ticketId/attachments/:attId` |
| Mobil API-réteg | ✅ `api.js:203` — a hívás meg van írva |

**Fontos:** a végpont **nem korlátozódik a létrehozás pillanatára**. A kódkomment ugyan azt
írja, hogy „create-time upload", de a `requireOwnTicket` csak tulajdonlást ellenőriz —
utólag is működne.

### Ami HIÁNYZIK

**Egyetlen dolog: a mobil felület a jegy részletei képernyőn.** A
`ResidentTicketDetail.js` a meglévő képeket **csak megjeleníti** (152–154. sor); nincs
benne `ImagePicker`, se fotó-gomb. Az `ImagePicker` a `CreateTicketScreen.js`-ben él —
tehát a beszerzési logika kész, csak a másik képernyőn nincs bekötve.

**Becslés:** ez a négy pont közül a legkisebb munka — egy gomb + a meglévő hívás.

---

## 2. FELADAT A LAKÓNAK → nincs értesítés

### Mi történt valójában

A létrehozott feladat élesben:

| Mező | Érték |
|---|---|
| cím | „Eszti Teszt (mobil) —" |
| **`assigned_to`** | **fulop.eszter87@ (az iroda)** |
| **`related_employee_id`** | **Teszt (mobil) Eszti** |

A feladat tehát **Esztiről szól, de az irodára van szignálva**. Eszti user-fiókja soha nem
kapta meg — **az értesítés elmaradása ebben az esetben helyes viselkedés**.

### A modell mai állapota

| | |
|---|---|
| feladat összesen | 13 |
| `related_employee_id` kitöltve | 5 |
| **lakói fiókra szignálva** | **0** |

`/tasks/my` a `tasks.view` jogot kéri; a lakói szerepkörnek **csak `tickets.create`** joga
van → **403**. A mobilapp hívja ugyan a `/tasks` végpontokat, de azok is `tasks.view`-t
kérnek.

**Következtetés: a feladat-modul ma kizárólag az iroda belső teendőire készült.** Nincs
„lakónak szóló feladat" fogalom — és ez nem hiba, hanem a jelenlegi terv.

### Javaslat a megkülönböztetésre

A `related_employee_id` már ma azt jelenti: **„a lakóról szól"** (belső). Amit hozzá kell
tenni, az a másik irány:

| Fogalom | Mező | A lakó látja? | Push |
|---|---|---|---|
| **a lakóról szóló** (mai működés) | `related_employee_id` | ❌ soha | — |
| **a lakónak szóló** (új) | `assigned_to_employee_id` *(új mező)* | ✅ appban | ✅ |

**Miért új mező, és miért nem az `assigned_to`:** az `assigned_to` a `users` táblára
mutat, és a feladat-táblák, listák, GTD-nézetek mind arra épülnek. Ha lakói user-fiókokat
kezdünk oda írni, a belső teendő-lista megtelik lakói sorokkal. Egy külön mező viszont
kimondja a szándékot, és a belső nézetek érintetlenek maradnak.

**A biztonsági feltétel, amit kötelezővé tennék:** a lakói végpont **csak** az
`assigned_to_employee_id`-ra szűrjön, soha ne a `related_employee_id`-ra. Enélkül egy
belső feljegyzés („beszélni kell vele a rendetlenség miatt") megjelenne a telefonján.

---

## 3. IDŐVONAL — szerkeszthetőség

### A jó hír: az adat már ott van

A backend idővonal-végpont a feladat-eseményhez **visszaadja a `task_id`-t** a
`metadata`-ban (`employee.controller.js:1692`).

### Ami hiányzik

**Az elemek nem kattinthatók.** Az `EmployeeDetailModal.jsx` kirajzolja az eseményeket, de
**egyetlen `onClick` sincs** rajtuk — nincs mód megnyitni, nemhogy szerkeszteni.

**Javaslat:** a `task` típusú elem legyen kattintható, és nyissa meg a meglévő
feladat-szerkesztő dialógust a `metadata.task_id` alapján. Backend-módosítás **nem kell**.

---

## 4. IRODA ÁLTAL LÉTREHOZOTT HIBAJEGY

### Reprodukálva, éles adaton

| Jegy | Bejelentő (`created_by`) | Érintett (`linked_employee_id`) |
|---|---|---|
| **#21** | **fulop.eszter87@ (iroda)** | **Teszt (mobil) Eszti** |
| #19, #20 | eszti.teszt@ | **nincs** |
| #11, #15–18 | admin@ | Pinca Lorraine, Ilagan… |

### A három kérdésedre

**a) Kinek a nevén jön létre, kitöltődik-e az érintett?**
A jegy az **irodai felhasználó** nevén jön létre. A `linked_employee_id` **kitöltődött** —
tehát az adat ott van, és az admin űrlapon **van** érintett-választó
(`CreateTicketModal.jsx:262`, Autocomplete).

**b) Mire szűr a lakói lekérdezés?**

```sql
WHERE t.created_by = $1      -- a BEJELENTŐRE, nem az érintettre
```

**Ez a hiba gyökere.** A `#21` sosem fog megjelenni Esztinek, mert nem ő jelentette be.

**c) Választható-e az érintett lakó az űrlapon?** **Igen**, és ki is volt töltve.

### Javaslat

A lakói szűrés legyen **VAGY-kapcsolat**:

```sql
WHERE t.created_by = $1 OR e.user_id = $1   -- linked_employee_id → employees.user_id
```

**Egy buktató, amit külön jelzek:** ha csak a `linked_employee_id`-ra váltanánk, Eszti
**saját jegyei (#19, #20) eltűnnének** — azoknál ugyanis üres ez a mező. A lakói
jegynyitás ma nem tölti ki. Ezért a javaslat kétrészes:

1. a lekérdezés legyen VAGY-kapcsolatú (a meglévő jegyek nem vesznek el),
2. a lakói jegynyitás **töltse ki** a `linked_employee_id`-t a bejelentő saját
   employee-rekordjával — így az adat ezentúl teljes.

**És push:** az irodai jegylétrehozásnál ma sem megy push. Ha a lakó látja is a jegyet, a
telefonja akkor sem csörren, amíg az értesítés nem kér push-t (lásd 5. pont).

---

## Összefoglaló táblázat

| # | Mi hiányzik | Hol | Méret |
|---|---|---|---|
| **5** | a legtöbb értesítés nem kér push-t | backend, ~26 hívási hely | **kicsi, de sok helyen** |
| **1** | fotó-gomb a mobil chat képernyőn | mobil, 1 képernyő | **kicsi** |
| **3** | kattintható idővonal-elem | admin, 1 komponens | **kicsi** |
| **4** | a lakói szűrés VAGY-kapcsolata + `linked_employee_id` kitöltése | backend, 2 hely | **közepes** |
| **2** | „lakónak szóló feladat" fogalom | új mező + lakói végpont + mobil képernyő + push | **nagy** |

## Javasolt sorrend

1. **Push bekapcsolása** a lakót érintő értesítéseknél (5.) — enélkül a többi javítás
   eredménye sem látszik a telefonon.
2. **Jegy-láthatóság** (4.) — ez a legkonkrétabb működési hiba: az iroda dolgozik, a lakó
   nem tud róla.
3. **Fotó utólag** (1.) és **kattintható idővonal** (3.) — mindkettő kicsi, egy körben.
4. **Lakónak szóló feladat** (2.) — önálló kör, mert új fogalmat vezet be, és a
   biztonsági feltétel (belső feljegyzés soha ne kerüljön a lakó telefonjára) külön
   figyelmet kíván.

**Nem építettem semmit. Szólj, melyiket kezdjem.**
