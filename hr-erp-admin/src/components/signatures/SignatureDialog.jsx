import { useState, useRef, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  ToggleButton, ToggleButtonGroup, TextField, Alert, CircularProgress, Divider,
} from '@mui/material';
import { Draw, DeleteOutline } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { signaturesAPI } from '../../services/api';

const NYELVEK = [
  { kod: 'hu', cimke: 'Magyar' },
  { kod: 'uk', cimke: 'Українська' },
  { kod: 'en', cimke: 'English' },
  { kod: 'tl', cimke: 'Tagalog' },
  { kod: 'de', cimke: 'Deutsch' },
];

/**
 * KÖZÖS aláíró párbeszéd — mind a négy dokumentumtípusra (kárjegyzőkönyv, ellenőrzés,
 * kárigény, dokumentum) és mind a három szerepre (lakó / személyzet / tanú).
 *
 * Ez az EGYETLEN hely, ahol az adminban aláírás keletkezik. Ha négy helyen születne,
 * négy helyen csúszna el a bizonyító erő.
 *
 * A FOLYAMAT SORRENDJE SZÁNDÉKOS:
 *   1. előbb a NYELV — a lakó a sajátját válassza, MIELŐTT bármit elolvasna;
 *   2. utána a SZÖVEG, nagy betűvel, görgethetően;
 *   3. és csak ezután a rajzvászon.
 * Fordított sorrendben az aláírás megelőzné a megértést — ez az egész funkció értelmét
 * venné el.
 */
export default function SignatureDialog({
  open, onClose, onSigned,
  subjectType, subjectId, signerRole = 'resident',
  signerName = '', signerEmployeeId = null,
  defaultLanguage = 'hu',
}) {
  const [nyelv, setNyelv] = useState(defaultLanguage);
  const [szovegek, setSzovegek] = useState({});
  const [nev, setNev] = useState(signerName);
  const [betolt, setBetolt] = useState(false);
  const [ment, setMent] = useState(false);
  const [megtagad, setMegtagad] = useState(false);
  const [indok, setIndok] = useState('');
  const [rajzolt, setRajzolt] = useState(false);
  const canvasRef = useRef(null);
  const huz = useRef(false);

  useEffect(() => { setNev(signerName); }, [signerName]);
  useEffect(() => { setNyelv(defaultLanguage || 'hu'); }, [defaultLanguage, open]);

  useEffect(() => {
    if (!open || !subjectType) return;
    setBetolt(true);
    signaturesAPI.texts(subjectType, signerRole, subjectId)
      .then((r) => setSzovegek(r?.data?.texts || {}))
      .catch(() => toast.error('A nyilatkozat szövegét nem sikerült betölteni'))
      .finally(() => setBetolt(false));
  }, [open, subjectType, subjectId, signerRole]);

  // ── rajzvászon ────────────────────────────────────────────────────────────
  const ctx = () => {
    const c = canvasRef.current; if (!c) return null;
    const g = c.getContext('2d');
    g.lineWidth = 2.2; g.lineCap = 'round'; g.strokeStyle = '#111';
    return g;
  };
  const pont = (e) => {
    const c = canvasRef.current; const r = c.getBoundingClientRect();
    const t = e.touches?.[0];
    return { x: ((t ? t.clientX : e.clientX) - r.left) * (c.width / r.width),
             y: ((t ? t.clientY : e.clientY) - r.top) * (c.height / r.height) };
  };
  const kezd = (e) => { e.preventDefault(); huz.current = true; const g = ctx(); const p = pont(e); g.beginPath(); g.moveTo(p.x, p.y); };
  const mozog = (e) => { if (!huz.current) return; e.preventDefault(); const g = ctx(); const p = pont(e); g.lineTo(p.x, p.y); g.stroke(); setRajzolt(true); };
  const veg = () => { huz.current = false; };
  const torol = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext('2d').clearRect(0, 0, c.width, c.height); setRajzolt(false);
  };

  const kuldheto = nev.trim() && (megtagad ? indok.trim() : rajzolt) && !ment;

  const mehet = async () => {
    setMent(true);
    try {
      await signaturesAPI.create(subjectType, subjectId, {
        signer_role: signerRole,
        signer_name: nev.trim(),
        signer_employee_id: signerEmployeeId,
        language: nyelv,
        signature_png: megtagad ? null : canvasRef.current.toDataURL('image/png'),
        refusal_reason: megtagad ? indok.trim() : null,
      });
      toast.success(megtagad ? 'Az aláírás megtagadása rögzítve' : 'Aláírás rögzítve');
      onSigned?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Az aláírás rögzítése nem sikerült',
        { autoClose: 8000 });
    } finally { setMent(false); }
  };

  return (
    <Dialog open={open} onClose={() => !ment && onClose?.()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Draw fontSize="small" />
        {signerRole === 'resident' ? 'Aláírás — lakó'
          : signerRole === 'witness' ? 'Aláírás — tanú' : 'Aláírás — munkatárs'}
      </DialogTitle>

      <DialogContent dividers>
        {/* 1. NYELV — ez az ELSŐ lépés, nem beállítás a lap alján. */}
        <Typography variant="caption" color="text.secondary">
          Melyik nyelven olvassa el?
        </Typography>
        <ToggleButtonGroup
          value={nyelv} exclusive size="small" sx={{ mt: 0.5, mb: 2, flexWrap: 'wrap' }}
          onChange={(_, v) => v && setNyelv(v)}
        >
          {NYELVEK.map((n) => (
            <ToggleButton key={n.kod} value={n.kod}>{n.cimke}</ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* 2. A SZÖVEG — amit aláír. Szó szerint ez kerül az adatbázisba. */}
        {betolt ? <CircularProgress size={22} /> : (
          <Alert severity="info" icon={false} sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {szovegek[nyelv] || '—'}
            </Typography>
          </Alert>
        )}

        <TextField
          label="Aláíró neve" value={nev} onChange={(e) => setNev(e.target.value)}
          fullWidth size="small" sx={{ mb: 2 }}
          helperText="Ahogy a jegyzőkönyvben szerepel"
        />

        <Divider sx={{ mb: 2 }} />

        {!megtagad ? (
          <>
            {/* 3. A RAJZVÁSZON. Csak a nyelv és a szöveg UTÁN. */}
            <Typography variant="caption" color="text.secondary">Aláírás</Typography>
            <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, mt: 0.5 }}>
              <canvas
                ref={canvasRef} width={640} height={200}
                style={{ width: '100%', height: 160, touchAction: 'none', display: 'block' }}
                onMouseDown={kezd} onMouseMove={mozog} onMouseUp={veg} onMouseLeave={veg}
                onTouchStart={kezd} onTouchMove={mozog} onTouchEnd={veg}
              />
            </Box>
            <Button size="small" startIcon={<DeleteOutline />} onClick={torol} sx={{ mt: 0.5 }}>
              Törlés
            </Button>
          </>
        ) : (
          <TextField
            label="A megtagadás indoka" value={indok} onChange={(e) => setIndok(e.target.value)}
            fullWidth multiline rows={2} size="small"
            helperText="Egy vitában ez többet ér, mint a hiányzó aláírás"
          />
        )}

        {/* A MEGTAGADÁS IS ÉRVÉNYES KIMENET. Ha nincs rá gomb, a gyakorlatban üres
            sor marad — arról viszont utólag semmit nem lehet tudni. */}
        <Button size="small" color="inherit" sx={{ mt: 1 }}
          onClick={() => { setMegtagad(!megtagad); torol(); setIndok(''); }}>
          {megtagad ? '← Mégis aláírja' : 'Az aláírást megtagadja'}
        </Button>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={ment} color="inherit">Mégse</Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={mehet} disabled={!kuldheto}>
          {ment ? <CircularProgress size={20} color="inherit" />
            : megtagad ? 'Megtagadás rögzítése' : 'Aláírás rögzítése'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
