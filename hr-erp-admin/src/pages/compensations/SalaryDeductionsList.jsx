import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, Chip, FormControl, InputLabel, MenuItem, Select,
  Table, TableHead, TableBody, TableCell, TableRow, TableContainer, LinearProgress, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
} from '@mui/material';
import { Refresh as RefreshIcon, PlayArrow as RunIcon, OpenInNew as OpenIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';

const STATUS_CHIP = {
  scheduled: { label: 'Ütemezett', color: 'info' },
  active:    { label: 'Aktív',     color: 'warning' },
  completed: { label: 'Lezárt',    color: 'success' },
  cancelled: { label: 'Törölt',    color: 'default' },
  paused:    { label: 'Szünetelt', color: 'default' },
};

const fmtMoney = (n) => n == null ? '—' : `${Number(n).toLocaleString('hu-HU')} HUF`;

export default function SalaryDeductionsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('active');
  const [payrollDialog, setPayrollDialog] = useState({
    open: false,
    month: new Date().toISOString().slice(0, 7),
    running: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inspectionsAPI.listActiveDeductions({ status: status || null });
      setRows(res?.data || []);
    } catch {
      toast.error('Bérlevonások betöltése sikertelen');
    } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const active = rows.filter(r => r.status === 'active');
    const monthly = active.reduce((s, r) => s + Number(r.monthly_amount || 0), 0);
    const outstanding = active.reduce((s, r) => {
      const left = Math.max(0, Number(r.months_total || 0) - Number(r.months_completed || 0));
      return s + left * Number(r.monthly_amount || 0);
    }, 0);
    return { active: active.length, monthly, outstanding };
  }, [rows]);

  const runPayroll = async () => {
    if (!/^\d{4}-\d{2}$/.test(payrollDialog.month)) return toast.warn('Hónap formátuma: YYYY-MM');
    setPayrollDialog(p => ({ ...p, running: true }));
    try {
      const res = await inspectionsAPI.runPayrollDeductions(payrollDialog.month);
      const r = res?.data || {};
      toast.success(`Bérszámfejtés: ${r.processed || 0} feldolgozva, ${r.skipped || 0} kihagyva`);
      setPayrollDialog({ open: false, month: payrollDialog.month, running: false });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Bérszámfejtés sikertelen');
      setPayrollDialog(p => ({ ...p, running: false }));
    }
  };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Bérlevonások</Typography>
            <Typography variant="body2" color="text.secondary">
              Automatikusan konvertált kártérítések havi törlesztése
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" color="primary" startIcon={<RunIcon />}
              onClick={() => setPayrollDialog({ ...payrollDialog, open: true })}>
              Bérszámfejtés futtatása
            </Button>
            <IconButton onClick={load} disabled={loading}><RefreshIcon /></IconButton>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
          <Chip label={`Aktív levonások: ${totals.active}`} color="warning" variant="outlined" />
          <Chip label={`Havi összeg: ${fmtMoney(totals.monthly)}`} variant="outlined" />
          <Chip label={`Hátralévő összes: ${fmtMoney(totals.outstanding)}`} color="error" variant="outlined" />
        </Stack>

        <FormControl size="small" sx={{ mt: 2, minWidth: 200 }}>
          <InputLabel>Státusz</InputLabel>
          <Select value={status} label="Státusz" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">Minden</MenuItem>
            <MenuItem value="active">Aktív</MenuItem>
            <MenuItem value="scheduled">Ütemezett</MenuItem>
            <MenuItem value="completed">Lezárt</MenuItem>
            <MenuItem value="cancelled">Törölt</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Alkalmazott</TableCell>
                <TableCell>Kártérítés</TableCell>
                <TableCell align="right">Havi</TableCell>
                <TableCell>Haladás</TableCell>
                <TableCell align="right">Levont</TableCell>
                <TableCell>Időszak</TableCell>
                <TableCell>Státusz</TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(r => {
                const st = STATUS_CHIP[r.status] || { label: r.status, color: 'default' };
                const pct = r.months_total ? Math.round((r.months_completed || 0) / r.months_total * 100) : 0;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{r.employee_name}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2">{r.compensation_number || '—'}</Typography>
                        <Chip size="small" label={r.compensation_type === 'fine' ? 'Bírság' : 'Kártérítés'} variant="outlined" />
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtMoney(r.monthly_amount)}</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>
                      <Typography variant="caption">{r.months_completed || 0} / {r.months_total || 0}</Typography>
                      <LinearProgress variant="determinate" value={pct} />
                    </TableCell>
                    <TableCell align="right">{fmtMoney(r.amount_deducted)}</TableCell>
                    <TableCell>{r.start_month || '—'} ↔ {r.end_month || '—'}</TableCell>
                    <TableCell><Chip size="small" color={st.color} label={st.label} /></TableCell>
                    <TableCell align="right">
                      {r.compensation_id && (
                        <IconButton size="small" onClick={() => navigate(`/compensations/${r.compensation_id}`)}>
                          <OpenIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>Nincs bérlevonás.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={payrollDialog.open} onClose={() => !payrollDialog.running && setPayrollDialog({ ...payrollDialog, open: false })} maxWidth="xs" fullWidth>
        <DialogTitle>Bérszámfejtés futtatása</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            A megadott hónapra egyszer hozza létre a havi levonási bejegyzéseket minden aktív bérlevonáson. Ismételt futtatás nem ír duplán.
          </Alert>
          <TextField
            label="Hónap (YYYY-MM) *" fullWidth
            value={payrollDialog.month}
            onChange={e => setPayrollDialog({ ...payrollDialog, month: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayrollDialog({ ...payrollDialog, open: false })} disabled={payrollDialog.running}>Mégsem</Button>
          <Button variant="contained" onClick={runPayroll} disabled={payrollDialog.running}>
            {payrollDialog.running ? 'Futás…' : 'Futtatás'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
