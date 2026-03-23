import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box, Typography, Paper, Grid, Chip, IconButton, Button, TextField,
  InputAdornment, Tooltip, CircularProgress, Tab, Tabs, Badge, Card,
  CardContent, Checkbox, MenuItem, Dialog, DialogTitle, DialogContent,
  DialogActions, Select, FormControl, InputLabel, Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Inbox as InboxIcon,
  PlaylistAddCheck as NextIcon,
  HourglassEmpty as WaitingIcon,
  EventNote as ScheduledIcon,
  StarBorder as SomedayIcon,
  FolderOpen as ProjectIcon,
  Delete as DeleteIcon,
  CheckCircle as DoneIcon,
  Computer as ComputerIcon,
  Business as OfficeIcon,
  Phone as PhoneIcon,
  Home as AccomIcon,
  BusinessCenter as ContractorIcon,
  ShoppingCart as ErrandsIcon,
  BoltOutlined as EnergyIcon,
  Timer as TimerIcon,
  Send as SendIcon,
  Warning as OverdueIcon,
  ArrowForward as ConvertIcon,
  Edit as EditIcon,
  Undo as UndoIcon,
  CheckCircleOutline as CompletedIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { gtdAPI } from '../services/api';

const CONTEXT_ICONS = {
  '@computer': <ComputerIcon fontSize="small" />,
  '@office': <OfficeIcon fontSize="small" />,
  '@call': <PhoneIcon fontSize="small" />,
  '@accommodation': <AccomIcon fontSize="small" />,
  '@contractor': <ContractorIcon fontSize="small" />,
  '@errands': <ErrandsIcon fontSize="small" />,
};

const PRIORITY_COLORS = { critical: 'error', high: 'warning', normal: 'default', low: 'info' };
const ENERGY_LABELS = { low: 'Alacsony', medium: 'Közepes', high: 'Magas' };

const STATUS_TABS = [
  { value: 'next_action', label: 'Következő lépések', icon: <NextIcon /> },
  { value: 'waiting_for', label: 'Várakozás', icon: <WaitingIcon /> },
  { value: 'scheduled', label: 'Ütemezett', icon: <ScheduledIcon /> },
  { value: 'someday_maybe', label: 'Egyszer/Talán', icon: <SomedayIcon /> },
  { value: 'completed', label: 'Elvégzett', icon: <CompletedIcon /> },
];

export default function GTDDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('next_action');
  const [inboxItems, setInboxItems] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [stats, setStats] = useState({ inbox_count: 0, next_actions_count: 0, waiting_count: 0, overdue_count: 0 });
  const [loading, setLoading] = useState(true);

  const [contextFilter, setContextFilter] = useState('');
  const [energyFilter, setEnergyFilter] = useState('');
  const [captureText, setCaptureText] = useState('');

  // New Task Dialog
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', context: '', energy_level: '', time_estimate: '', priority: 'normal', related_project_id: '', due_date: '', status: 'next_action' });

  // Task Detail/Edit Dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);

  // Undo snackbar
  const [undoSnack, setUndoSnack] = useState({ open: false, taskId: null, taskTitle: '' });
  const undoTimer = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [inboxRes, tasksRes, projectsRes, contextsRes, statsRes] = await Promise.all([
        gtdAPI.getInbox().catch(() => ({ success: true, data: { items: [] } })),
        gtdAPI.getTasks({ status: activeTab, context: contextFilter || undefined, energy_level: energyFilter || undefined }).catch(() => ({ success: true, data: [] })),
        gtdAPI.getProjects().catch(() => ({ success: true, data: [] })),
        gtdAPI.getContexts().catch(() => ({ success: true, data: [] })),
        gtdAPI.getStats().catch(() => ({ success: true, data: { inbox_count: 0, next_actions_count: 0, waiting_count: 0, overdue_count: 0 } })),
      ]);
      if (inboxRes.success) setInboxItems(inboxRes.data?.items || []);
      if (tasksRes.success) setTasks(tasksRes.data || []);
      if (projectsRes.success) setProjects(projectsRes.data || []);
      if (contextsRes.success) setContexts(contextsRes.data || []);
      if (statsRes.success) setStats(statsRes.data || {});
    } catch (error) {
      console.error('GTD load error:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, contextFilter, energyFilter]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Handlers ───────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!captureText.trim()) return;
    try {
      await gtdAPI.captureInbox(captureText);
      setCaptureText('');
      toast.success('Rögzítve az Inboxba');
      loadAll();
    } catch { toast.error('Hiba a rögzítéskor'); }
  };

  const handleConvertToTask = async (id) => {
    try {
      await gtdAPI.convertInbox(id, 'task');
      toast.success('Feladattá alakítva');
      loadAll();
    } catch { toast.error('Hiba'); }
  };

  const handleInboxProcess = async (id) => {
    try { await gtdAPI.processInbox(id); loadAll(); } catch { toast.error('Hiba'); }
  };

  const handleInboxDelete = async (id) => {
    try { await gtdAPI.deleteInbox(id); loadAll(); } catch { toast.error('Hiba'); }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim()) return;
    try {
      const payload = { ...newTask };
      if (payload.time_estimate) payload.time_estimate = parseInt(payload.time_estimate);
      if (!payload.related_project_id) delete payload.related_project_id;
      if (!payload.due_date) delete payload.due_date;
      await gtdAPI.createTask(payload);
      setNewTask({ title: '', description: '', context: '', energy_level: '', time_estimate: '', priority: 'normal', related_project_id: '', due_date: '', status: 'next_action' });
      setTaskDialogOpen(false);
      toast.success('Feladat létrehozva');
      loadAll();
    } catch { toast.error('Hiba'); }
  };

  const handleCompleteTask = async (id, title) => {
    try {
      await gtdAPI.updateTask(id, { status: 'completed' });
      // Show undo snackbar
      setUndoSnack({ open: true, taskId: id, taskTitle: title || 'Feladat' });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoSnack(s => ({ ...s, open: false })), 5000);
      loadAll();
    } catch { toast.error('Hiba'); }
  };

  const handleUndoComplete = async () => {
    if (!undoSnack.taskId) return;
    try {
      await gtdAPI.updateTask(undoSnack.taskId, { status: 'next_action' });
      setUndoSnack({ open: false, taskId: null, taskTitle: '' });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      toast.info('Visszavonva');
      loadAll();
    } catch { toast.error('Hiba a visszavonáskor'); }
  };

  const handleUncomplete = async (id) => {
    try {
      await gtdAPI.updateTask(id, { status: 'next_action' });
      toast.info('Visszaállítva a Következő lépésekbe');
      loadAll();
    } catch { toast.error('Hiba'); }
  };

  const handleDeleteTask = async (id) => {
    try { await gtdAPI.deleteTask(id); loadAll(); setDetailOpen(false); } catch { toast.error('Hiba'); }
  };

  // ─── Task Detail/Edit ──────────────────────────────────────────
  const openTaskDetail = (task) => {
    setEditTask({ ...task });
    setDetailOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editTask || !editTask.title?.trim()) return;
    try {
      const payload = {
        title: editTask.title,
        description: editTask.description || '',
        context: editTask.context || '',
        energy_level: editTask.energy_level || '',
        time_estimate: editTask.time_estimate ? parseInt(editTask.time_estimate) : null,
        priority: editTask.priority || 'normal',
        status: editTask.status,
        due_date: editTask.due_date || null,
      };
      await gtdAPI.updateTask(editTask.id, payload);
      setDetailOpen(false);
      toast.success('Feladat frissítve');
      loadAll();
    } catch { toast.error('Hiba a mentéskor'); }
  };

  // ─── Render ─────────────────────────────────────────────────────

  if (loading && tasks.length === 0 && inboxItems.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const isCompleted = activeTab === 'completed';

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>GTD Feladatkezelő</Typography>
          <Typography variant="body2" color="text.secondary">Getting Things Done — Rendszerezett feladatkezelés</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setTaskDialogOpen(true)}>
          Új feladat
        </Button>
      </Box>

      {/* Quick Capture */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 1 }}>
        <InboxIcon color="action" sx={{ mt: 1 }} />
        <TextField
          fullWidth size="small"
          placeholder="Gyors rögzítés az Inboxba... (Enter a küldéshez)"
          value={captureText}
          onChange={(e) => setCaptureText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCapture(); } }}
        />
        <IconButton color="primary" onClick={handleCapture} disabled={!captureText.trim()}>
          <SendIcon />
        </IconButton>
      </Paper>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Inbox', value: stats.inbox_count, icon: <InboxIcon />, color: '#F59E0B', bg: '#FEF3C7' },
          { label: 'Következő lépések', value: stats.next_actions_count, icon: <NextIcon />, color: '#3B82F6', bg: '#DBEAFE' },
          { label: 'Várakozás', value: stats.waiting_count, icon: <WaitingIcon />, color: '#8B5CF6', bg: '#EDE9FE' },
          { label: 'Lejárt határidő', value: stats.overdue_count, icon: <OverdueIcon />, color: '#EF4444', bg: '#FEE2E2' },
        ].map((stat) => (
          <Grid item xs={6} sm={3} key={stat.label}>
            <Card sx={{ bgcolor: stat.bg, border: 'none', boxShadow: 'none' }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ color: stat.color, display: 'flex' }}>{stat.icon}</Box>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: stat.color }}>{stat.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Inbox preview */}
        {inboxItems.length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 2, bgcolor: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <InboxIcon sx={{ color: '#D97706' }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Inbox ({inboxItems.length} feldolgozatlan)
                </Typography>
              </Box>
              {inboxItems.slice(0, 5).map((item) => (
                <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{item.content}</Typography>
                  <Tooltip title="Feladattá alakítás">
                    <IconButton size="small" onClick={() => handleConvertToTask(item.id)}>
                      <ConvertIcon fontSize="small" color="primary" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Feldolgozva">
                    <IconButton size="small" onClick={() => handleInboxProcess(item.id)}>
                      <DoneIcon fontSize="small" color="success" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Törlés">
                    <IconButton size="small" onClick={() => handleInboxDelete(item.id)}>
                      <DeleteIcon fontSize="small" color="error" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Paper>
          </Grid>
        )}

        {/* Main: Tasks */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ mb: 2 }}>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto">
              {STATUS_TABS.map((tab) => (
                <Tab key={tab.value} value={tab.value} label={tab.label} icon={tab.icon} iconPosition="start" />
              ))}
            </Tabs>
          </Paper>

          {/* Filters (not for completed tab) */}
          {!isCompleted && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Kontextus</InputLabel>
                <Select value={contextFilter} label="Kontextus" onChange={(e) => setContextFilter(e.target.value)}>
                  <MenuItem value="">Mind</MenuItem>
                  {contexts.map((c) => (<MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Energia</InputLabel>
                <Select value={energyFilter} label="Energia" onChange={(e) => setEnergyFilter(e.target.value)}>
                  <MenuItem value="">Mind</MenuItem>
                  <MenuItem value="low">Alacsony</MenuItem>
                  <MenuItem value="medium">Közepes</MenuItem>
                  <MenuItem value="high">Magas</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Task List */}
          {tasks.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {isCompleted ? 'Nincs elvégzett feladat' : 'Nincs feladat ebben a kategóriában'}
              </Typography>
            </Paper>
          ) : (
            tasks.map((task) => (
              <Paper
                key={task.id}
                sx={{
                  p: 2, mb: 1, display: 'flex', alignItems: 'center', gap: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover', boxShadow: 1 },
                  transition: 'all 0.15s',
                  ...(isCompleted && { opacity: 0.75 }),
                }}
                onClick={() => openTaskDetail(task)}
              >
                {isCompleted ? (
                  <Tooltip title="Visszaállítás">
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleUncomplete(task.id); }}>
                      <UndoIcon fontSize="small" color="primary" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Checkbox
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => handleCompleteTask(task.id, task.title)}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography
                      variant="body1"
                      sx={{ fontWeight: 600, ...(isCompleted && { textDecoration: 'line-through', color: 'text.secondary' }) }}
                    >
                      {task.title}
                    </Typography>
                    {task.priority && task.priority !== 'normal' && (
                      <Chip label={task.priority} size="small" color={PRIORITY_COLORS[task.priority] || 'default'} variant="outlined" />
                    )}
                    {task.context && (
                      <Chip icon={CONTEXT_ICONS[task.context]} label={task.context} size="small" variant="outlined" />
                    )}
                    {task.project_title && (
                      <Chip icon={<ProjectIcon />} label={task.project_title} size="small" variant="outlined" color="primary" />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                    {task.energy_level && (
                      <Typography variant="caption" color="text.secondary">
                        <EnergyIcon sx={{ fontSize: 12, mr: 0.3, verticalAlign: 'middle' }} />{ENERGY_LABELS[task.energy_level]}
                      </Typography>
                    )}
                    {task.time_estimate && (
                      <Typography variant="caption" color="text.secondary">
                        <TimerIcon sx={{ fontSize: 12, mr: 0.3, verticalAlign: 'middle' }} />{task.time_estimate} perc
                      </Typography>
                    )}
                    {task.due_date && (
                      <Typography variant="caption" color={new Date(task.due_date) < new Date() ? 'error.main' : 'text.secondary'}>
                        Határidő: {new Date(task.due_date).toLocaleDateString('hu-HU')}
                      </Typography>
                    )}
                    {task.waiting_for && (
                      <Typography variant="caption" color="text.secondary">Várakozás: {task.waiting_for}</Typography>
                    )}
                    {isCompleted && task.completed_at && (
                      <Typography variant="caption" color="text.secondary">
                        Elvégezve: {new Date(task.completed_at).toLocaleDateString('hu-HU')}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Tooltip title="Szerkesztés">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openTaskDetail(task); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Törlés">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Paper>
            ))
          )}
        </Grid>

        {/* Right: Projects sidebar */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                <ProjectIcon sx={{ mr: 1, verticalAlign: 'middle' }} />Projektek
              </Typography>
              <Button size="small" onClick={() => navigate('/projects')}>Összes</Button>
            </Box>
            {projects.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Nincs aktív projekt</Typography>
            ) : (
              projects.map((project) => (
                <Box
                  key={project.id}
                  sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{project.name}</Typography>
                  {project.gtd_outcome && (
                    <Typography variant="caption" color="text.secondary">{project.gtd_outcome}</Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                    <Chip label={`${project.active_tickets || 0} aktív`} size="small" variant="outlined" />
                    <Chip label={`${project.total_tickets || 0} összes`} size="small" variant="outlined" />
                  </Box>
                </Box>
              ))
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* ═══ New Task Dialog ═══ */}
      <Dialog open={taskDialogOpen} onClose={() => setTaskDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Új feladat</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField autoFocus fullWidth label="Feladat neve" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
            <TextField fullWidth multiline rows={2} label="Leírás (opcionális)" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Státusz</InputLabel>
                <Select value={newTask.status} label="Státusz" onChange={(e) => setNewTask({ ...newTask, status: e.target.value })}>
                  <MenuItem value="next_action">Következő lépés</MenuItem>
                  <MenuItem value="waiting_for">Várakozás</MenuItem>
                  <MenuItem value="scheduled">Ütemezett</MenuItem>
                  <MenuItem value="someday_maybe">Egyszer/Talán</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Prioritás</InputLabel>
                <Select value={newTask.priority} label="Prioritás" onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
                  <MenuItem value="low">Alacsony</MenuItem>
                  <MenuItem value="normal">Normál</MenuItem>
                  <MenuItem value="high">Magas</MenuItem>
                  <MenuItem value="critical">Kritikus</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Kontextus</InputLabel>
                <Select value={newTask.context} label="Kontextus" onChange={(e) => setNewTask({ ...newTask, context: e.target.value })}>
                  <MenuItem value="">Nincs</MenuItem>
                  {contexts.map((c) => (<MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Energia</InputLabel>
                <Select value={newTask.energy_level} label="Energia" onChange={(e) => setNewTask({ ...newTask, energy_level: e.target.value })}>
                  <MenuItem value="">Nincs</MenuItem>
                  <MenuItem value="low">Alacsony</MenuItem>
                  <MenuItem value="medium">Közepes</MenuItem>
                  <MenuItem value="high">Magas</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField size="small" fullWidth type="number" label="Idő (perc)" value={newTask.time_estimate} onChange={(e) => setNewTask({ ...newTask, time_estimate: e.target.value })} />
              <TextField size="small" fullWidth type="date" label="Határidő" InputLabelProps={{ shrink: true }} value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
            </Box>
            {projects.length > 0 && (
              <FormControl size="small" fullWidth>
                <InputLabel>Projekt</InputLabel>
                <Select value={newTask.related_project_id} label="Projekt" onChange={(e) => setNewTask({ ...newTask, related_project_id: e.target.value })}>
                  <MenuItem value="">Nincs</MenuItem>
                  {projects.map((p) => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialogOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleCreateTask}>Létrehozás</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ Task Detail / Edit Dialog ═══ */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Feladat szerkesztése
          {editTask && (
            <Chip
              label={editTask.status === 'completed' ? 'Elvégzett' : 'Aktív'}
              size="small"
              color={editTask.status === 'completed' ? 'success' : 'primary'}
            />
          )}
        </DialogTitle>
        {editTask && (
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField fullWidth label="Feladat neve" value={editTask.title || ''} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} />
              <TextField fullWidth multiline rows={3} label="Leírás" value={editTask.description || ''} onChange={(e) => setEditTask({ ...editTask, description: e.target.value })} />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Státusz</InputLabel>
                  <Select value={editTask.status || 'next_action'} label="Státusz" onChange={(e) => setEditTask({ ...editTask, status: e.target.value })}>
                    <MenuItem value="next_action">Következő lépés</MenuItem>
                    <MenuItem value="waiting_for">Várakozás</MenuItem>
                    <MenuItem value="scheduled">Ütemezett</MenuItem>
                    <MenuItem value="someday_maybe">Egyszer/Talán</MenuItem>
                    <MenuItem value="completed">Elvégzett</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Prioritás</InputLabel>
                  <Select value={editTask.priority || 'normal'} label="Prioritás" onChange={(e) => setEditTask({ ...editTask, priority: e.target.value })}>
                    <MenuItem value="low">Alacsony</MenuItem>
                    <MenuItem value="normal">Normál</MenuItem>
                    <MenuItem value="high">Magas</MenuItem>
                    <MenuItem value="critical">Kritikus</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Kontextus</InputLabel>
                  <Select value={editTask.context || ''} label="Kontextus" onChange={(e) => setEditTask({ ...editTask, context: e.target.value })}>
                    <MenuItem value="">Nincs</MenuItem>
                    {contexts.map((c) => (<MenuItem key={c.id} value={c.name}>{c.name}</MenuItem>))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Energia</InputLabel>
                  <Select value={editTask.energy_level || ''} label="Energia" onChange={(e) => setEditTask({ ...editTask, energy_level: e.target.value })}>
                    <MenuItem value="">Nincs</MenuItem>
                    <MenuItem value="low">Alacsony</MenuItem>
                    <MenuItem value="medium">Közepes</MenuItem>
                    <MenuItem value="high">Magas</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField size="small" fullWidth type="number" label="Idő (perc)" value={editTask.time_estimate || ''} onChange={(e) => setEditTask({ ...editTask, time_estimate: e.target.value })} />
                <TextField size="small" fullWidth type="date" label="Határidő" InputLabelProps={{ shrink: true }} value={editTask.due_date || ''} onChange={(e) => setEditTask({ ...editTask, due_date: e.target.value })} />
              </Box>
            </Box>
          </DialogContent>
        )}
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Button color="error" startIcon={<DeleteIcon />} onClick={() => editTask && handleDeleteTask(editTask.id)}>
            Törlés
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {editTask && editTask.status !== 'completed' && (
              <Button color="success" startIcon={<DoneIcon />} onClick={() => { handleCompleteTask(editTask.id, editTask.title); setDetailOpen(false); }}>
                Kész
              </Button>
            )}
            {editTask && editTask.status === 'completed' && (
              <Button color="primary" startIcon={<UndoIcon />} onClick={() => { handleUncomplete(editTask.id); setDetailOpen(false); }}>
                Visszaállítás
              </Button>
            )}
            <Button onClick={() => setDetailOpen(false)}>Mégse</Button>
            <Button variant="contained" onClick={handleSaveEdit}>Mentés</Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* ═══ Undo Snackbar ═══ */}
      <Snackbar
        open={undoSnack.open}
        message={`✓ "${undoSnack.taskTitle}" elvégezve`}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        action={
          <Button color="primary" size="small" onClick={handleUndoComplete} startIcon={<UndoIcon />}>
            Visszavonás
          </Button>
        }
        onClose={() => setUndoSnack(s => ({ ...s, open: false }))}
      />
    </Box>
  );
}
