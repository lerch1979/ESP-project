import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, TextField, MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Chip, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Visibility as VisibilityIcon, Delete as DeleteIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI, accommodationsAPI } from '../../services/api';
import GradeBadge from '../../components/inspections/GradeBadge';
import ExportButton from '../../components/inspections/ExportButton';

const STATUS_OPTIONS = [
  { value: '', label: 'Minden' },
  { value: 'scheduled', label: 'Ütemezett' },
  { value: 'in_progress', label: 'Folyamatban' },
  { value: 'completed', label: 'Befejezett' },
  { value: 'reviewed', label: 'Átnézett' },
  { value: 'cancelled', label: 'Törölt' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'Minden típus' },
  { value: 'routine', label: 'Rutin' },
  { value: 'move_in', label: 'Beköltözés' },
  { value: 'move_out', label: 'Kiköltözés' },
  { value: 'complaint', label: 'Panasz' },
  { value: 'follow_up', label: 'Utánkövetés' },
];

const STATUS_CHIP = {
  scheduled: { label: 'Ütemezett', color: 'info' },
  in_progress: { label: 'Folyamatban', color: 'warning' },
  completed: { label: 'Befejezett', color: 'success' },
  reviewed: { label: 'Átnézett', color: 'success' },
  cancelled: { label: 'Törölt', color: 'default' },
};

const fmtDate = (d) => {
  if (!d) return '-';
  try { return new Date(d).toLocaleString('hu-HU'); } catch { return String(d); }
};

export default function InspectionsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [accommodations, setAccommodations] = useState([]);

  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [accommodationId, setAccommodationId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Create modal
  const shouldAutoOpen = searchParams.get('create') === '1';
  const [createOpen, setCreateOpen] = useState(false);
  const [newAccommodationId, setNewAccommodationId] = useState('');
  const [newType, setNewType] = useState('routine');
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (shouldAutoOpen) setCreateOpen(true);
  }, [shouldAutoOpen]);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadAccommodations = useCallback(async () => {
    try {
      const res = await accommodationsAPI.getAll({ limit: 500 });
      setAccommodations(res?.data || []);
    } catch {
      setAccommodations([]);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: rowsPerPage, offset: page * rowsPerPage };
      if (status) params.status = status;
      if (type) params.type = type;
      if (accommodationId) params.accommodation_id = accommodationId;
      if (from) params.from = from;
      if (to) params.to = to;
      const res = await inspectionsAPI.getAll(params);
      setRows(res?.data || []);
      setTotal(res?.pagination?.total ?? (res?.data?.length ?? 0));
    } catch (e) {
      toast.error('Nem sikerült betölteni az ellenőrzéseket');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status, type, accommodationId, from, to, page, rowsPerPage]);

  useEffect(() => { loadAccommodations(); }, [loadAccommodations]);
  useEffect(() => { loadRows(); }, [loadRows]);

  const handleCreate = async () => {
    if (!newAccommodationId) {
      toast.warning('Válassz szálláshelyet!');
      return;
    }
    setCreating(true);
    try {
      const payload = {
        accommodation_id: Number(newAccommodationId),
        inspection_type: newType,
      };
      if (newScheduledAt) payload.scheduled_at = newScheduledAt;
      const res = await inspectionsAPI.create(payload);
      toast.success('Ellenőrzés létrehozva');
      setCreateOpen(false);
      setNewAccommodationId('');
      setNewType('routine');
      setNewScheduledAt('');
      const newId = res?.data?.id;
      if (newId) {
        navigate(`/inspections/${newId}`);
      } else {
        loadRows();
      }
    } catch (e) {
      toast.error('Sikertelen létrehozás: ' + (e?.response?.data?.error || e.message));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await inspectionsAPI.remove(deleteTarget.id);
      toast.success('Ellenőrzés törölve');
      setDeleteTarget(null);
      loadRows();
    } catch (e) {
      toast.error('Sikertelen törlés');
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Ellenőrzések</Typography>
        <Stack direction="row" spacing={1}>
          <ExportButton
            label="Export" filenameBase="ellenorzesek"
            onExport={inspectionsAPI.exportInspectionsXlsx}
            filters={[
              { key: 'status', label: 'Státusz', options: STATUS_OPTIONS.filter(o => o.value) },
              { key: 'type',   label: 'Típus',   options: TYPE_OPTIONS.filter(o => o.value) },
              { key: 'accommodation_id', label: 'Szálláshely ID' },
            ]}
            defaultFilters={{
              status, type, accommodation_id: accommodationId,
              from: from ? from.slice(0, 10) : '', to: to ? to.slice(0, 10) : '',
            }}
          />
          <IconButton onClick={loadRows} title="Frissítés"><RefreshIcon /></IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            Új ellenőrzés
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Státusz</InputLabel>
            <Select label="Státusz" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value); }}>
              {STATUS_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Típus</InputLabel>
            <Select label="Típus" value={type} onChange={(e) => { setPage(0); setType(e.target.value); }}>
              {TYPE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Szálláshely</InputLabel>
            <Select label="Szálláshely" value={accommodationId} onChange={(e) => { setPage(0); setAccommodationId(e.target.value); }}>
              <MenuItem value="">Összes</MenuItem>
              {accommodations.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" type="date" label="Tól" InputLabelProps={{ shrink: true }}
            value={from} onChange={(e) => { setPage(0); setFrom(e.target.value); }} />
          <TextField size="small" type="date" label="Ig" InputLabelProps={{ shrink: true }}
            value={to} onChange={(e) => { setPage(0); setTo(e.target.value); }} />
        </Stack>
      </Paper>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Ellenőrzés #</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Szálláshely</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Ellenőr</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Értékelés</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Pontszám</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Létrehozva</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nincs találat</TableCell></TableRow>
              ) : rows.map((row) => {
                const st = STATUS_CHIP[row.status] || { label: row.status || '-', color: 'default' };
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {row.inspectionNumber || `#${row.id}`}
                      </Typography>
                    </TableCell>
                    <TableCell>{row.accommodationName || '-'}</TableCell>
                    <TableCell>{row.inspectorName || '-'}</TableCell>
                    <TableCell>{row.inspectionType || '-'}</TableCell>
                    <TableCell><Chip size="small" color={st.color} label={st.label} /></TableCell>
                    <TableCell><GradeBadge grade={row.grade} /></TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row.totalScore != null ? Number(row.totalScore).toFixed(1) : '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>{fmtDate(row.scheduledAt || row.startedAt)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Megnyitás">
                        <IconButton size="small" onClick={() => navigate(`/inspections/${row.id}`)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Törlés">
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value) || 25); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage="Sorok oldalanként"
        />
      </Paper>

      {/* Create modal */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Új ellenőrzés</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Szálláshely *</InputLabel>
              <Select label="Szálláshely *" value={newAccommodationId} onChange={(e) => setNewAccommodationId(e.target.value)}>
                {accommodations.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Típus *</InputLabel>
              <Select label="Típus *" value={newType} onChange={(e) => setNewType(e.target.value)}>
                {TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Ütemezés"
              type="datetime-local"
              size="small"
              value={newScheduledAt}
              onChange={(e) => setNewScheduledAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={creating}>Mégse</Button>
          <Button variant="contained" onClick={handleCreate} disabled={creating}>
            {creating ? 'Létrehozás…' : 'Létrehozás'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Biztosan törlöd?</DialogTitle>
        <DialogContent>
          <Typography>
            {deleteTarget?.inspectionNumber || `#${deleteTarget?.id}`} — {deleteTarget?.accommodationName || ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Ez visszavonhatatlan művelet.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Mégse</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Törlés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
