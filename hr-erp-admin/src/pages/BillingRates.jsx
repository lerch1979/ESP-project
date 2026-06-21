import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, MenuItem, Button, IconButton,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Stack, Alert, Divider, CircularProgress,
} from '@mui/material';
import { Delete as DeleteIcon, PlayArrow as RunIcon } from '@mui/icons-material';
import { billingAPI, contractorsAPI, accommodationsAPI } from '../services/api';
import { toast } from 'react-toastify';

const arr = (res) => {
  if (Array.isArray(res)) return res;
  const d = res?.data ?? res;
  if (Array.isArray(d)) return d;
  return d?.contractors ?? d?.accommodations ?? d?.rows ?? [];
};
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('hu-HU') + ' Ft');
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function BillingRates() {
  const [clients, setClients] = useState([]);
  const [accs, setAccs] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ contractor_id: '', accommodation_id: '', rate_per_night: '', valid_from: thisMonth() + '-01', valid_to: '', notes: '' });
  const [month, setMonth] = useState(thisMonth());
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  const loadRates = useCallback(async () => {
    try { setRates(arr(await billingAPI.listRates())); } catch { /* */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [c, a] = await Promise.all([contractorsAPI.getAll(), accommodationsAPI.getAll()]);
        setClients(arr(c)); setAccs(arr(a));
        await loadRates();
      } finally { setLoading(false); }
    })();
  }, [loadRates]);

  const addRate = async () => {
    if (!form.contractor_id || form.rate_per_night === '' || !form.valid_from) {
      toast.warn('Ügyfél, díj és érvényesség kezdete kötelező'); return;
    }
    try {
      await billingAPI.createRate({
        contractor_id: form.contractor_id,
        accommodation_id: form.accommodation_id || null,
        rate_per_night: Number(form.rate_per_night),
        valid_from: form.valid_from,
        valid_to: form.valid_to || null,
        notes: form.notes || null,
      });
      toast.success('Díj hozzáadva');
      setForm({ ...form, rate_per_night: '', notes: '' });
      loadRates();
    } catch (e) { toast.error(e?.response?.data?.message || 'Hiba'); }
  };

  const removeRate = async (id) => {
    try { await billingAPI.deleteRate(id); loadRates(); } catch { toast.error('Hiba'); }
  };

  const runDraft = async () => {
    setRunning(true); setRunResult(null);
    try {
      const res = await billingAPI.runDraft(month);
      const summary = res?.data || res;
      const billings = arr(await billingAPI.getRunBillings(summary.run_id));
      setRunResult({ summary, billings });
      toast.success('Vázlat számlázás kész');
    } catch (e) { toast.error(e?.response?.data?.message || 'Hiba a futtatáskor'); }
    finally { setRunning(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Számlázási díjak (ügyfelenként)</Typography>

      {/* Add rate */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Új éjszakai díj</Typography>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} md={3}>
            <TextField select fullWidth size="small" label="Számlázási ügyfél" value={form.contractor_id}
              onChange={(e) => setForm({ ...form, contractor_id: e.target.value })}>
              {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField select fullWidth size="small" label="Szállás (üres = alapdíj)" value={form.accommodation_id}
              onChange={(e) => setForm({ ...form, accommodation_id: e.target.value })}>
              <MenuItem value="">Minden szállás (alapdíj)</MenuItem>
              {accs.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField fullWidth size="small" type="number" label="Díj / fő / éj (Ft)" value={form.rate_per_night}
              onChange={(e) => setForm({ ...form, rate_per_night: e.target.value })} />
          </Grid>
          <Grid item xs={6} md={1.5}>
            <TextField fullWidth size="small" type="date" label="Érvényes -tól" InputLabelProps={{ shrink: true }}
              value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </Grid>
          <Grid item xs={6} md={1.5}>
            <TextField fullWidth size="small" type="date" label="-ig (üres = nyitott)" InputLabelProps={{ shrink: true }}
              value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          </Grid>
          <Grid item xs={6} md={1}>
            <Button variant="contained" fullWidth onClick={addRate}>Hozzáad</Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Rate list */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Érvényes díjak</Typography>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Ügyfél</TableCell><TableCell>Szállás</TableCell><TableCell align="right">Díj / fő / éj</TableCell>
            <TableCell>Érvényes</TableCell><TableCell /></TableRow></TableHead>
          <TableBody>
            {rates.length === 0 && <TableRow><TableCell colSpan={5}><em>Még nincs díj rögzítve.</em></TableCell></TableRow>}
            {rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.contractor_name}</TableCell>
                <TableCell>{r.accommodation_name || <Chip size="small" label="alapdíj" />}</TableCell>
                <TableCell align="right">{fmt(r.rate_per_night)}</TableCell>
                <TableCell>{r.valid_from}{r.valid_to ? ` – ${r.valid_to}` : ' –'}</TableCell>
                <TableCell align="right"><IconButton size="small" onClick={() => removeRate(r.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* Draft run */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Vázlat számlázás futtatása</Typography>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <TextField size="small" type="month" label="Hónap" InputLabelProps={{ shrink: true }} value={month} onChange={(e) => setMonth(e.target.value)} />
          <Button variant="contained" startIcon={<RunIcon />} onClick={runDraft} disabled={running}>
            {running ? 'Számolás…' : 'Vázlat futtatása'}
          </Button>
          <Typography variant="caption" color="text.secondary">Csak vázlat — a véglegesítés + számlázás külön (emberi) lépés.</Typography>
        </Stack>

        {runResult && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              Bevétel összesen: <b>{fmt(runResult.summary.total_amount)}</b> · {runResult.summary.billing_count} tétel ·
              {runResult.summary.groups_no_billing_client > 0 && <> ⚠ {runResult.summary.groups_no_billing_client} csoport számlázási ügyfél nélkül</>}
              {runResult.summary.groups_no_rate > 0 && <> · ⚠ {runResult.summary.groups_no_rate} csoport díj nélkül</>}
            </Alert>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Szállás</TableCell><TableCell>Ügyfél</TableCell><TableCell align="right">Fő-éj</TableCell>
                <TableCell align="right">Bevétel</TableCell><TableCell align="right">Költség</TableCell><TableCell align="right">Árrés</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {runResult.billings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.accommodation}</TableCell>
                    <TableCell>{b.client || <Chip size="small" color="warning" label="nincs ügyfél" />}</TableCell>
                    <TableCell align="right">{b.total_employee_days}</TableCell>
                    <TableCell align="right">{fmt(b.revenue)}</TableCell>
                    <TableCell align="right">{fmt(b.cost_amount)}</TableCell>
                    <TableCell align="right" sx={{ color: Number(b.margin_amount) >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>{fmt(b.margin_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>
    </Box>
  );
}
