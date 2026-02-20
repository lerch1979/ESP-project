import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, Switch, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Select, MenuItem, FormControl, InputLabel, Tooltip,
  CircularProgress, Alert,
} from '@mui/material';
import {
  Schedule as ScheduleIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayArrowIcon,
  History as HistoryIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import { scheduledReportsAPI } from '../services/api';

const REPORT_TYPES = [
  { value: 'employees', label: 'Munkavállalók összesítő' },
  { value: 'accommodations', label: 'Szálláshelyek' },
  { value: 'tickets', label: 'Hibajegyek' },
  { value: 'contractors', label: 'Alvállalkozók' },
  { value: 'occupancy', label: 'Kihasználtság' },
];

const SCHEDULE_TYPES = [
  { value: 'daily', label: 'Naponta' },
  { value: 'weekly', label: 'Hetente' },
  { value: 'monthly', label: 'Havonta' },
];

const DAY_NAMES = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];

const REPORT_TYPE_LABELS = {
  employees: 'Munkavállalók',
  accommodations: 'Szálláshelyek',
  tickets: 'Hibajegyek',
  contractors: 'Alvállalkozók',
  occupancy: 'Kihasználtság',
};

const STATUS_COLORS = {
  success: 'success',
  failed: 'error',
  running: 'info',
};

function formatSchedule(report) {
  const time = (report.schedule_time || '08:00').slice(0, 5);
  if (report.schedule_type === 'daily') return `Naponta ${time}`;
  if (report.schedule_type === 'weekly') {
    const day = DAY_NAMES[report.day_of_week] || 'Hétfő';
    return `Hetente ${day} ${time}`;
  }
  if (report.schedule_type === 'monthly') {
    return `Havonta ${report.day_of_month || 1}. ${time}`;
  }
  return '-';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('hu-HU');
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const emptyForm = {
  name: '',
  report_type: 'employees',
  schedule_type: 'daily',
  schedule_time: '08:00',
  day_of_week: 1,
  day_of_month: 1,
  recipients_text: '',
  filters: [],
};

export default function ScheduledReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runTarget, setRunTarget] = useState(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await scheduledReportsAPI.getAll();
      setReports(res.data || []);
    } catch (err) {
      toast.error('Hiba az ütemezett riportok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // ---- Create / Edit dialog ----

  const openCreateDialog = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (report) => {
    setEditingId(report.id);
    setForm({
      name: report.name || '',
      report_type: report.report_type || 'employees',
      schedule_type: report.schedule_type || 'daily',
      schedule_time: (report.schedule_time || '08:00').slice(0, 5),
      day_of_week: report.day_of_week ?? 1,
      day_of_month: report.day_of_month ?? 1,
      recipients_text: (report.recipients || []).join(', '),
      filters: report.filters || [],
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('A név megadása kötelező'); return; }
    const recipients = form.recipients_text
      .split(/[,;\n]+/)
      .map(e => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) { toast.error('Legalább egy címzett szükséges'); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        report_type: form.report_type,
        schedule_type: form.schedule_type,
        schedule_time: form.schedule_time,
        day_of_week: form.schedule_type === 'weekly' ? form.day_of_week : null,
        day_of_month: form.schedule_type === 'monthly' ? form.day_of_month : null,
        recipients,
        filters: form.filters,
      };

      if (editingId) {
        await scheduledReportsAPI.update(editingId, payload);
        toast.success('Ütemezett riport módosítva');
      } else {
        await scheduledReportsAPI.create(payload);
        toast.success('Ütemezett riport létrehozva');
      }
      setDialogOpen(false);
      fetchReports();
    } catch (err) {
      toast.error('Hiba a mentés során');
    } finally {
      setSaving(false);
    }
  };

  // ---- Toggle active ----
  const handleToggle = async (report) => {
    try {
      await scheduledReportsAPI.toggleActive(report.id);
      fetchReports();
    } catch {
      toast.error('Hiba a státusz váltáskor');
    }
  };

  // ---- Delete ----
  const handleDelete = async () => {
    try {
      await scheduledReportsAPI.delete(deleteTarget.id);
      toast.success('Ütemezett riport törölve');
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      fetchReports();
    } catch {
      toast.error('Hiba a törlés során');
    }
  };

  // ---- Run now ----
  const handleRunNow = async () => {
    try {
      await scheduledReportsAPI.triggerRun(runTarget.id);
      toast.success('Riport futtatás elindítva');
      setRunDialogOpen(false);
      setRunTarget(null);
      // Refresh after a short delay to show run status
      setTimeout(fetchReports, 2000);
    } catch {
      toast.error('Hiba a futtatás során');
    }
  };

  // ---- History ----
  const openHistoryDialog = async (report) => {
    setHistoryTarget(report);
    setHistoryDialogOpen(true);
    setHistoryLoading(true);
    try {
      const res = await scheduledReportsAPI.getRunHistory(report.id);
      setRunHistory(res.data || []);
    } catch {
      toast.error('Hiba az előzmények betöltésekor');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <Layout>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScheduleIcon sx={{ fontSize: 32, color: '#2563eb' }} />
          <Typography variant="h5" fontWeight={700}>Ütemezett riportok</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1e4620' } }}>
          Új ütemezett riport
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : reports.length === 0 ? (
        <Alert severity="info">Még nincsenek ütemezett riportok. Hozz létre egyet a gombbal!</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 700 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Riport típus</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Ütemezés</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Következő futás</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Utolsó futás</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Státusz</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Aktív</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{REPORT_TYPE_LABELS[r.report_type] || r.report_type}</TableCell>
                  <TableCell>
                    <Chip label={formatSchedule(r)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{r.is_active ? formatDate(r.next_run_at) : '-'}</TableCell>
                  <TableCell>{formatDate(r.last_run_at)}</TableCell>
                  <TableCell>
                    {r.last_run_status ? (
                      <Chip label={r.last_run_status} size="small"
                        color={STATUS_COLORS[r.last_run_status] || 'default'} />
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.is_active} onChange={() => handleToggle(r)}
                      color="success" size="small" />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Szerkesztés">
                      <IconButton size="small" onClick={() => openEditDialog(r)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Futtatás most">
                      <IconButton size="small" color="primary"
                        onClick={() => { setRunTarget(r); setRunDialogOpen(true); }}>
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Előzmények">
                      <IconButton size="small" onClick={() => openHistoryDialog(r)}>
                        <HistoryIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Törlés">
                      <IconButton size="small" color="error"
                        onClick={() => { setDeleteTarget(r); setDeleteDialogOpen(true); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ===== Create / Edit Dialog ===== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingId ? 'Ütemezett riport szerkesztése' : 'Új ütemezett riport'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
          <TextField label="Név" value={form.name} fullWidth
            onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <FormControl fullWidth>
            <InputLabel>Riport típus</InputLabel>
            <Select value={form.report_type} label="Riport típus"
              onChange={(e) => setForm({ ...form, report_type: e.target.value })}>
              {REPORT_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Ütemezés típus</InputLabel>
            <Select value={form.schedule_type} label="Ütemezés típus"
              onChange={(e) => setForm({ ...form, schedule_type: e.target.value })}>
              {SCHEDULE_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField label="Időpont" type="time" value={form.schedule_time} fullWidth
            InputLabelProps={{ shrink: true }}
            onChange={(e) => setForm({ ...form, schedule_time: e.target.value })} />

          {form.schedule_type === 'weekly' && (
            <FormControl fullWidth>
              <InputLabel>Nap</InputLabel>
              <Select value={form.day_of_week} label="Nap"
                onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                {DAY_NAMES.map((name, i) => <MenuItem key={i} value={i}>{name}</MenuItem>)}
              </Select>
            </FormControl>
          )}

          {form.schedule_type === 'monthly' && (
            <TextField label="Hónap napja" type="number" value={form.day_of_month} fullWidth
              inputProps={{ min: 1, max: 31 }}
              onChange={(e) => setForm({ ...form, day_of_month: parseInt(e.target.value) || 1 })} />
          )}

          <TextField label="Címzettek (vesszővel elválasztva)" multiline rows={2} fullWidth
            value={form.recipients_text} placeholder="pelda@email.hu, masik@email.hu"
            onChange={(e) => setForm({ ...form, recipients_text: e.target.value })} />

          {form.recipients_text && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {form.recipients_text.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean).map((email, i) => (
                <Chip key={i} label={email} size="small" />
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1e4620' } }}>
            {saving ? <CircularProgress size={20} /> : (editingId ? 'Mentés' : 'Létrehozás')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Delete Confirmation ===== */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Ütemezett riport törlése</DialogTitle>
        <DialogContent>
          <Typography>Biztosan törölni szeretnéd a(z) <strong>{deleteTarget?.name}</strong> ütemezett riportot?
            Ez a futtatási előzményeket is törli.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Mégse</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Törlés</Button>
        </DialogActions>
      </Dialog>

      {/* ===== Run Confirmation ===== */}
      <Dialog open={runDialogOpen} onClose={() => setRunDialogOpen(false)}>
        <DialogTitle>Riport futtatása</DialogTitle>
        <DialogContent>
          <Typography>Biztosan futtatni szeretnéd most a(z) <strong>{runTarget?.name}</strong> riportot?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDialogOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleRunNow}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1e4620' } }}>
            Futtatás
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Run History Dialog ===== */}
      <Dialog open={historyDialogOpen} onClose={() => setHistoryDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Futtatási előzmények — {historyTarget?.name}
          <IconButton onClick={() => setHistoryDialogOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : runHistory.length === 0 ? (
            <Alert severity="info">Még nem volt futtatás.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Indulás</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Befejezés</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Rekordok</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Fájlméret</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Címzettek</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Hiba</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runHistory.map((run) => (
                    <TableRow key={run.id} hover>
                      <TableCell>{formatDate(run.started_at)}</TableCell>
                      <TableCell>{formatDate(run.completed_at)}</TableCell>
                      <TableCell>
                        <Chip label={run.status} size="small"
                          color={STATUS_COLORS[run.status] || 'default'} />
                      </TableCell>
                      <TableCell>{run.records_count ?? '-'}</TableCell>
                      <TableCell>{formatFileSize(run.file_size)}</TableCell>
                      <TableCell>{run.recipients_count ?? '-'}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {run.error_message || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
