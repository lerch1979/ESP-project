import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, Button, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  FormControlLabel, Switch, Alert, Snackbar, Tooltip, CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import ExpiryMonitorWidget from '../components/ExpiryMonitorWidget';
import { expiryMonitorAPI } from '../services/api';

const FIELD_OPTIONS = [
  { value: '*', label: 'Bármely (alapértelmezett)' },
  { value: 'visa', label: 'Vízum' },
  { value: 'contract', label: 'Szerződés' },
  { value: 'document', label: 'Dokumentum' },
];

const emptyRule = { field: '*', nationality: '', document_type: '', thresholds: '60, 30, 14, 7', include_overdue: true, is_active: true };

// thresholds text → array; validation mirrors the backend (positive, distinct, descending).
function parseThresholds(text) {
  const parts = String(text).split(',').map((s) => s.trim()).filter(Boolean);
  const nums = parts.map(Number);
  if (!nums.length) return { error: 'Legalább egy küszöbérték szükséges.' };
  if (!nums.every((n) => Number.isInteger(n) && n > 0)) return { error: 'A küszöbértékek pozitív egész számok legyenek.' };
  if (new Set(nums).size !== nums.length) return { error: 'A küszöbértékek nem ismétlődhetnek.' };
  const desc = [...nums].sort((a, b) => b - a);
  if (nums.some((n, i) => n !== desc[i])) return { error: 'A küszöbértékek csökkenő sorrendben legyenek (pl. 60, 30, 14, 7).' };
  return { value: nums };
}

export default function ExpiryMonitor() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // rule id or null (new)
  const [form, setForm] = useState(emptyRule);
  const [formError, setFormError] = useState(null);
  const [toast, setToast] = useState(null);

  const loadRules = useCallback(async () => {
    try {
      const r = await expiryMonitorAPI.listRules();
      setRules(r.data.rules || []);
    } catch {
      setToast({ severity: 'error', msg: 'Nem sikerült betölteni a szabályokat.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const openNew = () => { setEditing(null); setForm(emptyRule); setFormError(null); setDialogOpen(true); };
  const openEdit = (rule) => {
    setEditing(rule.id);
    setForm({
      field: rule.field, nationality: rule.nationality || '', document_type: rule.document_type || '',
      thresholds: (rule.thresholds || []).join(', '), include_overdue: rule.include_overdue, is_active: rule.is_active,
    });
    setFormError(null); setDialogOpen(true);
  };

  const save = async () => {
    setFormError(null);
    const parsed = parseThresholds(form.thresholds);
    if (parsed.error) { setFormError(parsed.error); return; }
    if (form.nationality && !/^[A-Za-z]{2}$/.test(form.nationality)) { setFormError('A nemzetiség 2 betűs ISO kód legyen (pl. PH, UA).'); return; }
    const body = {
      field: form.field,
      nationality: form.nationality || null,
      document_type: form.document_type || null,
      thresholds: parsed.value,
      include_overdue: form.include_overdue,
      is_active: form.is_active,
    };
    try {
      if (editing) await expiryMonitorAPI.updateRule(editing, body);
      else await expiryMonitorAPI.createRule(body);
      setDialogOpen(false);
      setToast({ severity: 'success', msg: editing ? 'Szabály frissítve.' : 'Szabály létrehozva.' });
      loadRules();
    } catch (e) {
      setFormError(e.response?.data?.message || 'A mentés nem sikerült.');
    }
  };

  const remove = async (rule) => {
    if (!window.confirm('Biztosan törli ezt a szabályt?')) return;
    try {
      await expiryMonitorAPI.deleteRule(rule.id);
      setToast({ severity: 'success', msg: 'Szabály törölve.' });
      loadRules();
    } catch {
      setToast({ severity: 'error', msg: 'A törlés nem sikerült.' });
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Lejárati figyelő</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Vízum, szerződés és dokumentum lejáratok figyelése. A küszöbök munkavállalói attribútum
        szerint szabályozhatók (nemzetiség, dokumentumtípus). NULL nemzetiség → alapértelmezett szabály.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={5}>
          <ExpiryMonitorWidget />
        </Grid>

        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Küszöbérték-szabályok</Typography>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>Új szabály</Button>
            </Box>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Mező</TableCell>
                    <TableCell>Nemzetiség</TableCell>
                    <TableCell>Dok. típus</TableCell>
                    <TableCell>Küszöbök (nap)</TableCell>
                    <TableCell>Lejárt</TableCell>
                    <TableCell align="right">Műveletek</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id} sx={{ opacity: r.is_active ? 1 : 0.5 }}>
                      <TableCell>{FIELD_OPTIONS.find((f) => f.value === r.field)?.label || r.field}</TableCell>
                      <TableCell>{r.nationality || <em>bármely</em>}</TableCell>
                      <TableCell>{r.document_type || <em>bármely</em>}</TableCell>
                      <TableCell>{(r.thresholds || []).join(' / ')}</TableCell>
                      <TableCell>{r.include_overdue ? <Chip size="small" label="igen" color="error" variant="outlined" /> : 'nem'}</TableCell>
                      <TableCell align="right">
                        <Tooltip title="Szerkesztés"><IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Törlés"><IconButton size="small" onClick={() => remove(r)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rules.length === 0 && (
                    <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Nincs szabály.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Szabály szerkesztése' : 'Új szabály'}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <TextField select fullWidth margin="normal" label="Mező" value={form.field}
            onChange={(e) => setForm({ ...form, field: e.target.value })}>
            {FIELD_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField fullWidth margin="normal" label="Nemzetiség (ISO alpha-2, pl. PH, UA — üres = bármely)"
            value={form.nationality} inputProps={{ maxLength: 2, style: { textTransform: 'uppercase' } }}
            onChange={(e) => setForm({ ...form, nationality: e.target.value.toUpperCase() })} />
          <TextField fullWidth margin="normal" label="Dokumentumtípus (üres = bármely)"
            value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })} />
          <TextField fullWidth margin="normal" label="Küszöbök (nap, csökkenő, vesszővel)"
            placeholder="60, 30, 14, 7" value={form.thresholds}
            onChange={(e) => setForm({ ...form, thresholds: e.target.value })}
            helperText="Pozitív, csökkenő, egyedi egész számok. Pl. PH: 120, 90, 60, 30, 7" />
          <FormControlLabel control={<Switch checked={form.include_overdue} onChange={(e) => setForm({ ...form, include_overdue: e.target.checked })} />} label="Lejárt elemek riasztása" />
          <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Aktív" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={save}>Mentés</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
