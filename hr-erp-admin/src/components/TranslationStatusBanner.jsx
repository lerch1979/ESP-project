import React, { useState, useEffect } from 'react';
import { Alert, AlertTitle, Collapse, Link } from '@mui/material';
import { translationAPI } from '../services/api';

/**
 * Figyelmeztető sáv, ha a gépi fordítás nem működik.
 *
 * MIÉRT VAN EZ: 2026-09-22-én a fordítás úgy esett ki, hogy a rendszer sehol nem mondta
 * ki. Az API-kvóta kifutott, minden hívás 400-at adott, a szolgáltatás pedig — helyesen —
 * visszaadta az EREDETI szöveget, hogy a jegy ne maradjon üresen. A felületen viszont ez
 * megkülönböztethetetlen volt attól, mintha a fordítás megtörtént volna: az admin azt
 * hitte, hogy amit lát, az a magyar fordítás.
 *
 * A csendes degradálódás a legrosszabb hibaosztály, mert nincs pillanat, amikor kiderül.
 * Ez a sáv azt a pillanatot teremti meg.
 *
 * ÓVATOSAN A ZAJJAL: a sáv csak akkor jelenik meg, ha a fordítás TÉNYLEG hibát ad. Ha
 * nincs beállítva API-kulcs, az konfiguráció, nem üzemzavar — arra külön, halkabb üzenet
 * megy, és csak azoknak, akik tudnak vele kezdeni valamit.
 */
export default function TranslationStatusBanner() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await translationAPI.health();
        if (!cancelled) setStatus(r?.data || null);
      } catch { /* a sáv hiánya nem akaszthatja meg a felületet */ }
    };
    load();
    // Tízpercenként újrakérdez: egy kvóta-visszaállás után a sáv magától tűnjön el,
    // ne kelljen újratölteni az oldalt.
    const id = setInterval(load, 600000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const degraded = status?.degraded === true;
  const nincsKulcs = status && status.enabled === false;
  if (!degraded && !nincsKulcs) return null;

  // A kvóta-hibából kiemeljük a visszaállás időpontját — ez az egyetlen szám, ami
  // alapján a tulajdonos dönteni tud (kivárás vagy limitemelés).
  const uzenet = status?.last_error?.message || '';
  const mikor = (uzenet.match(/regain access on ([0-9-]+ at [0-9:]+ UTC)/) || [])[1];
  const kvota = /usage limits/i.test(uzenet);

  return (
    <Collapse in>
      <Alert severity={degraded ? 'warning' : 'info'} sx={{ mb: 2 }}>
        <AlertTitle>
          {degraded ? 'A gépi fordítás jelenleg nem működik' : 'A gépi fordítás nincs beállítva'}
        </AlertTitle>
        A lakói bejelentések és üzenetek <strong>eredeti nyelven</strong> jelennek meg — amit
        látsz, az <strong>nem fordítás</strong>.
        {kvota && (
          <>
            {' '}Ok: az API használati korlát elérve
            {mikor ? <> — a hozzáférés <strong>{mikor}</strong> kor áll helyre</> : null}.
            {' '}A limit az Anthropic konzolban emelhető (Settings → Limits); kódmódosítás nem kell.
          </>
        )}
        {nincsKulcs && <> Az <code>ANTHROPIC_API_KEY</code> nincs beállítva a szerveren.</>}
        {' '}
        <Link href="/tickets" underline="hover">Érintett jegyek megtekintése</Link>
      </Alert>
    </Collapse>
  );
}
