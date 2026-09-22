# Fordítási hiba — vizsgálat és javítás

**Dátum:** 2026-09-22 · **Commit:** `4bfdb7f0` · **Functest:** 279 passed / 0 failed
**Állapot:** ✅ **ÉLESÍTVE 2026-09-22 08:28-kor** (mig 170 + 171 lefutott)

---

## ÉLES ELLENŐRZÉS A DEPLOY UTÁN

A javítás élesben fut, és az új állapot-végpont most ezt mondja a prod rendszerről:

```json
{
  "enabled": true,
  "degraded": true,
  "last_error": {
    "at": "2026-09-22T08:29:30Z",
    "status": 400,
    "message": "You have reached your specified API usage limits.
                You will regain access on 2026-10-01 at 00:00 UTC."
  },
  "reason": "A fordító szolgáltatás hibát ad — a szövegek eredeti nyelven jelennek meg"
}
```

**Ez a bizonyíték.** Korábban ugyanez a helyzet állt fenn, csak a rendszer nem mondta ki.

---

## Rövid válasz

**A fordítás valóban nem működik, de nem azért, amire gyanakodtál.**

Az Anthropic API **használati korlátja kifutott**:

```
400 — "You have reached your specified API usage limits.
       You will regain access on 2026-10-01 at 00:00 UTC."
```

A kulcs érvényes, a hálózat jó, a szolgáltatás bekapcsolva — de **minden hívás elszáll**,
és a fordító ilyenkor visszaadja az eredeti szöveget. Ez a viselkedés önmagában helyes:
egy hibás fordítás miatt nem hagyjuk üresen a jegyet.

**A valódi baj az volt, hogy ezt a rendszer sehol nem mondta ki.** A felületen a le nem
fordított idegen szöveg pontosan úgy nézett ki, mintha fordítás történt volna. Ezt
javítottam.

**Eszti jegyei viszont nem emiatt magyarok** — lásd az 1. pontot.

---

## A kért öt pont, sorban

### 1. Elmentődött-e Eszti nyelvváltása? → **IGEN, az app rendben menti**

| | |
|---|---|
| `users.preferred_language` | **`en`** |
| `users.updated_at` | **07:47:49** |

**De az időrend mindent megmagyaráz:**

| Időpont | Esemény | Nyelv |
|---|---|---|
| 07:42:06 | #19 létrehozva | `hu` |
| 07:42:32 | #20 létrehozva | `hu` |
| 07:43:34 | Eszti üzenete | `hu` |
| 07:44:38 | Eszti üzenete | `hu` |
| **07:47:49** | **nyelvváltás mentve → `en`** | |
| 07:48:43 | admin üzenete | `hu` |

A jegyek és **minden lakói üzenet a váltás ELŐTT** született, és **mind magyar** („Hianyzik
a kulcs", „Szeretnék kérni új kulcsot", „Nem ég a lámpa"). A váltás után Eszti nem írt
semmit. **Azokon a jegyeken nincs mit fordítani.**

> ⚠️ Egy mellékes, de fontos megfigyelés: **két** `preferred_language` mező létezik —
> `users` (ezt írja az app, `en`) és `employees` (ez maradt `hu`). A fordítás a `users`
> mezőt olvassa, tehát jól. De a két mező szétcsúszása máshol még okozhat meglepetést.

### 2. Blokkolja-e a Phase 0 modulzár a lakói útvonalon? → **NEM**

A `moduleScope` allow-list **egyetlen** szerepkört zár: `kulso_ertekesito` (külső
értékesítő), ami még nem is létezik. A lakó nincs benne a korlátozottak közt, tehát a
fordítás nincs zárva előle.

### 3. Fut-e a fordító élesben? → **A kulcs megvan, a hívás elszáll**

Élesben lefuttatott próba:

```
enabled: true
en→hu: "The key is missing from the door"   (497 ms)   ← változatlan!
```

Majd közvetlen API-hívással:

```
API HIBA: 400 — You have reached your specified API usage limits.
                You will regain access on 2026-10-01 at 00:00 UTC.
request_id: req_011CfJ99zFUQBcJvADs3empU
```

**Ez a gyökérok.** Ez magyarázza a „korábban működött"-öt is: addig működött, amíg a
kvóta ki nem futott.

### 4. Szinkron vagy háttérben fordít? → **Szinkron, olvasáskor, cache-first**

A fordítás **nem háttérfeladat**: a jegy vagy az üzenetlista lekérésekor fut le, a nézőpont
nyelvére. Először a `translation_cache`-ből próbál, és csak utána hív API-t. Nincs tehát
„még nem futott le" állapot — vagy megvan, vagy elszállt.

### 5. Írt-e a `translation_cache`-be? → **Ma egyetlen sort sem**

| | |
|---|---|
| cache sorok összesen | 119 |
| ebből ma | **0** |

Ez két okból következik: a magyar→magyar eset meg sem hívja a fordítót (azonos nyelv), az
API-hívások pedig mind elszálltak, így nem is volt mit cache-elni.

---

## Amit javítottam

**1. A néma bukás megszűnt.** A fordított objektum mostantól `_translation_failed` mezőt
visz, ha a célnyelv más, de a szöveg változatlan maradt — pontosan az „elnyelt bukás"
esete. A felület ebből tud figyelmeztetést kitenni ahelyett, hogy a nyers idegen szöveget
fordításként mutatná. *(Az üzenet-út már korábban is jól kezelte ezt
`translation_unavailable` néven; a jegy-objektum volt, ami csendben degradálódott.)*

**2. Ops-riasztás**, óránként legfeljebb egyszer. A ritkítás nem kozmetika: kifogyott
kvótánál minden hívás elszáll, egy jegyoldal megnyitása tucatnyi riasztást szórna — amitől
a riasztás elveszti az értelmét.

**3. `GET /translation/health`** — megy-e a fordítás, és ha nem, miért. A „nincs kulcs" és
a „hibát ad" két külön helyzet, más teendővel.

---

## Amit a vizsgálat mellékesen kihozott — ez a súlyosabb lelet

**Élesben a lakói szerepkörnek van `tickets.create` joga. Migrációban sehol nincs.**

| | `accommodated_employee` → `tickets.create` |
|---|---|
| éles | ✔ megvan (kézzel megadva) |
| sandbox / CI / dev | ✗ nincs |

Két következménye volt, és a második a rosszabb:

1. egy friss környezet **nem ugyanazt a rendszert építi fel**, mint ami élesben fut,
2. **a functest soha nem tudta járni a lakói jegynyitás útját** — tehát pont az a folyamat
   volt lefedetlen, amiből a lakói mobilapp él. Ez akkor derült ki, amikor a most írt teszt
   403-mal elszállt.

**Javítva:** `mig 171` pótolja a jogot minden környezetben (élesben nem változtat semmit,
ott már megvan). A sandboxban ez önmagában nem elég, mert a migrációk a szerepkörök
seedelése **előtt** futnak — ezért a functest fixture is megadja, kommentben az
indoklással.

---

## A teszt, amit kértél

Új `TRANS` functest-terület, **5 eset, mind zöld**:

| | |
|---|---|
| TRANS-01 | a lakó nyelvváltása a jegy nyelvét is meghatározza |
| **TRANS-02** | **az admin MAGYARUL kapja meg az angolul írt jegyet** *(+ az eredeti szöveg is megmarad)* |
| **TRANS-03** | **az admin magyar válasza a lakó nyelvén (angolul) jelenik meg** |
| TRANS-04 | ha a fordítás nem fut le, a válasz ezt **kimondja** |
| TRANS-05 | az állapot lekérdezhető: megy-e, és ha nem, miért |

A fordítás a tesztben a **cache-ből** jön. Ez nem kerülő út: a gyorsítótár az éles működés
része, és így a teszt akkor is fut, amikor az API nem elérhető — márpedig épp ez volt a
hiba napja.

---

## Mi kell tőled

**1. Az API-kvóta.** A fordítás **2026-10-01 00:00 UTC-ig nem fog működni**, hacsak nem
emeled a limitet az Anthropic konzolban (Settings → Limits). Amíg ez tart, az idegen nyelvű
jegyek eredeti nyelven jelennek meg — de mostantól **láthatóan**, nem csendben.

**2. Döntés:** kérsz-e a felületre is figyelmeztető sávot („a gépi fordítás átmenetileg nem
érhető el")? A backend már adja hozzá az adatot, az admin UI-t még nem építettem meg.

**3. Deploy.** ✅ Megtörtént 2026-09-22-én. A mig 170 és 171 lefutott, a health-végpont
élesben válaszol, a szignálási kör is élesedett (nulla gazdátlan jegy maradt).

---

## Hogyan tudod magad is ellenőrizni

Ha Eszti **MOST** átáll angolra és ír egy ÚJ jegyet angolul, az **továbbra sem fordul le** —
de már nem csendben: a jegy `_translation_failed: true` jelzést kap, és a naplóba/ops-ra
riasztás megy. Ez nem a javítás kudarca, hanem a kvóta kifutása, ami **2026-10-01 00:00
UTC-ig** tart.

Ha a limitet megemeled az Anthropic konzolban (Settings → Limits), a fordítás **azonnal
működni kezd**, kód-változtatás nélkül — a mechanizmus ép, csak nem kap választ.
