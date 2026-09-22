# Szerepkör × jogosultság mátrix — mi van ma, és mit javaslok

**Dátum:** 2026-09-22 · **READ-ONLY vizsgálat, semmit nem építettem** · Éles adat

---

## 1. MI LÉTEZIK MA

### A jó hír: a pipás szerkesztő MÁR MEGVAN

`Felhasználók → Szerepkörök` (`/admin/roles`, `Roles.jsx`, 583 sor). Ami ma működik:

| Képesség | Állapot |
|---|---|
| Pipás szerkesztő, **modulonként csoportosítva** | ✅ |
| „Egész modul ki/be" kapcsoló | ✅ |
| Részleges állapot jelzése (néhány pipa be) | ✅ |
| Új szerepkör létrehozása | ✅ |
| Mentés → `PUT /permissions/roles/:id/permissions` | ✅ |
| **Csak szuperadmin szerkesztheti** | ✅ — a `users.manage_permissions` jogot **kizárólag** a szuperadmin birtokolja |
| **A szuperadmin jogai nem vehetők el** | ✅ — a backend 403-mal utasítja el (`permission.controller.js:343`) |

**Vagyis a kérésed 1., 5. pontjának fele és a 3. pont egyharmada már él.**

### Az éles állapot

**11 szerepkör, 71 jogosultság, 19 modul:**

| Szerepkör | Jogok | Felhasználók |
|---|---|---|
| **Szuperadmin** | 284* | 4 |
| Adatkezelő — belső | 64 | 0 |
| Általános Adminisztrátor | 60 | 0 |
| Felhasználó | 16 | 0 |
| Feladat-felelős | 14 | 1 |
| Külső Alvállalkozó | 4 | 0 |
| **Szállásolt Munkavállaló (lakó)** | **3** | **3** |
| Ingatlan tulajdonos | 0 | 0 |
| Ingatlanellenőr | 0 | 0 |
| Karbantartó | 0 | 1 |
| Employee | 0 | 0 |

\* a 284 a szuperadminnál több bérlői kiosztást is jelent — a 71 egyedi jogot lefedi.

**Négy szerepkörnek nulla joga van**, de egyiknél van felhasználó (Karbantartó: 1 fő) —
az a fiók ma gyakorlatilag semmit nem ér el.

### Ami HIÁNYZIK

| Hiány | Súly |
|---|---|
| **A magyar feliratok hiányosak: 19 modulból 11-hez van** (`MODULE_LABELS`) | közepes |
| Nincsenek magyar feliratok az **egyes jogokhoz** — a pipa mellett `finance.view` áll | **magas** |
| **Nincsenek kemény korlátok** — szállásfelelősnek adható pénzügyi jog | **magas** |
| **Nincs audit-napló** — a módosítás csak `logger.info`-ba megy, `logActivity` nélkül | **magas** |
| Nincs money-leak ellenőrzés mentés után | közepes |
| A felület **nem mondja meg**, hogy a pipa modul-hozzáférés, nem sor-láthatóság | **magas** |

---

## 2. JAVASOLT MÁTRIX — modulonként, magyarul

A 19 modul **hét csoportba** vonható, mert a szerkesztőn 19 külön szekció átláthatatlan:

### 💰 PÉNZÜGY
| Jog | Magyar felirat |
|---|---|
| `finance.view` | Pénzügy — megtekintés |
| `finance.edit` | Pénzügy — szerkesztés |

### 🏠 SZÁLLÁS ÉS LAKÓK
| Jog | Magyar felirat |
|---|---|
| `accommodations.view` / `.create` / `.edit` / `.delete` | Szálláshelyek — megtekintés / létrehozás / szerkesztés / törlés |
| `employees.view` / `.create` / `.edit` / `.delete` / `.export` / `.upload_documents` | Munkavállalók — megtekintés / … / exportálás / dokumentum-feltöltés |

### 🔧 ÜZEMELTETÉS
| Jog | Magyar felirat |
|---|---|
| `tickets.view` / `.create` / `.edit` / `.assign` / `.change_status` / `.delete` | Hibajegyek — megtekintés / bejelentés / szerkesztés / **kiosztás** / állapotváltás / törlés |
| `tasks.*` | Teendők — megtekintés / létrehozás / szerkesztés / törlés |
| `timesheets.view_own` / `.view_all` / `.log` | Munkaidő — **saját** / **mindenkié** / rögzítés |

### 📄 DOKUMENTUMOK ÉS RIPORTOK
`documents.*` → Dokumentumok — megtekintés / feltöltés / törlés
`reports.*` → Riportok — megtekintés / készítés / ütemezés / exportálás

### 🤝 ÉRTÉKESÍTÉS
`sales.view` / `.all.view` / `.edit` / `.assign` / `.quotes.accept`
→ Üzletfejlesztés — megtekintés / **mindenki adatai** / szerkesztés / hozzárendelés / **ajánlat elfogadása**

### ❤️ JÓLLÉT
`wellbeing.self` / `.admin.view` / `.admin.manage`, `eap.*`, `blue_colibri.*`

### ⚙️ RENDSZER
`users.*`, `settings.*`, `dashboard.*`, `calendar.*`, `videos.*`, `faq.*`, `projects.*`

**Két felirat, amit külön kiemelek**, mert a rossz szöveg itt jogosultsági hibához vezet:

- `sales.all.view` → **„Üzletfejlesztés — MINDENKI adatai"**, nem „megtekintés". Ez az a
  jog, ami a sor-szintű szigetelést kinyitja.
- `timesheets.view_all` → **„Munkaidő — MINDENKIÉ"**, szemben a `view_own`-nal.

---

## 3. KEMÉNY KORLÁTOK — amit a felület ne engedjen

| # | Szabály | Miért |
|---|---|---|
| 1 | **Szállásfelelős ← pénzügyi jog** | A FUNCTEST `ROLES` terület minden elérhető végpontját pénz-kulcsokra pásztázza (`moneyScan.js`). Egy kipipált `finance.view` ezt azonnal elbuktatná — de csak a következő teszt-futáskor, nem a pipa pillanatában. |
| 2 | **Lakó ← személyzeti jog** (`employees.*`, `users.*`, `finance.*`, `reports.*`) | A lakó a `/my` önhatáskörű végpontokon éri el a sajátját. Egy `employees.view` **minden** munkavállalót megnyitna neki — a sor-szintű szűrés a staff-végpontokon nincs meg (PROJECT_STATE tech-debt). |
| 3 | **Szuperadmin jogai nem vehetők el** | ✅ **MÁR ÉL** a backendben. |
| 4 | **Senki ne vehesse el a SAJÁT szuperadmin jogát** | ⛔ **MA NEM VÉDETT.** Ha egy szuperadmin elveszi a saját szerepkörét, kizárja magát, és nincs más, aki visszaadja. A 4 szuperadmin miatt ma nem végzetes, de egy fiókos telepítésnél az lenne. |

**A zárolt pipa mellé magyarázat kell**, nem csak egy szürke négyzet. Javaslat:

> 🔒 **Pénzügy — megtekintés**
> *Ez a jog a szállásfelelős szerepkörnek nem adható. A szerepkör minden végpontját
> automatikus teszt pásztázza pénzügyi adatra; ez a pipa azt buktatná el.*

Enélkül a felhasználó azt hiszi, elromlott a felület.

---

## 4. A LEGFONTOSABB SZÖVEG, AMI MA HIÁNYZIK

A felület **sehol nem mondja meg**, hogy a pipa **modul-hozzáférést** szabályoz, nem
sor-láthatóságot. Ez a legveszélyesebb félreértés: aki kipipálja a
„Munkavállalók — megtekintés"-t egy szállásfelelősnek, azt hiheti, hogy „csak a sajátjait
fogja látni" — pedig **mindenkit** látna.

Javasolt szöveg a szerkesztő tetejére, állandóan látható helyre:

> **A pipa azt szabályozza, hogy a szerepkör MELYIK MODULT érheti el — nem azt, kinek a
> sorait látja benne.**
> A sor-szintű szigetelés (saját szállás, saját dolgozók, saját jegyek) a kódban van, és
> nem állítható innen. Ha egy szerepkörnek csak a saját adataira van szüksége, a modul
> bekapcsolása **önmagában nem elég** — szólj, mielőtt kiosztod.

---

## 5. NAPLÓZÁS ÉS ELLENŐRZÉS

**Ma:** a módosítás `logger.info`-ba megy — a logfájlba, ami rotálódik. **`logActivity`
hívás nincs** (0 találat a kontrollerben), tehát az `activity_logs` táblában nincs nyoma.

**Javaslat:** minden mentés írjon `activity_logs` sort — **ki, mikor, melyik szerepkörnél,
mit adott hozzá és mit vett el**. Nem a végállapotot: a **különbözetet**. Egy „most 43 joga
van" bejegyzésből fél év múlva nem derül ki, hogy tavaly valaki elvette a `finance.view`-t.

**Money-leak ellenőrzés mentés után:** a `moneyScan.js` ma a functest része. Javaslom
egy **könnyű, szinkron változat** beépítését a mentés utáni útba: a módosított szerepkör
jogait összeveti a tiltólistával, és ha ütközik, a mentés **el sem indul**. A teljes,
végpontokat pásztázó scan marad a functestben — az futásidőben túl drága.

---

## 6. MIT JAVASLOK MEGÉPÍTENI

| # | Munka | Méret |
|---|---|---|
| 1 | **Magyar feliratok** mind a 71 joghoz + 19 modulhoz, hét csoportba rendezve | közepes |
| 2 | **Kemény korlátok** (4 szabály) — a backendben ÉS a felületen, magyarázattal | közepes |
| 3 | **A sor-szintű figyelmeztetés** a szerkesztő tetejére | kicsi |
| 4 | **`activity_logs` naplózás** a különbözettel | kicsi |
| 5 | **Szinkron money-leak ellenőrzés** mentés előtt | kicsi |
| 6 | **Saját szuperadmin jog elvételének tiltása** | kicsi |

**Amit NEM javaslok most:** egyéni felhasználói kivételek. A `UserPermissions.jsx` (563
sor) létezik, de amíg a szerepkör-szint nincs rendben, a kivételek csak elfedik a
hiányzó szabályokat.

---

## 7. EGY KÖVETKEZMÉNY, AMIT ELŐRE JELZEK

A PROJECT_STATE szerint a **szállásfelelős és a megbízó szerepkör NEM élesíthető**, amíg
az `employees.billing_client_id` üres. Ez ma **kitöltött** (a 15,2%-os bevételkiesés
javításakor rendeztük), tehát az előfeltétel teljesült — de a mátrix élesítése előtt ezt
érdemes külön ellenőrizni, mert a PROJECT_STATE bejegyzése még a régi állapotot írja.
