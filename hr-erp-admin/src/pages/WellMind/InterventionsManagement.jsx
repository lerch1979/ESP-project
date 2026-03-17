import React, { useState } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, Card, CardContent, Grid, Chip
} from '@mui/material';
import { Campaign, Send } from '@mui/icons-material';
import { wellmindAPI } from '../../services/api';
import { toast } from 'react-toastify';

const INTERVENTION_TYPES = [
  { value: 'coaching', label: 'Coaching', description: 'Egyéni coaching foglalások' },
  { value: 'meditation', label: 'Meditáció', description: 'Mindfulness és meditációs program' },
  { value: 'exercise', label: 'Testmozgás', description: 'Rendszeres testmozgás program' },
  { value: 'training', label: 'Tréning', description: 'Szakmai fejlődési lehetőség' },
  { value: 'time_off', label: 'Pihenés', description: 'Szabadság/pihenés ajánlás' },
  { value: 'workload_adjustment', label: 'Munkaterhelés', description: 'Munkaterhelés felülvizsgálata' },
  { value: 'eap_referral', label: 'CarePath ajánlás', description: 'CarePath szakmai támogatás' },
];

const InterventionsManagement = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ intervention_type: 'coaching', title: '', description: '', target_risk_level: 'red' });
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const handleLaunch = async () => {
    if (!form.title || !form.description) { toast.warning('Cím és leírás kötelező'); return; }
    try {
      setSending(true);
      const response = await wellmindAPI.bulkIntervention(form);
      setLastResult(response.data);
      toast.success(`${response.data.created_count} munkavállaló kapott javaslatot`);
      setDialogOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hiba történt');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          <Campaign sx={{ mr: 1, verticalAlign: 'middle' }} />
          Intervenciók kezelése
        </Typography>
        <Button startIcon={<Send />} variant="contained" onClick={() => setDialogOpen(true)}>
          Program indítása
        </Button>
      </Box>

      {lastResult && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setLastResult(null)}>
          Utolsó program: <strong>{lastResult.created_count}</strong> munkavállalónak küldve ({lastResult.target_risk_level} kockázati szint)
        </Alert>
      )}

      {/* Intervention Types Overview */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {INTERVENTION_TYPES.map(t => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={t.value}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Chip label={t.label} size="small" color="primary" sx={{ mb: 1 }} />
                <Typography variant="body2" color="text.secondary">{t.description}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Hogyan működik?</Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          A vállalati szintű intervenció programmal egyszerre küldhet javaslatokat minden munkavállalónak,
          aki a kiválasztott kockázati kategóriában van. A javaslatok személyre szabottan jelennek meg a
          WellMind alkalmazásban.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <strong>Lépések:</strong> 1. Válassza ki a program típusát → 2. Írja meg a címet és leírást →
          3. Válassza ki a célcsoportot → 4. Indítsa el a programot
        </Typography>
      </Paper>

      {/* Launch Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Vállalati wellbeing program indítása</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl fullWidth>
            <InputLabel>Program típusa</InputLabel>
            <Select value={form.intervention_type} onChange={(e) => setForm(f => ({ ...f, intervention_type: e.target.value }))} label="Program típusa">
              {INTERVENTION_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Program címe" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} required />
          <TextField label="Leírás" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} multiline rows={3} required />
          <FormControl fullWidth>
            <InputLabel>Célcsoport</InputLabel>
            <Select value={form.target_risk_level} onChange={(e) => setForm(f => ({ ...f, target_risk_level: e.target.value }))} label="Célcsoport">
              <MenuItem value="red">Magas kockázat (piros)</MenuItem>
              <MenuItem value="yellow">Közepes kockázat (sárga)</MenuItem>
              <MenuItem value="green">Mindenki (zöld is)</MenuItem>
            </Select>
          </FormControl>
          <Alert severity="info">A program minden kiválasztott kockázati szintű munkavállalónak automatikusan kézbesítésre kerül.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Mégse</Button>
          <Button onClick={handleLaunch} variant="contained" disabled={sending} startIcon={<Send />}>
            {sending ? 'Küldés...' : 'Program indítása'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InterventionsManagement;
