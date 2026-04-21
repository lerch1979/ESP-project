import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Stack, TextField, FormControl, InputLabel, Select, MenuItem,
  Button, Card, CardContent, Grid, Table, TableHead, TableRow, TableCell, TableBody,
  TableContainer, CircularProgress, Tooltip,
} from '@mui/material';
import {
  FileDownload as FileDownloadIcon, PictureAsPdf as PictureAsPdfIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI, accommodationsAPI, usersAPI } from '../../services/api';
import GradeBadge from '../../components/inspections/GradeBadge';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('hu-HU') : '-';

const toCSV = (rows) => {
  const headers = ['Ellenőrzés #', 'Szálláshely', 'Ellenőr', 'Típus', 'Státusz', 'Értékelés', 'Összpontszám', 'Műszaki', 'Higiénia', 'Esztétika', 'Ütemezve', 'Befejezve'];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(';')];
  rows.forEach((r) => {
    lines.push([
      r.inspectionNumber, r.accommodationName, r.inspectorName, r.inspectionType, r.status,
      r.grade, r.totalScore, r.technicalScore, r.hygieneScore, r.aestheticScore,
      fmtDate(r.scheduledAt), fmtDate(r.completedAt),
    ].map(esc).join(';'));
  });
  return lines.join('\n');
};

export default function InspectionReports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [accommodations, setAccommodations] = useState([]);
  const [users, setUsers] = useState([]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accommodationId, setAccommodationId] = useState('');
  const [inspectorId, setInspectorId] = useState('');

  const loadFilters = useCallback(async () => {
    try {
      const [accs, us] = await Promise.all([
        accommodationsAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        usersAPI.getAll().catch(() => ({ data: [] })),
      ]);
      setAccommodations(accs?.data || []);
      setUsers(us?.data || []);
    } catch {}
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 500 };
      if (from) params.from = from;
      if (to) params.to = to;
      if (accommodationId) params.accommodation_id = accommodationId;
      if (inspectorId) params.inspector_id = inspectorId;
      const res = await inspectionsAPI.getAll(params);
      setRows(res?.data || []);
    } catch (e) {
      toast.error('Nem sikerült betölteni a riportot');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, accommodationId, inspectorId]);

  useEffect(() => { loadFilters(); }, [loadFilters]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const summary = useMemo(() => {
    const scored = rows.filter((r) => r.totalScore != null);
    const avg = scored.length ? scored.reduce((a, b) => a + Number(b.totalScore), 0) / scored.length : 0;
    // Count tasks per inspection (needs inspection detail to know precise count).
    // Approximation: use rows.length as inspection count; surface tasks unknown without N+1 calls.
    const topProblems = [];
    return { count: rows.length, avg, topProblems };
  }, [rows]);

  const downloadCSV = () => {
    try {
      const csv = toCSV(rows);
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `ellenorzesek-riport-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('CSV letöltés elindítva');
    } catch {
      toast.error('Sikertelen export');
    }
  };

  const userLabel = (u) => {
    if (!u) return '-';
    const name = [u.first_name || u.firstName, u.last_name || u.lastName].filter(Boolean).join(' ');
    return name || u.email || `#${u.id}`;
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Ellenőrzési riportok</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={loadRows}>Frissítés</Button>
          <Tooltip title="CSV export">
            <Button variant="contained" startIcon={<FileDownloadIcon />} onClick={downloadCSV} disabled={rows.length === 0}>
              Exportálás CSV-ként
            </Button>
          </Tooltip>
          <Tooltip title="PDF export — hamarosan">
            <span>
              <Button variant="outlined" startIcon={<PictureAsPdfIcon />} disabled>
                PDF (hamarosan)
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <TextField size="small" type="date" label="Tól" InputLabelProps={{ shrink: true }}
            value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField size="small" type="date" label="Ig" InputLabelProps={{ shrink: true }}
            value={to} onChange={(e) => setTo(e.target.value)} />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Szálláshely</InputLabel>
            <Select label="Szálláshely" value={accommodationId} onChange={(e) => setAccommodationId(e.target.value)}>
              <MenuItem value="">Összes</MenuItem>
              {accommodations.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Ellenőr</InputLabel>
            <Select label="Ellenőr" value={inspectorId} onChange={(e) => setInspectorId(e.target.value)}>
              <MenuItem value="">Összes</MenuItem>
              {users.map((u) => <MenuItem key={u.id} value={u.id}>{userLabel(u)}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                Ellenőrzések száma
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>{summary.count}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                Átlagpontszám
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, color: summary.avg >= 70 ? '#16a34a' : summary.avg >= 50 ? '#f59e0b' : '#dc2626' }}>
                {summary.avg ? summary.avg.toFixed(1) : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                Időszak
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600, mt: 1 }}>
                {from ? fmtDate(from) : 'Kezdettől'} — {to ? fmtDate(to) : 'ma'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Ellenőrzés #</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Szálláshely</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Ellenőr</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Értékelés</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Pontszám</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Befejezve</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nincs találat</TableCell></TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{row.inspectionNumber}</Typography></TableCell>
                  <TableCell>{row.accommodationName || '-'}</TableCell>
                  <TableCell>{row.inspectorName || '-'}</TableCell>
                  <TableCell>{row.inspectionType || '-'}</TableCell>
                  <TableCell><GradeBadge grade={row.grade} /></TableCell>
                  <TableCell align="right">
                    {row.totalScore != null ? Number(row.totalScore).toFixed(1) : '-'}
                  </TableCell>
                  <TableCell>{fmtDate(row.completedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
