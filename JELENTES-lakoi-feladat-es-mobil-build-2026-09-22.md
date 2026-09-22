# Lakónak szóló feladat + mobil buildek + backend deploy

**Dátum:** 2026-09-22 · **Commitok:** `d347bf86`, `e9e9bb88` · **Functest:** 299 passed / 0 failed

---

## 1. Backend deploy ✅ MEGTÖRTÉNT

CI zöld → mentés (`db-20260922-1122.dump`, 4,3 MB + uploads 18 MB) → `pull && up -d` →
`api: 200`. A **lakói jegy-láthatóság** és a **push** élesben fut.

---

## 2. A kérdésed: regisztrált-e Eszti iPhone-ja push-tokent?

### ✅ IGEN — és élesben ki is próbáltam

| | |
|---|---|
| Regisztrálva | **2026-09-22 07:40:05** |
| Platform | ios / iPhone |
| Token | `ExponentPushToken[BQJVqQMMlZBQ…` |
| Utoljára használva | 2026-09-22 |

Valódi próbapusht küldtem a szerverről az eszközére:

```
eredmény: {"sent":1}
```

A telefonján meg kellett jelennie egy **„Új hibajegy — #TESZT"** értesítésnek.

**Egy fogalmi pontosítás:** a `sent:1` azt jelenti, hogy **az Expo átvette** a küldést —
a tényleges kézbesítést csak a telefon igazolja vissza. Ha az értesítés nem jelent meg,
a hiba az iOS-oldali kézbesítésnél (APNs) van, nem a szervernél.

---

## 3. Lakónak szóló feladat (mig 172) — kész, **élesben még nincs**

### A két fogalom szétválasztása

| Mező | Jelentés | A lakó látja? |
|---|---|---|
| `related_employee_id` | a lakó**RÓL** szól — belső teendő | **soha** |
| `assigned_to_employee_id` | a lakó**NAK** szól | igen, push-sal |

**Miért új mező, és miért nem az `assigned_to`:** az a `users` táblára mutat, és minden
belső nézet arra épül (Teendők lista, GTD, „elvégzendő feladataim" widget,
terhelés-elosztás). Ha lakói user-fiókokat kezdenénk oda írni, a belső teendő-lista
megtelne lakói sorokkal, és az iroda munkaterhelés-számítása is elcsúszna.

### A biztonsági feltétel — teszt bizonyítja

A **RESTASK-05** négy irányból méri, hogy a belső feljegyzés nem szivárog:

1. nincs a lakói listában — **a válasz-törzsben a szövege sem**,
2. nem jelölhető meg (404),
3. nem keletkezik róla lakói értesítés,
4. a **DB-szintű CHECK** is visszautasítja a lakói állapotot címzett nélkül.

A **RESTASK-06** pedig azt őrzi, hogy a lakói válasz ne adjon ki belső munkaszervezési
mezőket (`gtd_status`, `energy_level`, `waiting_for`, `estimated_hours`) — ezért tételes
mezőlista megy ki, nem `SELECT *`.

### Két döntés, amit kiemelek

**A lakói „kész" NEM írja át az iroda `status` mezőjét.** Az az iroda munkafolyamata
(`todo` / `review` / `done`); a lakói visszajelzés (`lattam` / `folyamatban` / `kesz`)
külön mezőben él. Ha a lakó közvetlenül a `status`-t állítaná, egy gombnyomással
kikerülne az iroda ellenőrzése alól. A kettő elcsúszhat — és ez így helyes.

**Útvonal-ütközés, amit menet közben kellett feloldani:** a `/tasks/my` **már létezik** az
irodai routerben (`taskDirect.routes.js`, `tasks.view` joggal), és a lakói router
**korábban** van mountolva (`server.js:374` vs `413`). Egy azonos nevű lakói végpont
**elfedte volna az irodai listát**, és a kollégák teendői némán eltűntek volna — nekik
nincs employee-soruk. Ezért a lakói végpont **`/tasks/mine`**.

---

## 4. Mobil buildek ✅

| Platform | Verzió | Állapot |
|---|---|---|
| **iOS** | **1.0.0 (build 7)** | feltöltve a TestFlightra (a 6-os volt az előző, 2026-09-08) |
| **Android** | 1.0.0 (1) | APK kész, belső terjesztés |

**iOS:** az Apple feldolgozása 5–10 perc, utána e-mail érkezik.
`https://appstoreconnect.apple.com/apps/6784334116/testflight/ios`

**Android APK letöltési link:**

```
https://expo.dev/artifacts/eas/E8-Liova8KARjCPoyKeox3ETnrN5WdBDlBMLmurtIk0.apk
```

A build tartalma: **utólagos képcsatolás** a jegy beszélgetésében (kamera vagy galéria),
plusz a már élesben futó backend-javítások.

---

## 5. Ami hiányzik, és ezt tényként jelzem

**A lakónak szóló feladathoz nincs felület** — sem az adminban (ahol kiosztanád), sem a
mobilappban (ahol a lakó látná). A backend, a jogosultság-szűkítés, a push és a teszt
kész, de a kiosztás ma **csak API-hívással** megy.

Ez a következő kör, és a mobil része **újabb buildet igényel**.

---

## 6. Jelentés-formátum — a CLAUDE.md-be beírva

Mostantól minden jelentés `.md` fájlba megy az asztalra, és a beszélgetésben legfeljebb
5 soros **ÖSSZEFOGLALÓ** blokk zárja: mi készült el, mi a döntési pont, mi kell tőled.
A szabály a `CLAUDE.md` végén él, tehát minden sessionben érvényes.
