import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, TextField, MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Chip, CircularProgress, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Visibility as VisibilityIcon, Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';
import ExportButton from '../../components/inspections/ExportButton';

const STATUS_CHIP = {
  draft:         { label: 'Piszkozat',         color: 'default' },
  issued:        { label: 'Kiállítva',         color: 'info' },
  notified:      { label: 'Értesítve',         color: 'info' },
  disputed:      { label: 'Vitatott',          color: 'warning' },
  partial_paid:  { label: 'Részben fizetve',   color: 'warning' },
  paid:          { label: 'Kiegyenlítve',      color: 'success' },
  waived:        { label: 'Elengedve',         color: 'default' },
  escalated:     { label: 'Eszkalálva',        color: 'error' },
  closed:        { label: 'Lezárt',            color: 'default' },
};

const TYPE_LABEL = {
  damage: 'Kár',
  cleaning: 'Takarítás',
  late_payment: 'Késedelem',
  contract_violation: 'Szerződésszegés',
  other: 'Egyéb',
};

const fmtMoney = (n, cur = 'HUF') =>
  n == null ? '—' : `${Number(n).toLocaleString('hu-HU')} ${cur}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('hu-HU') : '—';

export default function CompensationsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [filters, setFilters] = useState({ status: '', overdue: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: perPage, offset: page * perPage };
      if (filters.status) params.status = filters.status;
      if (filters.overdue) params.overdue = 'true';
      const res = await inspectionsAPI.listCompensations(params);
      setRows(res?.data || []);
      setTotal(res?.pagination?.total || 0);
    } catch (e) {
      toast.error('Kártérítések betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, filters]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const gross = rows.reduce((s, r) => s + (Number(r.amountGross) || 0), 0);
    const paid  = rows.reduce((s, r) => s + (Number(r.amountPaid)  || 0), 0);
    return { gross, paid, outstanding: gross - paid };
  }, [rows]);

  const isOverdue = (r) =>
    r.dueDate && new Date(r.dueDate) < new Date() &&
    ['issued','notified','disputed','partial_paid'].includes(r.status);

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Kártérítések</Typography>
            <Typography variant="body2" color="text.secondary">
              Ellenőrzésből származó követelések, értesítők és fizetések
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <ExportButton
              label="Export" filenameBase="karteritesek-birsagok"
              onExport={inspectionsAPI.exportCompensationsXlsx}
              filters={[
                { key: 'type', label: 'Típus', options: [
                  { value: 'fine',   label: 'Bírság' },
                  { value: 'damage', label: 'Kártérítés' },
                ] },
                { key: 'status', label: 'Státusz', options: Object.entries(STATUS_CHIP).map(([v, m]) => ({ value: v, label: m.label })) },
              ]}
              defaultFilters={{ status: filters.status || '' }}
            />
            <Button
              variant="contained" startIcon={<AddIcon />}
              onClick={() => navigate('/compensations/new')}
            >
              Új kártérítés
            </Button>
          </Stack>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Státusz</InputLabel>
            <Select
              value={filters.status}
              label="Státusz"
              onChange={(e) => { setFilters(f => ({ ...f, status: e.target.value })); setPage(0); }}
            >
              <MenuItem value="">Minden</MenuItem>
              {Object.entries(STATUS_CHIP).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant={filters.overdue ? 'contained' : 'outlined'}
            color="error"
            startIcon={<WarningIcon />}
            onClick={() => { setFilters(f => ({ ...f, overdue: !f.overdue })); setPage(0); }}
          >
            Csak lejárt
          </Button>
          <IconButton onClick={load} sx={{ ml: 'auto' }}><RefreshIcon /></IconButton>
        </Stack>

        <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
          <Chip label={`Találatok: ${total}`} />
          <Chip label={`Összeg: ${fmtMoney(totals.gross)}`} color="default" variant="outlined" />
          <Chip label={`Befizetve: ${fmtMoney(totals.paid)}`} color="success" variant="outlined" />
          <Chip label={`Hátralék: ${fmtMoney(totals.outstanding)}`} color="error" variant="outlined" />
        </Stack>
      </Paper>

      <Paper>
        {loading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
        {!loading && (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Azonosító</TableCell>
                    <TableCell>Típus</TableCell>
                    <TableCell>Ingatlan</TableCell>
                    <TableCell>Felelős</TableCell>
                    <TableCell align="right">Összeg</TableCell>
                    <TableCell align="right">Hátralék</TableCell>
                    <TableCell>Státusz</TableCell>
                    <TableCell>Határidő</TableCell>
                    <TableCell align="right">Nyitás</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r) => {
                    const st = STATUS_CHIP[r.status] || { label: r.status, color: 'default' };
                    const overdue = isOverdue(r);
                    return (
                      <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/compensations/${r.id}`)}>
                        <TableCell sx={{ fontWeight: 600 }}>{r.compensationNumber}</TableCell>
                        <TableCell>{TYPE_LABEL[r.compensationType] || r.compensationType}</TableCell>
                        <TableCell>{r.accommodationName || '—'}</TableCell>
                        <TableCell>{r.responsibleName || '—'}</TableCell>
                        <TableCell align="right">{fmtMoney(r.amountGross, r.currency)}</TableCell>
                        <TableCell align="right" sx={{ color: r.amountOutstanding > 0 ? 'error.main' : 'text.primary', fontWeight: 600 }}>
                          {fmtMoney(r.amountOutstanding, r.currency)}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Chip size="small" color={st.color} label={st.label} />
                            {r.escalationLevel > 0 && (
                              <Chip size="small" color="warning" label={`L${r.escalationLevel}`} />
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ color: overdue ? 'error.main' : 'text.primary', fontWeight: overdue ? 600 : 400 }}>
                          {fmtDate(r.dueDate)}
                          {overdue && <Tooltip title="Lejárt"><WarningIcon fontSize="inherit" sx={{ ml: 0.5, verticalAlign: 'middle' }} /></Tooltip>}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/compensations/${r.id}`); }}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nincs találat</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={perPage}
              onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50, 100]}
              labelRowsPerPage="Sorok oldalanként:"
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
