import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Button, IconButton, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem, FormControlLabel, Switch, Card, CardContent,
  CircularProgress, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Refresh as RefreshIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI, accommodationsAPI, usersAPI } from '../../services/api';

const FREQUENCIES = [
  { value: 'weekly', label: 'Heti' },
  { value: 'biweekly', label: 'Kéthetente' },
  { value: 'monthly', label: 'Havi' },
  { value: 'quarterly', label: 'Negyedéves' },
  { value: 'semi_annual', label: 'Féléves' },
  { value: 'annual', label: 'Éves' },
];

const emptyForm = {
  accommodation_id: '',
  frequency: 'monthly',
  next_due_date: '',
  default_inspector_id: '',
  is_active: true,
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('hu-HU') : '-';

const daysFromNow = (d) => {
  if (!d) return null;
  const diff = Math.floor((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
};

export default function InspectionSchedules() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [upcoming, setUpcoming] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [users, setUsers] = useState([]);

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedules, up, accs, us] = await Promise.all([
        inspectionsAPI.listSchedules(),
        inspectionsAPI.upcomingSchedules(30).catch(() => ({ data: [] })),
        accommodationsAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        usersAPI.getAll().catch(() => ({ data: [] })),
      ]);
      setRows(schedules?.data || []);
      setUpcoming(up?.data || []);
      setAccommodations(accs?.data || []);
      setUsers(us?.data || []);
    } catch (e) {
      toast.error('Nem sikerült betölteni az ütemezéseket');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(emptyForm); setModal('create'); };
  const openEdit = (row) => {
    setForm({
      id: row.id,
      accommodation_id: row.accommodation_id || row.accommodationId || '',
      frequency: row.frequency || 'monthly',
      next_due_date: (row.next_due_date || row.nextDueDate || '').slice(0, 10),
      default_inspector_id: row.default_inspector_id || row.defaultInspectorId || '',
      is_active: row.is_active ?? row.isActive ?? true,
    });
    setModal('edit');
  };

  const save = async () => {
    if (!form.accommodation_id) { toast.warning('Válassz szálláshelyet'); return; }
    setSaving(true);
    try {
      const payload = {
        accommodation_id: Number(form.accommodation_id),
        frequency: form.frequency,
        next_due_date: form.next_due_date || null,
        default_inspector_id: form.default_inspector_id || null,
        is_active: form.is_active,
      };
      if (modal === 'create') {
        await inspectionsAPI.createSchedule(payload);
        toast.success('Ütemezés létrehozva');
      } else {
        await inspectionsAPI.updateSchedule(form.id, payload);
        toast.success('Ütemezés frissítve');
      }
      setModal(null);
      load();
    } catch (e) {
      toast.error('Sikertelen mentés: ' + (e?.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row) => {
    try {
      await inspectionsAPI.updateSchedule(row.id, { is_active: !(row.is_active ?? row.isActive) });
      load();
    } catch { toast.error('Sikertelen frissítés'); }
  };

  const remove = async (row) => {
    if (!window.confirm('Biztosan törlöd ezt az ütemezést?')) return;
    try {
      await inspectionsAPI.deleteSchedule(row.id);
      toast.success('Törölve');
      load();
    } catch { toast.error('Sikertelen törlés'); }
  };

  const userLabel = (u) => {
    if (!u) return '-';
    const name = [u.first_name || u.firstName, u.last_name || u.lastName].filter(Boolean).join(' ');
    return name || u.email || `#${u.id}`;
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Ellenőrzési ütemezések</Typography>
        <Stack direction="row" spacing={1}>
          <IconButton onClick={load}><RefreshIcon /></IconButton>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Új ütemezés</Button>
        </Stack>
      </Stack>

      <Card variant="outlined" sx={{ mb: 2, bgcolor: '#eef2ff' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ScheduleIcon color="primary" />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Következő 30 nap: {upcoming.length} esedékes ellenőrzés
            </Typography>
            <Typography variant="caption" color="text.secondary">
              A lejárt sorok pirossal, a 7 napon belül esedékesek sárgával jelennek meg.
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Szálláshely</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Gyakoriság</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Következő esedékes</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Alap ellenőr</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Aktív</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nincs ütemezés</TableCell></TableRow>
              ) : rows.map((row) => {
                const due = row.next_due_date || row.nextDueDate;
                const days = daysFromNow(due);
                let dueColor = 'text.primary';
                let dueBg = 'transparent';
                if (days != null) {
                  if (days < 0) { dueColor = '#b91c1c'; dueBg = '#fef2f2'; }
                  else if (days <= 7) { dueColor = '#b45309'; dueBg = '#fffbeb'; }
                }
                const acc = accommodations.find((a) => a.id === (row.accommodation_id || row.accommodationId));
                const insp = users.find((u) => u.id === (row.default_inspector_id || row.defaultInspectorId));
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>{acc?.name || row.accommodation_name || row.accommodationName || '-'}</TableCell>
                    <TableCell>{FREQUENCIES.find((f) => f.value === row.frequency)?.label || row.frequency}</TableCell>
                    <TableCell sx={{ color: dueColor, bgcolor: dueBg }}>
                      <Typography variant="body2" sx={{ fontWeight: days != null && days <= 7 ? 700 : 400 }}>
                        {fmtDate(due)}
                      </Typography>
                      {days != null && (
                        <Typography variant="caption" sx={{ color: dueColor }}>
                          {days < 0 ? `${Math.abs(days)} napja lejárt` : days === 0 ? 'Ma' : `${days} nap múlva`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{insp ? userLabel(insp) : '-'}</TableCell>
                    <TableCell>
                      <Switch size="small" checked={Boolean(row.is_active ?? row.isActive)} onChange={() => toggleActive(row)} />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Szerkesztés">
                        <IconButton size="small" onClick={() => openEdit(row)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Törlés">
                        <IconButton size="small" color="error" onClick={() => remove(row)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={Boolean(modal)} onClose={() => setModal(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{modal === 'create' ? 'Új ütemezés' : 'Ütemezés szerkesztése'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Szálláshely *</InputLabel>
              <Select label="Szálláshely *" value={form.accommodation_id} onChange={(e) => setForm({ ...form, accommodation_id: e.target.value })}>
                {accommodations.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Gyakoriság *</InputLabel>
              <Select label="Gyakoriság *" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {FREQUENCIES.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="Következő esedékes" type="date" size="small"
              value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
              InputLabelProps={{ shrink: true }} fullWidth
            />
            <FormControl fullWidth size="small">
              <InputLabel>Alap ellenőr</InputLabel>
              <Select label="Alap ellenőr" value={form.default_inspector_id} onChange={(e) => setForm({ ...form, default_inspector_id: e.target.value })}>
                <MenuItem value="">— Nincs —</MenuItem>
                {users.map((u) => <MenuItem key={u.id} value={u.id}>{userLabel(u)}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
              label="Aktív"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModal(null)} disabled={saving}>Mégse</Button>
          <Button onClick={save} variant="contained" disabled={saving}>{saving ? 'Mentés…' : 'Mentés'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
