import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Alert, Box, InputAdornment, IconButton, Typography, CircularProgress,
} from '@mui/material';
import { Visibility, VisibilityOff, VpnKey } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

// A szerverrel MEGEGYEZŐ minimum (backend: src/utils/passwordRule.js). Ha a kettő
// szétcsúszik, a felület zöld utat mutat egy jelszóra, amit a szerver elutasít.
const MIN_HOSSZ = 8;

/**
 * Saját jelszóváltás.
 *
 * KÉT módban működik, ugyanazzal a kóddal:
 *   • normál  → bezárható, a felhasználó meggondolhatja magát;
 *   • kötelező (`kotelezo`) → NINCS bezárás, nincs "Mégse", és a háttérben lévő oldal
 *     nem is használható. Ilyenkor az adminisztrátor ideiglenes jelszavával léptek be,
 *     amit rajtuk kívül más is ismer.
 */
export default function ChangePasswordDialog({ open, onClose, kotelezo = false }) {
  const { changePassword, logout } = useAuth();
  const [jelenlegi, setJelenlegi] = useState('');
  const [uj, setUj] = useState('');
  const [ujMegint, setUjMegint] = useState('');
  const [mutat, setMutat] = useState(false);
  const [betolt, setBetolt] = useState(false);
  const [hiba, setHiba] = useState(null);
  const [kesz, setKesz] = useState(false);

  const rovid = uj.length > 0 && uj.length < MIN_HOSSZ;
  const nemEgyezik = ujMegint.length > 0 && uj !== ujMegint;
  const ugyanaz = uj.length > 0 && uj === jelenlegi;
  const kuldheto = jelenlegi && uj && ujMegint && !rovid && !nemEgyezik && !ugyanaz && !betolt;

  const mehet = async () => {
    setHiba(null);
    setBetolt(true);
    try {
      await changePassword(jelenlegi, uj);
      setKesz(true);
      setJelenlegi(''); setUj(''); setUjMegint('');
      // Kötelező módban nem zárunk be kézzel: a jelző levétele után a szülő
      // magától elrejti a párbeszédet.
      if (!kotelezo) setTimeout(() => { setKesz(false); onClose?.(); }, 1200);
    } catch (e) {
      setHiba(e?.response?.data?.message || 'A jelszó módosítása nem sikerült.');
    } finally {
      setBetolt(false);
    }
  };

  const mezo = (cimke, ertek, allit, extra = {}) => (
    <TextField
      label={cimke}
      type={mutat ? 'text' : 'password'}
      value={ertek}
      onChange={(e) => allit(e.target.value)}
      fullWidth
      margin="dense"
      autoComplete="off"
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={() => setMutat(!mutat)} edge="end" size="small">
              {mutat ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>
        ),
      }}
      {...extra}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={kotelezo ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      disableEscapeKeyDown={kotelezo}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <VpnKey fontSize="small" />
        {kotelezo ? 'Adj meg új jelszót' : 'Jelszó módosítása'}
      </DialogTitle>

      <DialogContent>
        {kotelezo && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Ideiglenes jelszóval léptél be, amit az adminisztrátor adott. Adj meg egy saját
            jelszót, mielőtt folytatod — ezt rajtad kívül senki nem fogja ismerni.
          </Alert>
        )}

        {kesz && <Alert severity="success" sx={{ mb: 2 }}>A jelszó megváltozott.</Alert>}
        {hiba && <Alert severity="error" sx={{ mb: 2 }}>{hiba}</Alert>}

        {mezo('Jelenlegi jelszó', jelenlegi, setJelenlegi, { autoFocus: true })}
        {mezo('Új jelszó', uj, setUj, {
          error: rovid || ugyanaz,
          helperText: rovid ? `Legalább ${MIN_HOSSZ} karakter.`
            : ugyanaz ? 'Nem egyezhet meg a jelenlegivel.' : ' ',
        })}
        {mezo('Új jelszó még egyszer', ujMegint, setUjMegint, {
          error: nemEgyezik,
          helperText: nemEgyezik ? 'A két új jelszó nem egyezik.' : ' ',
        })}

        <Typography variant="caption" color="text.secondary">
          Az új jelszó legalább {MIN_HOSSZ} karakter legyen, és nem lehet ugyanaz, mint a
          jelenlegi. A jelszóváltás a TÖBBI eszközödön kilépteti — ez a gép bent marad.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {/* Kötelező módban nincs "Mégse", de KILÉPNI lehet: senki ne ragadjon be egy
            párbeszédbe, amiből nincs kiút. */}
        {kotelezo
          ? <Button onClick={logout} color="inherit">Kijelentkezés</Button>
          : <Button onClick={onClose} color="inherit">Mégse</Button>}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={mehet} disabled={!kuldheto}>
          {betolt ? <CircularProgress size={20} color="inherit" /> : 'Jelszó módosítása'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
