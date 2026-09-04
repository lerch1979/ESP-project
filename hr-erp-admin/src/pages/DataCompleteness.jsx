import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Checkbox, Button, LinearProgress, Chip, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Stack,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { toast } from 'react-toastify';
import api from '../services/api';

/**
 * Hiányzó adatok — what the roster is missing, and a way to collect it in bulk.
 *
 * The 2026-09-04 intake audit found features switched on and watching nothing: the
 * expiry monitor enabled with all three of its inputs empty, the move-in video drip
 * anchored on an arrival date most of the roster lacks, no resident language recorded
 * anywhere. The fix is not to open 279 records and type.
 *
 * So this page is one half of a round trip: see the gaps → export a workbook containing
 * ONLY the affected people and ONLY the missing columns → fill it in the field → re-upload
 * through the ordinary bulk import, which matches on three identifying fields and writes
 * only the columns the file actually carries.
 */
export default function DataCompleteness() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [drill, setDrill] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/employees/completeness');
      setData(r.data?.data || null);
    } catch (e) {
      setError(e.response?.data?.message || 'Nem sikerült betölteni a hiányzó adatokat');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (key) => setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const openDrill = async (f) => {
    try {
      const r = await api.get(`/employees/completeness/${f.key}`);
      setDrill(r.data?.data || null);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Nem sikerült betölteni a listát');
    }
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const r = await api.get('/employees/completeness/export', {
        params: { fields: selected.join(',') }, responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `hianyzo-adatok-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Munkafüzet letöltve — kitöltés után a Munkavállalók → Import fülön töltsd vissza');
    } catch (e) {
      toast.error('Az export nem sikerült');
    } finally { setExporting(false); }
  };

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

  const excelFields = data.fields.filter((f) => f.fillable_by_excel);
  const selectable = excelFields.filter((f) => f.missing > 0);
  const affected = selected.length
    ? Math.max(...data.fields.filter((f) => selected.includes(f.key)).map((f) => f.missing))
    : 0;

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Hiányzó adatok</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {data.active_employees} aktív munkavállaló. Jelöld ki, mit szeretnél begyűjteni, töltsd le a
        munkafüzetet, és kitöltés után <strong>ugyanazzal a fájllal</strong> töltsd vissza a
        Munkavállalók → Import fülön. Az üresen hagyott mezők nem írják felül a meglévő adatokat.
      </Typography>

      <Paper sx={{ mb: 2 }}>
        <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2">
            {selected.length === 0
              ? 'Nincs kijelölt mező'
              : `${selected.length} mező kijelölve · legfeljebb ${affected} ember kerül a munkafüzetbe`}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => setSelected(selectable.map((f) => f.key))}>
            Minden hiányzó
          </Button>
          <Button size="small" onClick={() => setSelected([])}>Kijelölés törlése</Button>
          <Button
            variant="contained" startIcon={<DownloadIcon />}
            disabled={selected.length === 0 || exporting} onClick={exportXlsx}
          >
            Kitöltő munkafüzet letöltése
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" />
              <TableCell sx={{ fontWeight: 600 }}>Mező</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Hiányzik</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Megvan</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 200 }}>Készültség</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Mi nem működik nélküle</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {data.fields.map((f) => {
              const none = f.missing === 0;
              return (
                <TableRow key={f.key} hover>
                  <TableCell padding="checkbox">
                    <Tooltip title={f.fillable_by_excel ? '' : 'Excelből nem tölthető ki'}>
                      <span>
                        <Checkbox
                          size="small" checked={selected.includes(f.key)}
                          disabled={!f.fillable_by_excel || none}
                          onChange={() => toggle(f.key)}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>
                    {f.label}
                    {!f.fillable_by_excel && (
                      <Chip size="small" variant="outlined" label="feltöltés" sx={{ ml: 1 }} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2"
                                sx={{ fontWeight: 700, color: none ? 'success.main' : f.missing > f.complete ? 'error.main' : 'warning.main' }}>
                      {f.missing}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{f.complete}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LinearProgress
                        variant="determinate" value={f.pct_complete}
                        sx={{ flex: 1, height: 8, borderRadius: 4,
                              '& .MuiLinearProgress-bar': {
                                bgcolor: f.pct_complete === 100 ? '#10b981' : f.pct_complete < 50 ? '#ef4444' : '#f59e0b',
                              } }}
                      />
                      <Typography variant="caption" sx={{ minWidth: 34, fontWeight: 600 }}>
                        {f.pct_complete}%
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{f.why}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    {!none && (
                      <Tooltip title="Kik hiányoznak">
                        <Button size="small" startIcon={<VisibilityIcon />} onClick={() => openDrill(f)}>
                          Lista
                        </Button>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!drill} onClose={() => setDrill(null)} maxWidth="md" fullWidth>
        <DialogTitle>{drill?.label} — hiányzik ({drill?.count})</DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Törzsszám</TableCell><TableCell>Név</TableCell>
                  <TableCell>Születési dátum</TableCell><TableCell>Szálláshely</TableCell>
                  <TableCell>Szobaszám</TableCell><TableCell>Munkahely</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(drill?.employees || []).map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell>{e.employee_number || '—'}</TableCell>
                    <TableCell>{e.last_name} {e.first_name}</TableCell>
                    <TableCell>{e.birth_date || '—'}</TableCell>
                    <TableCell>{e.accommodation || '—'}</TableCell>
                    <TableCell>{e.room_number || '—'}</TableCell>
                    <TableCell>{e.workplace || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={() => setDrill(null)}>Bezárás</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
