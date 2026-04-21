import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Stack, Tabs, Tab, Button, Chip, TextField, Grid, Divider,
  CircularProgress, IconButton, Table, TableHead, TableRow, TableCell, TableBody,
  Card, CardContent, Tooltip, Alert,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon, CheckCircle as CheckCircleIcon, Save as SaveIcon,
  PhotoCamera as PhotoCameraIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';
import ScoreGauge from '../../components/inspections/ScoreGauge';
import GradeBadge from '../../components/inspections/GradeBadge';
import PhotoGallery from '../../components/inspections/PhotoGallery';
import InspectionChecklist from '../../components/inspections/InspectionChecklist';
import PropertyMap from '../../components/inspections/PropertyMap';
import TaskAssignmentModal from '../../components/inspections/TaskAssignmentModal';

const STATUS_CHIP = {
  scheduled: { label: 'Ütemezett', color: 'info' },
  in_progress: { label: 'Folyamatban', color: 'warning' },
  completed: { label: 'Befejezett', color: 'success' },
  reviewed: { label: 'Átnézett', color: 'success' },
  cancelled: { label: 'Törölt', color: 'default' },
};

const fmt = (d) => {
  if (!d) return '-';
  try { return new Date(d).toLocaleString('hu-HU'); } catch { return String(d); }
};

export default function InspectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [generalNotes, setGeneralNotes] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inspectionsAPI.getById(id);
      const insp = res?.data || res;
      setData(insp);
      setGeneralNotes(insp?.generalNotes || '');
      setAdminNotes(insp?.adminReviewNotes || '');
    } catch (e) {
      toast.error('Nem sikerült betölteni az ellenőrzést');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await inspectionsAPI.listCategories();
      setCategories(res?.data || []);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => { load(); loadCategories(); }, [load, loadCategories]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await inspectionsAPI.update(id, {
        general_notes: generalNotes,
        admin_review_notes: adminNotes,
      });
      toast.success('Megjegyzések mentve');
      load();
    } catch (e) {
      toast.error('Sikertelen mentés');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleComplete = async () => {
    if (!window.confirm('Biztosan befejezed ezt az ellenőrzést? Ez automatikusan feladatokat is generál.')) return;
    setCompleting(true);
    try {
      const res = await inspectionsAPI.complete(id);
      const tc = res?.data?.tasksCreated ?? 0;
      toast.success(`Ellenőrzés befejezve — ${tc} feladat létrehozva.`);
      load();
    } catch (e) {
      toast.error('Sikertelen befejezés: ' + (e?.response?.data?.error || e.message));
    } finally {
      setCompleting(false);
    }
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await inspectionsAPI.uploadPhoto(id, formData);
      toast.success('Fotó feltöltve');
      load();
    } catch (err) {
      toast.error('Sikertelen feltöltés');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;
  }
  if (!data) {
    return <Alert severity="error">Nem található ellenőrzés (ID: {id}).</Alert>;
  }

  const st = STATUS_CHIP[data.status] || { label: data.status || '-', color: 'default' };
  const scores = data.scores || [];
  const photos = data.photos || [];
  const tasks = data.tasks || [];
  const damages = data.damages || [];

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <IconButton onClick={() => navigate('/inspections')}><ArrowBackIcon /></IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {data.inspectionNumber || `Ellenőrzés #${data.id}`}
        </Typography>
        <IconButton onClick={load} title="Frissítés"><RefreshIcon /></IconButton>
        {data.status === 'in_progress' && (
          <Button
            variant="contained" color="success" startIcon={<CheckCircleIcon />}
            onClick={handleComplete} disabled={completing}
          >
            {completing ? 'Befejezés…' : 'Befejezés'}
          </Button>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="body2" color="text.secondary">Szálláshely</Typography>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              {data.accommodationName || '-'}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" color={st.color} label={st.label} />
              <GradeBadge grade={data.grade} />
              <Chip size="small" variant="outlined" label={data.inspectionType || '-'} />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block">
              Ellenőr: {data.inspectorName || '-'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Ütemezve: {fmt(data.scheduledAt)}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Kezdés: {fmt(data.startedAt)}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Befejezés: {fmt(data.completedAt)}
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Stack direction="row" spacing={3} justifyContent="center" alignItems="center" flexWrap="wrap">
              <Box sx={{ textAlign: 'center' }}>
                <ScoreGauge score={data.totalScore} size={140} label="Össz" />
              </Box>
              <Stack spacing={1}>
                <ScoreGauge score={data.technicalScore} size={80} label="Műszaki" />
                <ScoreGauge score={data.hygieneScore} size={80} label="Higiénia" />
                <ScoreGauge score={data.aestheticScore} size={80} label="Esztétika" />
              </Stack>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: '1px solid #e5e7eb' }}>
          <Tab label="Áttekintés" />
          <Tab label={`Pontozás (${scores.length})`} />
          <Tab label={`Fotók (${photos.length})`} />
          <Tab label={`Feladatok (${tasks.length})`} />
          <Tab label={`Kárigények (${damages.length})`} />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Általános megjegyzések"
                  fullWidth multiline rows={5}
                  value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Admin értékelői megjegyzések"
                  fullWidth multiline rows={5}
                  value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="outlined" startIcon={<SaveIcon />}
                  onClick={saveNotes} disabled={savingNotes}
                >
                  {savingNotes ? 'Mentés…' : 'Megjegyzések mentése'}
                </Button>
              </Grid>
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>GPS helyszín</Typography>
                <PropertyMap
                  height={240}
                  properties={
                    data.gpsLatitude && data.gpsLongitude
                      ? [{ id: data.id, name: data.accommodationName, gpsLatitude: data.gpsLatitude, gpsLongitude: data.gpsLongitude, lastScore: data.totalScore }]
                      : []
                  }
                />
              </Grid>
            </Grid>
          )}

          {tab === 1 && (
            <InspectionChecklist scores={scores} categories={categories} />
          )}

          {tab === 2 && (
            <Box>
              <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUploadPhoto} />
                <Button
                  variant="contained" startIcon={<PhotoCameraIcon />}
                  onClick={() => fileInputRef.current?.click()} disabled={uploading}
                >
                  {uploading ? 'Feltöltés…' : 'Fotó feltöltése'}
                </Button>
              </Stack>
              <PhotoGallery photos={photos} />
            </Box>
          )}

          {tab === 3 && (
            tasks.length === 0 ? (
              <Card variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">Nincs generált feladat.</Typography>
              </Card>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Felelős</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Határidő</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.map((t) => (
                    <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedTask(t)}>
                      <TableCell>{t.title || '-'}</TableCell>
                      <TableCell><Chip size="small" label={t.priority || '-'} /></TableCell>
                      <TableCell><Chip size="small" label={t.status || '-'} variant="outlined" /></TableCell>
                      <TableCell>{t.assignee_name || t.assigneeName || '-'}</TableCell>
                      <TableCell>{t.due_date ? new Date(t.due_date).toLocaleDateString('hu-HU') : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}

          {tab === 4 && (
            damages.length === 0 ? (
              <Card variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">Nincs rögzített kárigény.</Typography>
              </Card>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Leírás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Súlyosság</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Becsült költség</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {damages.map((d) => (
                    <TableRow key={d.id} hover>
                      <TableCell>{d.description || '-'}</TableCell>
                      <TableCell>{d.severity || '-'}</TableCell>
                      <TableCell align="right">
                        {d.estimated_cost != null ? `${Number(d.estimated_cost).toLocaleString('hu-HU')} HUF` : '-'}
                      </TableCell>
                      <TableCell>{d.status || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </Box>
      </Paper>

      <TaskAssignmentModal
        open={Boolean(selectedTask)}
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onAssigned={load}
      />
    </Box>
  );
}
