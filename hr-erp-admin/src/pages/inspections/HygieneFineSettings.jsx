import React, { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Switch, FormControlLabel, TextField, Button, Stack,
  Alert, CircularProgress, Divider,
} from '@mui/material';
import { Gavel as GavelIcon, PlayArrow as PlayArrowIcon } from '@mui/icons-material';
import { hygieneFineAPI } from '../../services/api';
import { toast } from 'react-toastify';

const GOLD = '#8B6B33';

export default function HygieneFineSettings() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await hygieneFineAPI.getConfig();
      setCfg(res.data);
    } catch (e) {
      toast.error('Konfiguráció betöltési hiba');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await hygieneFineAPI.updateConfig({
        enabled: !!cfg.enabled,
        consecutive_fails: Number(cfg.consecutive_fails),
        fail_hygiene_max: Number(cfg.fail_hygiene_max),
        fine_amount: Number(cfg.fine_amount),
      });
      setCfg(res.data);
      toast.success('Beállítás mentve');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Mentési hiba');
    } finally { setSaving(false); }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await hygieneFineAPI.run();
      const d = res.data;
      toast.success(d.skipped ? `Kihagyva (${d.reason})` : `Kész: ${d.created} bírság létrehozva (${d.candidates} jelölt).`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Futtatási hiba');
    } finally { setRunning(false); }
  };

  if (loading || !cfg) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <GavelIcon sx={{ color: GOLD }} />
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Házirend-bírság (automatikus)</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Ha egy szoba higiéniáját <strong>{cfg.consecutive_fails} egymást követő</strong> ellenőrzés is „bukott"-nak
        értékeli, automatikus házirend-bírság keletkezik. Ez a MI folyamatunk — a bérlevonás-végrehajtástól
        függetlenül kapcsolható. A bírság csak a tartozást rögzíti (a szokásos hibajegy-értesítéssel);
        NEM ír bérlevonást és NEM hajt végre levonást. Fizethető a szokásos készpénzes úton vagy továbbítható az ügyfélnek.
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 640 }}>
        <FormControlLabel
          control={<Switch checked={!!cfg.enabled} onChange={(e) => set('enabled', e.target.checked)}
            sx={{ '& .Mui-checked': { color: GOLD }, '& .Mui-checked + .MuiSwitch-track': { bgcolor: GOLD } }} />}
          label={<Typography sx={{ fontWeight: 600 }}>{cfg.enabled ? 'Bekapcsolva' : 'Kikapcsolva'}</Typography>}
        />
        {!cfg.enabled && <Alert severity="info" sx={{ mt: 1, mb: 2 }}>Jelenleg kikapcsolva — nem keletkezik automatikus bírság.</Alert>}

        <Divider sx={{ my: 2 }} />

        <Stack spacing={2} sx={{ maxWidth: 360 }}>
          <TextField label="Egymást követő bukások száma" type="number" size="small"
            value={cfg.consecutive_fails} onChange={(e) => set('consecutive_fails', e.target.value)}
            inputProps={{ min: 1 }} helperText="Hány egymást követő bukott ellenőrzés váltja ki a bírságot" />
          <TextField label="Higiénia-küszöb (bukott, ha ≤)" type="number" size="small"
            value={cfg.fail_hygiene_max} onChange={(e) => set('fail_hygiene_max', e.target.value)}
            helperText="A szoba higiénia-pontszáma ennyi vagy alatta = bukott" />
          <TextField label="Bírság összege (Ft / fő)" type="number" size="small"
            value={cfg.fine_amount} onChange={(e) => set('fine_amount', e.target.value)}
            inputProps={{ min: 0 }} helperText={`Bírságtípus: ${cfg.fine_type_code}`} />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
          <Button variant="contained" onClick={save} disabled={saving}
            sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#6f552a' } }}>
            {saving ? <CircularProgress size={22} /> : 'Mentés'}
          </Button>
          <Button variant="outlined" startIcon={running ? <CircularProgress size={16} /> : <PlayArrowIcon />}
            onClick={runNow} disabled={running || !cfg.enabled}
            sx={{ borderColor: GOLD, color: GOLD }}>
            Futtatás most
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
