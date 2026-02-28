import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, Chip, IconButton,
  CircularProgress, Divider, Tabs, Tab, LinearProgress,
  Table, TableBody, TableCell, TableHead, TableRow, TablePagination,
  Card, CardContent, TextField, InputAdornment,
  MenuItem, Select, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  ArrowBack as BackIcon, Edit as EditIcon, Delete as DeleteIcon,
  Add as AddIcon, Search as SearchIcon, PersonAdd as PersonAddIcon,
  PersonRemove as PersonRemoveIcon, AccessTime as TimeIcon,
  ViewModule as ViewModuleIcon, ViewList as ViewListIcon,
  Timeline as TimelineIcon, FiberManualRecord as DotIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { projectsAPI, tasksAPI, usersAPI, costCentersAPI, timesheetsAPI } from '../services/api';
import { toast } from 'react-toastify';
import ResponsiveTable from '../components/ResponsiveTable';
import ProjectFormModal from '../components/projects/ProjectFormModal';
import TaskFormModal from '../components/projects/TaskFormModal';
import TaskDetailDialog from '../components/projects/TaskDetailDialog';
import TimesheetDialog from '../components/projects/TimesheetDialog';
import KanbanBoard from '../components/projects/KanbanBoard';

// ============================================
// CONSTANTS
// ============================================

const STATUS_MAP = {
  planning: { label: 'Tervezés', color: 'info' },
  active: { label: 'Aktív', color: 'success' },
  on_hold: { label: 'Szünetel', color: 'warning' },
  completed: { label: 'Befejezett', color: 'default' },
  cancelled: { label: 'Törölve', color: 'error' },
};

const TASK_STATUS_MAP = {
  todo: { label: 'Teendő', color: 'default' },
  in_progress: { label: 'Folyamatban', color: 'primary' },
  review: { label: 'Ellenőrzés', color: 'warning' },
  done: { label: 'Kész', color: 'success' },
  blocked: { label: 'Blokkolva', color: 'error' },
};

const PRIORITY_MAP = {
  low: { label: 'Alacsony', color: 'default' },
  medium: { label: 'Közepes', color: 'info' },
  high: { label: 'Magas', color: 'warning' },
  critical: { label: 'Kritikus', color: 'error' },
};

const TEAM_ROLES = {
  project_manager: 'Projektvezető',
  member: 'Tag',
  developer: 'Fejlesztő',
  designer: 'Tervező',
  tester: 'Tesztelő',
};

const PIE_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#22c55e', '#ef4444'];

const formatCurrency = (val) => {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('hu-HU') : '-';

const formatDateTime = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleString('hu-HU', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ============================================
// STAT CARD
// ============================================

function StatCard({ title, value, subtitle, color }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 150 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" color="text.secondary">{title}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, color: color || 'text.primary' }}>{value}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  // Tasks
  const [tasks, setTasks] = useState([]);
  const [kanbanTasks, setKanbanTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskPage, setTaskPage] = useState(0);
  const [taskRowsPerPage, setTaskRowsPerPage] = useState(20);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskFilterStatus, setTaskFilterStatus] = useState('');
  const [taskFilterPriority, setTaskFilterPriority] = useState('');
  const [tasksView, setTasksView] = useState(() => localStorage.getItem('projectTasksView') || 'kanban');

  // Timeline
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Budget
  const [budget, setBudget] = useState(null);
  const [budgetLoading, setBudgetLoading] = useState(false);

  // Modals
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [taskEditData, setTaskEditData] = useState(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Lookups
  const [users, setUsers] = useState([]);
  const [costCenters, setCostCenters] = useState([]);

  useEffect(() => {
    loadProject();
    loadLookups();
  }, [id]);

  useEffect(() => {
    if (tabValue === 1) {
      if (tasksView === 'kanban') {
        loadKanbanTasks();
      } else {
        loadTasks();
      }
    }
  }, [tabValue, tasksView, taskPage, taskRowsPerPage, taskSearch, taskFilterStatus, taskFilterPriority]);

  useEffect(() => {
    if (tabValue === 2) loadTimeline();
  }, [tabValue]);

  useEffect(() => {
    if (tabValue === 3) loadBudget();
  }, [tabValue]);

  const loadLookups = async () => {
    try {
      const [usersRes, ccRes] = await Promise.all([
        usersAPI.getAll({ limit: 200 }),
        costCentersAPI.getAll({ limit: 200 }),
      ]);
      if (usersRes.success) setUsers(usersRes.data.users || []);
      if (ccRes.success) setCostCenters(ccRes.data.costCenters || ccRes.data.cost_centers || []);
    } catch (error) {
      console.error('Keresési adatok betöltési hiba:', error);
    }
  };

  const loadProject = async () => {
    setLoading(true);
    try {
      const response = await projectsAPI.getById(id);
      if (response.success) {
        setProject(response.data.project);
      }
    } catch (error) {
      toast.error('Hiba a projekt betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    setTasksLoading(true);
    try {
      const params = {
        page: taskPage + 1,
        limit: taskRowsPerPage,
        ...(taskSearch && { search: taskSearch }),
        ...(taskFilterStatus && { status: taskFilterStatus }),
        ...(taskFilterPriority && { priority: taskFilterPriority }),
      };
      const response = await tasksAPI.getAll(id, params);
      if (response.success) {
        setTasks(response.data.tasks || []);
        setTaskTotal(response.data.pagination?.total || 0);
      }
    } catch (error) {
      toast.error('Hiba a feladatok betöltésekor');
    } finally {
      setTasksLoading(false);
    }
  };

  const loadKanbanTasks = async () => {
    setTasksLoading(true);
    try {
      const response = await tasksAPI.getAll(id, { limit: 500 });
      if (response.success) {
        setKanbanTasks(response.data.tasks || []);
      }
    } catch (error) {
      toast.error('Hiba a feladatok betöltésekor');
    } finally {
      setTasksLoading(false);
    }
  };

  const loadTimeline = async () => {
    setTimelineLoading(true);
    try {
      const response = await projectsAPI.getTimeline(id);
      if (response.success) {
        setTimeline(response.data.timeline || response.data.events || response.data || []);
      }
    } catch (error) {
      console.error('Timeline betöltési hiba:', error);
    } finally {
      setTimelineLoading(false);
    }
  };

  const loadBudget = async () => {
    setBudgetLoading(true);
    try {
      const response = await projectsAPI.getBudgetSummary(id);
      if (response.success) {
        setBudget(response.data);
      }
    } catch (error) {
      toast.error('Hiba a költségvetés betöltésekor');
    } finally {
      setBudgetLoading(false);
    }
  };

  const handleUpdateProject = async (data) => {
    const response = await projectsAPI.update(id, data);
    if (response.success) {
      toast.success('Projekt frissítve');
      loadProject();
    }
  };

  const handleDeleteProject = async () => {
    try {
      const response = await projectsAPI.delete(id);
      if (response.success) {
        toast.success('Projekt törölve');
        navigate('/projects');
      }
    } catch (error) {
      toast.error('Hiba a projekt törlésekor');
    }
    setDeleteConfirmOpen(false);
  };

  const handleCreateTask = async (data) => {
    const response = await tasksAPI.create(id, data);
    if (response.success) {
      toast.success('Feladat létrehozva');
      if (tasksView === 'kanban') loadKanbanTasks();
      else loadTasks();
      loadProject();
    }
  };

  const handleEditTask = async (data) => {
    const response = await tasksAPI.update(taskEditData.id, data);
    if (response.success) {
      toast.success('Feladat frissítve');
      if (tasksView === 'kanban') loadKanbanTasks();
      else loadTasks();
      loadProject();
      setTaskEditData(null);
    }
  };

  const handleQuickAddTask = async (data) => {
    try {
      const response = await tasksAPI.create(id, data);
      if (response.success) {
        toast.success('Feladat létrehozva');
        loadKanbanTasks();
        loadProject();
      }
    } catch (error) {
      toast.error('Hiba a feladat létrehozásakor');
    }
  };

  const handleAddTeamMember = async () => {
    if (!newMemberUserId) {
      toast.error('Válasszon felhasználót');
      return;
    }
    try {
      const response = await projectsAPI.assignTeamMember(id, {
        user_id: newMemberUserId,
        role: newMemberRole,
      });
      if (response.success) {
        toast.success('Csapattag hozzáadva');
        loadProject();
        setAddMemberOpen(false);
        setNewMemberUserId('');
        setNewMemberRole('member');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a csapattag hozzáadásakor');
    }
  };

  const handleRemoveTeamMember = async (userId) => {
    try {
      const response = await projectsAPI.removeTeamMember(id, userId);
      if (response.success) {
        toast.success('Csapattag eltávolítva');
        loadProject();
      }
    } catch (error) {
      toast.error('Hiba a csapattag eltávolításakor');
    }
  };

  const handleTaskStatusChange = async (taskId, newStatus) => {
    // Optimistic update for kanban
    if (tasksView === 'kanban') {
      setKanbanTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    }
    try {
      const response = await tasksAPI.updateStatus(taskId, { status: newStatus });
      if (response.success) {
        toast.success('Státusz frissítve');
        if (tasksView === 'kanban') loadKanbanTasks();
        else loadTasks();
        loadProject();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a státusz frissítésekor');
      if (tasksView === 'kanban') loadKanbanTasks();
    }
  };

  const handleTasksViewChange = (e, newView) => {
    if (newView) {
      setTasksView(newView);
      localStorage.setItem('projectTasksView', newView);
    }
  };

  const handleTaskCardClick = (task) => {
    setSelectedTaskId(task.id);
    setTaskDetailOpen(true);
  };

  // ============================================
  // Task status donut chart data
  // ============================================
  const getTaskStatusChartData = () => {
    if (!project?.task_summary) return [];
    const ts = project.task_summary;
    return [
      { name: 'Teendő', value: parseInt(ts.todo) || 0 },
      { name: 'Folyamatban', value: parseInt(ts.in_progress) || 0 },
      { name: 'Ellenőrzés', value: parseInt(ts.review) || 0 },
      { name: 'Kész', value: parseInt(ts.done) || 0 },
      { name: 'Blokkolva', value: parseInt(ts.blocked) || 0 },
    ].filter(d => d.value > 0);
  };

  // Days remaining
  const getDaysRemaining = () => {
    if (!project?.end_date) return null;
    const end = new Date(project.end_date);
    const now = new Date();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // ============================================
  // LOADING / NOT FOUND
  // ============================================

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!project) {
    return (
      <Box sx={{ textAlign: 'center', py: 5 }}>
        <Typography variant="h6" color="text.secondary">Projekt nem található</Typography>
        <Button onClick={() => navigate('/projects')} sx={{ mt: 2 }}>Vissza a projektekhez</Button>
      </Box>
    );
  }

  const completion = project.completion_percentage || 0;
  const taskStatusData = getTaskStatusChartData();
  const daysRemaining = getDaysRemaining();

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate('/projects')}>
          <BackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="h4" sx={{ fontWeight: 700 }}>{project.name}</Typography>
            {project.code && (
              <Chip label={project.code} size="small" variant="outlined" />
            )}
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Chip
              label={STATUS_MAP[project.status]?.label || project.status}
              color={STATUS_MAP[project.status]?.color || 'default'}
              size="small"
            />
            <Chip
              label={PRIORITY_MAP[project.priority]?.label || project.priority}
              color={PRIORITY_MAP[project.priority]?.color || 'default'}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => setEditProjectOpen(true)}
          >
            Szerkesztés
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            Törlés
          </Button>
        </Stack>
      </Stack>

      {/* Progress ring + days remaining cards */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <Card variant="outlined" sx={{ minWidth: 150 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 }, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <CircularProgress
                variant="determinate"
                value={completion}
                size={56}
                thickness={5}
                sx={{ color: completion >= 100 ? '#22c55e' : '#3b82f6' }}
              />
              <Box sx={{
                position: 'absolute', top: 0, left: 0, bottom: 0, right: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {completion}%
                </Typography>
              </Box>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Haladás</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {project.task_summary?.done || 0}/{project.task_summary?.total || 0} feladat
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {daysRemaining !== null && (
          <Card variant="outlined" sx={{ minWidth: 150 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="caption" color="text.secondary">Hátralévő napok</Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: daysRemaining < 0 ? '#ef4444' : daysRemaining < 7 ? '#f59e0b' : '#22c55e',
                }}
              >
                {daysRemaining < 0 ? `${Math.abs(daysRemaining)} nap késés` : `${daysRemaining} nap`}
              </Typography>
            </CardContent>
          </Card>
        )}

        <StatCard title="Költségvetés" value={formatCurrency(project.budget)} />
        <StatCard
          title="Tényleges költség"
          value={formatCurrency(project.actual_cost)}
          color={project.actual_cost > project.budget ? '#ef4444' : undefined}
        />
      </Stack>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tabValue}
          onChange={(e, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Áttekintés" />
          <Tab label="Feladatok" />
          <Tab label="Idővonal" />
          <Tab label="Költségvetés" />
          <Tab label="Csapat" />
          <Tab label="Tevékenység" />
        </Tabs>
      </Paper>

      {/* ============================================ */}
      {/* TAB 0: Overview */}
      {/* ============================================ */}
      {tabValue === 0 && (
        <Box>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            {/* Left: project details */}
            <Paper sx={{ p: 3, flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Projekt adatok</Typography>

              {project.description && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">Leírás</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {project.description}
                  </Typography>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Projektvezető</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {project.pm_last_name ? `${project.pm_last_name} ${project.pm_first_name}` : '-'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Költségközpont</Typography>
                  <Typography variant="body2">{project.cost_center_name || '-'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Kezdés</Typography>
                  <Typography variant="body2">{formatDate(project.start_date)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Befejezés</Typography>
                  <Typography variant="body2">{formatDate(project.end_date)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Létrehozó</Typography>
                  <Typography variant="body2">
                    {project.creator_last_name ? `${project.creator_last_name} ${project.creator_first_name}` : '-'}
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Haladás</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={completion}
                  sx={{ flex: 1, height: 10, borderRadius: 5 }}
                />
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{completion}%</Typography>
              </Box>

              {project.task_summary && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Becsült: {project.task_summary.total_estimated_hours || 0} óra |
                    Tényleges: {project.task_summary.total_actual_hours || 0} óra
                  </Typography>
                </Box>
              )}
            </Paper>

            {/* Right: task status chart */}
            <Paper sx={{ p: 3, flex: 1, minHeight: 300 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Feladat állapotok</Typography>
              {taskStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={taskStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {taskStatusData.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <RTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 5 }}>
                  Nincsenek feladatok
                </Typography>
              )}
            </Paper>
          </Stack>
        </Box>
      )}

      {/* ============================================ */}
      {/* TAB 1: Tasks */}
      {/* ============================================ */}
      {tabValue === 1 && (
        <Box>
          {/* Task header with view toggle */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
              <ToggleButtonGroup
                value={tasksView}
                exclusive
                onChange={handleTasksViewChange}
                size="small"
              >
                <ToggleButton value="kanban">
                  <ViewModuleIcon fontSize="small" sx={{ mr: 0.5 }} /> Kanban
                </ToggleButton>
                <ToggleButton value="table">
                  <ViewListIcon fontSize="small" sx={{ mr: 0.5 }} /> Táblázat
                </ToggleButton>
              </ToggleButtonGroup>

              {tasksView === 'table' && (
                <>
                  <TextField
                    placeholder="Keresés..."
                    value={taskSearch}
                    onChange={(e) => { setTaskSearch(e.target.value); setTaskPage(0); }}
                    size="small"
                    sx={{ minWidth: 200 }}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                    }}
                  />
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Státusz</InputLabel>
                    <Select
                      value={taskFilterStatus}
                      label="Státusz"
                      onChange={(e) => { setTaskFilterStatus(e.target.value); setTaskPage(0); }}
                    >
                      <MenuItem value="">Összes</MenuItem>
                      {Object.entries(TASK_STATUS_MAP).map(([val, { label }]) => (
                        <MenuItem key={val} value={val}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Prioritás</InputLabel>
                    <Select
                      value={taskFilterPriority}
                      label="Prioritás"
                      onChange={(e) => { setTaskFilterPriority(e.target.value); setTaskPage(0); }}
                    >
                      <MenuItem value="">Összes</MenuItem>
                      {Object.entries(PRIORITY_MAP).map(([val, { label }]) => (
                        <MenuItem key={val} value={val}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </>
              )}

              <Box sx={{ flex: 1 }} />
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => { setTaskEditData(null); setTaskFormOpen(true); }}
              >
                Új feladat
              </Button>
            </Stack>
          </Paper>

          {/* Kanban view */}
          {tasksView === 'kanban' && (
            tasksLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                <CircularProgress />
              </Box>
            ) : (
              <KanbanBoard
                tasks={kanbanTasks}
                onStatusChange={handleTaskStatusChange}
                onTaskClick={handleTaskCardClick}
                onQuickAdd={handleQuickAddTask}
                users={users}
              />
            )
          )}

          {/* Table view */}
          {tasksView === 'table' && (
            <Paper>
              {tasksLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                  <CircularProgress />
                </Box>
              ) : tasks.length === 0 ? (
                <Box sx={{ p: 5, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">Nincsenek feladatok</Typography>
                </Box>
              ) : (
                <>
                  <ResponsiveTable>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Cím</TableCell>
                          <TableCell>Státusz</TableCell>
                          <TableCell>Prioritás</TableCell>
                          <TableCell>Felelős</TableCell>
                          <TableCell>Határidő</TableCell>
                          <TableCell align="right">Órák</TableCell>
                          <TableCell align="right">Alfeladatok</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tasks.map((t) => (
                          <TableRow
                            key={t.id}
                            hover
                            onClick={() => { setSelectedTaskId(t.id); setTaskDetailOpen(true); }}
                            sx={{ cursor: 'pointer' }}
                          >
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {t.parent_task_id ? '↳ ' : ''}{t.title}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={t.status}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleTaskStatusChange(t.id, e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                size="small"
                                sx={{ minWidth: 130, fontSize: '0.8rem' }}
                              >
                                {Object.entries(TASK_STATUS_MAP).map(([val, { label }]) => (
                                  <MenuItem key={val} value={val}>{label}</MenuItem>
                                ))}
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={PRIORITY_MAP[t.priority]?.label || t.priority}
                                color={PRIORITY_MAP[t.priority]?.color || 'default'}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              {t.assigned_first_name
                                ? `${t.assigned_last_name} ${t.assigned_first_name}`
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                color={t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' ? 'error' : 'text.primary'}
                              >
                                {formatDate(t.due_date)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              {t.actual_hours || 0} / {t.estimated_hours || '-'}
                            </TableCell>
                            <TableCell align="right">{t.subtask_count || 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ResponsiveTable>

                  <TablePagination
                    component="div"
                    count={taskTotal}
                    page={taskPage}
                    onPageChange={(e, newPage) => setTaskPage(newPage)}
                    rowsPerPage={taskRowsPerPage}
                    onRowsPerPageChange={(e) => { setTaskRowsPerPage(parseInt(e.target.value)); setTaskPage(0); }}
                    rowsPerPageOptions={[10, 20, 50]}
                    labelRowsPerPage="Sorok:"
                    labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
                  />
                </>
              )}
            </Paper>
          )}
        </Box>
      )}

      {/* ============================================ */}
      {/* TAB 2: Timeline */}
      {/* ============================================ */}
      {tabValue === 2 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Idővonal</Typography>
          {timelineLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
              <CircularProgress />
            </Box>
          ) : Array.isArray(timeline) && timeline.length > 0 ? (
            <Paper sx={{ p: 2 }}>
              {timeline.map((event, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    py: 1.5,
                    borderBottom: index < timeline.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 20 }}>
                    <DotIcon sx={{ fontSize: 12, color: '#3b82f6' }} />
                    {index < timeline.length - 1 && (
                      <Box sx={{ width: 2, flex: 1, bgcolor: 'divider' }} />
                    )}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {event.title || event.description || event.action || 'Esemény'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(event.date || event.created_at || event.timestamp)}
                    </Typography>
                    {event.user_name && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        — {event.user_name}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Paper>
          ) : (
            <Paper sx={{ p: 5, textAlign: 'center' }}>
              <TimelineIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body1" color="text.secondary">
                Még nincsenek idővonal események
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Az idővonal automatikusan frissül a projekt tevékenységeivel.
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* ============================================ */}
      {/* TAB 3: Budget */}
      {/* ============================================ */}
      {tabValue === 3 && (
        <Box>
          {budgetLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
              <CircularProgress />
            </Box>
          ) : budget ? (
            <>
              {/* Budget summary cards */}
              <Stack direction="row" spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
                <StatCard title="Költségvetés" value={formatCurrency(budget.project?.budget)} color="#6366f1" />
                <StatCard title="Tényleges költség" value={formatCurrency(budget.project?.actual_cost)} color="#f59e0b" />
                <StatCard
                  title="Összesen logolt óra"
                  value={`${parseFloat(budget.hours?.total_logged_hours || 0).toFixed(1)} óra`}
                  subtitle={`${budget.hours?.contributors || 0} fő, ${budget.hours?.work_days || 0} munkanap`}
                />
                <StatCard
                  title="Becsült vs. Tényleges"
                  value={`${parseFloat(budget.estimates?.total_estimated || 0).toFixed(0)} / ${parseFloat(budget.estimates?.total_actual || 0).toFixed(0)} óra`}
                  color={parseFloat(budget.estimates?.total_actual || 0) > parseFloat(budget.estimates?.total_estimated || 0) ? '#ef4444' : '#22c55e'}
                />
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                {/* Hours by user table */}
                <Paper sx={{ p: 3, flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Órák felhasználónként</Typography>
                  {budget.hours_by_user?.length > 0 ? (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Felhasználó</TableCell>
                          <TableCell align="right">Órák</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {budget.hours_by_user.map((u) => (
                          <TableRow key={u.id} hover>
                            <TableCell>{u.last_name} {u.first_name}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>
                              {parseFloat(u.total_hours).toFixed(1)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Nincsenek adatok</Typography>
                  )}
                </Paper>

                {/* Hours by month chart */}
                <Paper sx={{ p: 3, flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Órák havonta</Typography>
                  {budget.hours_by_month?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={budget.hours_by_month}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <RTooltip formatter={(val) => [`${val} óra`, 'Órák']} />
                        <Bar dataKey="total_hours" fill="#6366f1" radius={[4, 4, 0, 0]} name="Órák" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Nincsenek adatok</Typography>
                  )}
                </Paper>
              </Stack>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 5 }}>
              Költségvetési adatok nem elérhetők
            </Typography>
          )}
        </Box>
      )}

      {/* ============================================ */}
      {/* TAB 4: Team */}
      {/* ============================================ */}
      {tabValue === 4 && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Csapattagok ({project.team_members?.length || 0})
            </Typography>
            <Button
              variant="contained"
              startIcon={<PersonAddIcon />}
              onClick={() => setAddMemberOpen(true)}
            >
              Tag hozzáadása
            </Button>
          </Stack>

          <Paper>
            {!project.team_members || project.team_members.length === 0 ? (
              <Box sx={{ p: 5, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">Nincsenek csapattagok</Typography>
              </Box>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Név</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Szerepkör</TableCell>
                    <TableCell>Hozzáadva</TableCell>
                    <TableCell align="right">Művelet</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {project.team_members.map((m) => (
                    <TableRow key={m.user_id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {m.last_name} {m.first_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell>
                        <Chip
                          label={TEAM_ROLES[m.role] || m.role}
                          size="small"
                          color={m.role === 'project_manager' ? 'primary' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{formatDate(m.assigned_at)}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveTeamMember(m.user_id)}
                        >
                          <PersonRemoveIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Box>
      )}

      {/* ============================================ */}
      {/* TAB 5: Activity */}
      {/* ============================================ */}
      {tabValue === 5 && (
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Tevékenység</Typography>
          <Paper sx={{ p: 5, textAlign: 'center' }}>
            <TimeIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" color="text.secondary">
              Tevékenységnapló
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              A feladatok létrehozása, státuszváltozások és megjegyzések itt jelennek meg.
            </Typography>

            {/* Show recent task status changes from kanban tasks if available */}
            {kanbanTasks.length > 0 && (
              <Box sx={{ mt: 3, textAlign: 'left' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Legutóbbi feladatok
                </Typography>
                {kanbanTasks
                  .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
                  .slice(0, 10)
                  .map((t) => (
                    <Box
                      key={t.id}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1,
                        py: 1, borderBottom: '1px solid', borderColor: 'divider',
                      }}
                    >
                      <DotIcon sx={{
                        fontSize: 10,
                        color: t.status === 'done' ? '#22c55e' :
                               t.status === 'in_progress' ? '#3b82f6' :
                               t.status === 'blocked' ? '#ef4444' : '#94a3b8',
                      }} />
                      <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                        {t.title}
                      </Typography>
                      <Chip
                        label={TASK_STATUS_MAP[t.status]?.label || t.status}
                        size="small"
                        color={TASK_STATUS_MAP[t.status]?.color || 'default'}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(t.updated_at || t.created_at)}
                      </Typography>
                    </Box>
                  ))}
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {/* ============================================ */}
      {/* MODALS */}
      {/* ============================================ */}

      {/* Edit project */}
      <ProjectFormModal
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        onSave={handleUpdateProject}
        editData={project}
        users={users}
        costCenters={costCenters}
      />

      {/* Task form */}
      <TaskFormModal
        open={taskFormOpen}
        onClose={() => { setTaskFormOpen(false); setTaskEditData(null); }}
        onSave={taskEditData ? handleEditTask : handleCreateTask}
        editData={taskEditData}
        users={users}
        tasks={tasksView === 'kanban' ? kanbanTasks : tasks}
        projectId={id}
      />

      {/* Task detail */}
      <TaskDetailDialog
        open={taskDetailOpen}
        onClose={() => { setTaskDetailOpen(false); setSelectedTaskId(null); }}
        taskId={selectedTaskId}
        projectId={id}
        users={users}
        onUpdate={() => {
          if (tasksView === 'kanban') loadKanbanTasks();
          else loadTasks();
          loadProject();
        }}
      />

      {/* Add team member dialog */}
      <Dialog open={addMemberOpen} onClose={() => setAddMemberOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Csapattag hozzáadása</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Felhasználó</InputLabel>
              <Select
                value={newMemberUserId}
                label="Felhasználó"
                onChange={(e) => setNewMemberUserId(e.target.value)}
              >
                {users
                  .filter(u => !project.team_members?.some(m => m.user_id === u.id))
                  .map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.last_name} {u.first_name} ({u.email})
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Szerepkör</InputLabel>
              <Select
                value={newMemberRole}
                label="Szerepkör"
                onChange={(e) => setNewMemberRole(e.target.value)}
              >
                {Object.entries(TEAM_ROLES).map(([val, label]) => (
                  <MenuItem key={val} value={val}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddMemberOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleAddTeamMember}>Hozzáadás</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Projekt törlése</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan törölni szeretné a(z) <strong>{project.name}</strong> projektet?
            A projekt archiválásra kerül.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Mégse</Button>
          <Button variant="contained" color="error" onClick={handleDeleteProject}>Törlés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
