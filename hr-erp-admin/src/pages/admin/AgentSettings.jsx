/**
 * Triage Agent — üzemmód és akció-engedélyek (spec 1.6).
 *
 * A LAP LEGFONTOSABB FELADATA NEM A KAPCSOLÓ, HANEM AZ IGAZMONDÁS.
 * Egy "live" állásba tett kapcsoló azt sugallja, hogy elindult valami. Az 1. héten
 * NEM indul el semmi: a feldolgozó sor nem létezik, és mind a 16 akció `enabled=false`.
 * Ezért a lap tetején a TÉNYLEGES állapot áll, nem a beállított — és ha a kettő eltér
 * (mert az AGENT_MODE env szigorúbb), azt külön kiírja.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Alert, AlertTitle, Chip, Button, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Switch, CircularProgress,
  ToggleButton, ToggleButtonGroup, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, Divider, Tooltip,
} from '@mui/material';
import {
  Lock as LockIcon, Warning as WarningIcon, CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { agentAPI } from '../../services/api';
import { halkHiba } from '../../utils/nonFatal';

const MOD_LEIRAS = {
  off: 'Semmit nem dolgoz fel. Ez az alapállapot.',
  shadow: 'Mindent kiszámol és naplóz, de SEMMIT nem hajt végre. A spec szerint legalább 14 napig ebben kell futnia.',
  live: 'A policy táblában engedélyezett L2-es akciókat végrehajtja.',
};

// Az örök L1 zóna (spec 6. utolsó sora). A felület ezt NEM ajánlja fel átállításra:
// a szint nem szerkeszthető, és a lap ki is mondja, miért.
const OROK_L1 = ['draft_email_reply', 'extract_attachment_data', 'close_ticket',
  'change_room', 'terminate', 'unlock_account'];

export default function AgentSettings() {
  const { isSuperAdmin } = useAuth();
  const [adat, setAdat] = useState(null);
  const [betolt, setBetolt] = useState(true);
  const [hiba, setHiba] = useState(null);
  const [ment, setMent] = useState(false);
  const [valasztott, setValasztott] = useState(null);
  const [indok, setIndok] = useState('');

  const betoltes = useCallback(async () => {
    setBetolt(true);
    setHiba(null);
    try {
      const r = await agentAPI.getSettings();
      setAdat(r.data);
    } catch (e) {
      setHiba(e.response?.data?.message || 'A beállítások betöltése nem sikerült.');
    } finally {
      setBetolt(false);
    }
  }, []);

  useEffect(() => { if (isSuperAdmin()) betoltes(); else setBetolt(false); }, [betoltes, isSuperAdmin]);

  // A kill switch nem adat-, hanem rendszer-szintű döntés: csak szuperadmin.
  if (!isSuperAdmin()) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 480 }}>
          <LockIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>Csak szuperadmin</Typography>
          <Typography color="text.secondary">
            Ez a kapcsoló azt engedi meg egy gépnek, hogy a lakók felé üzenetet küldjön
            és hibajegyeket nyisson. Ezért szuperadmin jogot kíván.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const modValtas = async () => {
    setMent(true);
    try {
      const r = await agentAPI.setMode(valasztott, indok || null);
      setValasztott(null);
      setIndok('');
      await betoltes();
      // A VÁLASZT KIÍRJUK, nem csak bezárjuk az ablakot: ha az env lefogta a váltást,
      // az admin ezt a mondatot kapja, nem egy csendes "sikerült"-et.
      if (r.data?.capped) {
        setHiba(r.message);
      }
    } catch (e) {
      setHiba(e.response?.data?.message || 'Az üzemmód váltása nem sikerült.');
    } finally {
      setMent(false);
    }
  };

  const akcioValt = async (sor, ertek) => {
    try {
      await agentAPI.setPolicy(sor.action_type, { enabled: ertek });
      await betoltes();
    } catch (e) {
      // NEM CSENDBEN: a kapcsoló visszaáll, és megmondjuk, miért.
      halkHiba('AgentSettings.akcioValt', e, {
        felhasznaloiUzenet: e.response?.data?.message
          || `A(z) "${sor.action_type}" akció átállítása nem sikerült.`,
      });
      setHiba(e.response?.data?.message
        || `A(z) "${sor.action_type}" akció átállítása nem sikerült.`);
      await betoltes();
    }
  };

  if (betolt) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }
  if (!adat) {
    return <Alert severity="error" sx={{ m: 2 }}>{hiba || 'Nincs adat.'}</Alert>;
  }

  const { mode, policy, readiness } = adat;
  const l2 = policy.filter((p) => !OROK_L1.includes(p.action_type));
  const l1 = policy.filter((p) => OROK_L1.includes(p.action_type));

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Triage Agent — üzemmód és engedélyek
      </Typography>

      {hiba && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setHiba(null)}>{hiba}</Alert>}

      {/* AZ IGAZMONDÓ SÁV. Ez a lap legfontosabb eleme. */}
      {!readiness.pipeline_wired && (
        <Alert severity="info" icon={<WarningIcon />} sx={{ mb: 2 }}>
          <AlertTitle>A feldolgozó sor még nincs bekötve</AlertTitle>
          Az 1. hét a vázat építette meg: adatbázis, szabálymotor, policy kapu. Bejövő
          üzenetet még semmi nem dolgoz fel, tehát <strong>ez a kapcsoló bármelyik
          állásban hatástalan</strong>. A „shadow" üzemmódnak a 3–4. héttől lesz
          hatása, a „live"-nak a mérés (golden set) és 14 nap shadow után.
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2">Tényleges üzemmód:</Typography>
          <Chip
            label={mode.effective}
            color={mode.effective === 'live' ? 'error' : mode.effective === 'shadow' ? 'warning' : 'default'}
            sx={{ fontWeight: 700 }}
          />
          {mode.capped && (
            <Chip size="small" color="warning" variant="outlined"
              label={`beállítva: ${mode.stored} — az AGENT_MODE=${mode.env} lefogja`} />
          )}
        </Stack>

        {mode.capped && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            A felületen <strong>{mode.stored}</strong> van beállítva, de a környezeti
            változó <strong>AGENT_MODE={mode.env}</strong> szigorúbb, ezért a tényleges
            üzemmód <strong>{mode.effective}</strong>. Ez szándékos: egy incidensnél a
            deployból le kell tudni fogni az agentet úgy, hogy azt egy kattintás ne
            engedhesse vissza. A felületi beállítás megmarad, és az env enyhítése után
            lép érvénybe.
          </Alert>
        )}

        <ToggleButtonGroup
          exclusive
          value={mode.stored}
          onChange={(e, v) => { if (v && v !== mode.stored) setValasztott(v); }}
          size="small"
        >
          {['off', 'shadow', 'live'].map((m) => (
            <Tooltip key={m} title={MOD_LEIRAS[m]}>
              <ToggleButton value={m}>{m}</ToggleButton>
            </Tooltip>
          ))}
        </ToggleButtonGroup>

        {mode.reason && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Utolsó váltás indoka: {mode.reason}
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Készültség (spec 7.1)</Typography>
        <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">engedélyezett akció</Typography>
            <Typography variant="h6">{readiness.enabled_actions} / {readiness.total_actions}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              golden set (min. {readiness.golden_set_required})
            </Typography>
            <Typography variant="h6" color={readiness.golden_set_size >= readiness.golden_set_required ? 'success.main' : 'warning.main'}>
              {readiness.golden_set_size}
            </Typography>
          </Box>
        </Stack>
        {readiness.golden_set_size < readiness.golden_set_required && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Mérés nélkül nincs élesítés: még {readiness.golden_set_required - readiness.golden_set_size} címkézett
            minta kell. A meglévő hibajegyek és chat-üzenetek már bekerültek alapként.
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          L2-ig engedhető akciók — tételesen élesíthetők
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>akció</TableCell>
                <TableCell align="center">max. szint</TableCell>
                <TableCell align="center">confidence-küszöb</TableCell>
                <TableCell align="center">engedélyezve</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {l2.map((p) => (
                <TableRow key={p.action_type}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{p.action_type}</TableCell>
                  <TableCell align="center">L{p.max_autonomy_level}</TableCell>
                  <TableCell align="center">{Number(p.min_confidence).toFixed(3)}</TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={!!p.enabled}
                      onChange={(e) => akcioValt(p, e.target.checked)}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom>
          Örök L1 — ezek soha nem lesznek autonómak
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Ezeknél a szint <strong>nem állítható</strong>, és nem is ajánljuk fel: pénzhez,
          szerződéshez, munkaviszonyhoz vagy hatósághoz nyúlnak, illetve visszafordíthatatlanok.
          A tiltást az adatbázis is őrzi, nem csak ez a felület.
        </Alert>
        <TableContainer>
          <Table size="small">
            <TableBody>
              {l1.map((p) => (
                <TableRow key={p.action_type}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{p.action_type}</TableCell>
                  <TableCell align="center"><Chip size="small" label={`L${p.max_autonomy_level}`} /></TableCell>
                  <TableCell align="center">
                    <Chip size="small" icon={<CheckIcon />} label="ember dönt" variant="outlined" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={!!valasztott} onClose={() => setValasztott(null)} fullWidth maxWidth="sm">
        <DialogTitle>Üzemmód váltása: {valasztott}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>{MOD_LEIRAS[valasztott]}</Typography>
          {valasztott === 'live' && (
            <Alert severity="error" sx={{ mb: 2 }}>
              A <strong>live</strong> üzemmódban az agent a lakók felé is kommunikálhat.
              A spec szerint ezt csak a golden-set mérés és legalább 14 nap shadow után
              szabad bekapcsolni, és akkor is akciónként.
            </Alert>
          )}
          <Divider sx={{ mb: 2 }} />
          <TextField
            fullWidth multiline minRows={2} label="Miért? (naplózzuk)"
            value={indok} onChange={(e) => setIndok(e.target.value)}
            helperText="Egy live → shadow váltás incidens. Hat hónap múlva senki nem fogja emlékezni, miért."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setValasztott(null)}>Mégsem</Button>
          <Button variant="contained" onClick={modValtas} disabled={ment}>
            {ment ? 'Mentés…' : 'Váltás'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
