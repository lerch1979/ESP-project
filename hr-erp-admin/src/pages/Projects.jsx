import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, Card, CardContent, CardActions,
  Table, TableBody, TableCell, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  LinearProgress, Grid, AvatarGroup, IconButton,
  ToggleButtonGroup, ToggleButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon,
  Assignment as ProjectIcon, PlayArrow as ActiveIcon,
  Warning as OverdueIcon, AccountBalance as BudgetIcon,
  ViewModule as ViewModuleIcon, ViewList as ViewListIcon,
  Visibility as ViewIcon, Edit as EditIcon, Delete as DeleteIcon,
  CalendarToday as CalendarIcon,
  FilterListOff as FilterListOffIcon,
} from '@mui/icons-material';
import { projectsAPI, usersAPI, costCentersAPI } from '../services/api';
import { toast } from 'react-toastify';
import ResponsiveTable from '../components/ResponsiveTable';
import ProjectFormModal from '../components/projects/ProjectFormModal';
import UserAvatar from '../components/common/UserAvatar';

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

const PRIORITY_MAP = {
  low: { label: 'Alacsony', color: 'default' },
  medium: { label: 'Közepes', color: 'info' },
  high: { label: 'Magas', color: 'warning' },
  critical: { label: 'Kritikus', color: 'error' },
};

const SORT_OPTIONS = [
  { value: 'name', label: 'Név' },
  { value: 'start_date', label: 'Kezdés dátuma' },
  { value: 'completion', label: 'Haladás' },
  { value: 'budget', label: 'Költségvetés' },
];

const formatCurrency = (val) => {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);
};

const formatDate = (d) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('hu-HU');
};

// ============================================
// STAT CARD
// ============================================

function StatCard({ title, value, subtitle, color, icon }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 180 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">{title}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: color || 'text.primary' }}>{value}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          {icon && <Box sx={{ color: color || '#94a3b8', mt: 0.5 }}>{icon}</Box>}
        </Box>
      </CardContent>
    </Card>
  );
}

// ============================================
// PROJECT CARD (for grid view)
// ============================================

function ProjectCard({ project, onView, onEdit, onDelete }) {
  const completion = project.completion_percentage != null
    ? project.completion_percentage
    : (project.task_count > 0 && project.completed_task_count != null)
      ? Math.round((project.completed_task_count / project.task_count) * 100)
      : 0;

  const budgetOver = project.actual_cost > project.budget;
  const doneCount = project.completed_task_count || project.task_summary?.done || 0;
  const totalCount = project.task_count || project.task_summary?.total || 0;

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s',
        '&:hover': { boxShadow: 3, cursor: 'pointer' },
      }}
      onClick={() => onView(project)}
    >
      <CardContent sx={{ flex: 1, p: 2 }}>
        {/* Name + code */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, lineHeight: 1.3 }} noWrap>
            {project.name}
          </Typography>
          {project.code && (
            <Chip label={project.code} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
          )}
        </Stack>

        {/* Status chip */}
        <Stack direction="row" spacing={0.5} sx={{ mb: 1.5 }}>
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

        {/* Progress */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Haladás</Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>{completion}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={completion}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        {/* Budget */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">Költségvetés</Typography>
          <Stack direction="row" spacing={1} alignItems="baseline">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatCurrency(project.budget)}
            </Typography>
            {project.actual_cost > 0 && (
              <Typography
                variant="caption"
                sx={{ color: budgetOver ? '#ef4444' : '#22c55e', fontWeight: 500 }}
              >
                / {formatCurrency(project.actual_cost)}
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Date range */}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
          <CalendarIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {formatDate(project.start_date)} — {formatDate(project.end_date)}
          </Typography>
        </Stack>

        {/* Task summary */}
        <Typography variant="caption" color="text.secondary">
          {doneCount}/{totalCount} feladat kész
        </Typography>

        {/* Team avatars */}
        {project.team_members?.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <AvatarGroup max={5} sx={{ justifyContent: 'flex-start' }}>
              {project.team_members.map((m) => (
                <UserAvatar
                  key={m.user_id}
                  firstName={m.first_name}
                  lastName={m.last_name}
                  size="xs"
                  tooltip
                />
              ))}
            </AvatarGroup>
          </Box>
        )}

        {/* PM name if no team_members */}
        {!project.team_members?.length && project.pm_last_name && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              PM: {project.pm_last_name} {project.pm_first_name}
            </Typography>
          </Box>
        )}
      </CardContent>

      <CardActions sx={{ px: 2, pb: 1.5, pt: 0 }}>
        <Button
          size="small"
          startIcon={<ViewIcon />}
          onClick={(e) => { e.stopPropagation(); onView(project); }}
        >
          Megtekintés
        </Button>
        <Button
          size="small"
          startIcon={<EditIcon />}
          onClick={(e) => { e.stopPropagation(); onEdit(project); }}
        >
          Szerkesztés
        </Button>
        <Box sx={{ flex: 1 }} />
        <IconButton
          size="small"
          color="error"
          onClick={(e) => { e.stopPropagation(); onDelete(project); }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </CardActions>
    </Card>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // View & sort
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('projectsViewMode') || 'grid');
  const [sortBy, setSortBy] = useState('name');

  // Dashboard stats
  const [dashboard, setDashboard] = useState(null);

  // Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Lookups
  const [users, setUsers] = useState([]);
  const [costCenters, setCostCenters] = useState([]);

  useEffect(() => {
    loadLookups();
    loadDashboard();
  }, []);

  useEffect(() => {
    loadProjects();
  }, [page, rowsPerPage, search, filterStatus, filterPriority]);

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

  const loadDashboard = async () => {
    try {
      const response = await projectsAPI.getDashboard();
      if (response.success) {
        setDashboard(response.data);
      }
    } catch (error) {
      console.error('Dashboard betöltési hiba:', error);
    }
  };

  const loadProjects = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        ...(search && { search }),
        ...(filterStatus && { status: filterStatus }),
        ...(filterPriority && { priority: filterPriority }),
      };
      const response = await projectsAPI.getAll(params);
      if (response.success) {
        setProjects(response.data.projects || []);
        setTotal(response.data.pagination?.total || 0);
      }
    } catch (error) {
      toast.error('Hiba a projektek betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (data) => {
    const response = await projectsAPI.create(data);
    if (response.success) {
      toast.success('Projekt létrehozva');
      loadProjects();
      loadDashboard();
    }
  };

  const handleEditProject = async (data) => {
    const response = await projectsAPI.update(editData.id, data);
    if (response.success) {
      toast.success('Projekt frissítve');
      loadProjects();
      loadDashboard();
      setEditData(null);
    }
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    try {
      const response = await projectsAPI.delete(deleteTarget.id);
      if (response.success) {
        toast.success('Projekt törölve');
        loadProjects();
        loadDashboard();
      }
    } catch (error) {
      toast.error('Hiba a projekt törlésekor');
    }
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  };

  const handleOpenCreate = () => {
    setEditData(null);
    setFormModalOpen(true);
  };

  const handleViewModeChange = (e, newMode) => {
    if (newMode) {
      setViewMode(newMode);
      localStorage.setItem('projectsViewMode', newMode);
    }
  };

  const getCompletionPercent = (p) => {
    if (p.completion_percentage != null) return p.completion_percentage;
    if (p.task_count > 0 && p.completed_task_count != null) {
      return Math.round((p.completed_task_count / p.task_count) * 100);
    }
    return 0;
  };

  // Sort projects for grid view
  const sortedProjects = useMemo(() => {
    const sorted = [...projects];
    switch (sortBy) {
      case 'name':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'hu'));
        break;
      case 'start_date':
        sorted.sort((a, b) => new Date(a.start_date || 0) - new Date(b.start_date || 0));
        break;
      case 'completion':
        sorted.sort((a, b) => getCompletionPercent(b) - getCompletionPercent(a));
        break;
      case 'budget':
        sorted.sort((a, b) => (b.budget || 0) - (a.budget || 0));
        break;
      default:
        break;
    }
    return sorted;
  }, [projects, sortBy]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Projektek</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          Új projekt
        </Button>
      </Box>

      {/* Stats */}
      {dashboard && (
        <Stack direction="row" spacing={2} sx={{ mb: 3, overflowX: 'auto' }} flexWrap="wrap" useFlexGap>
          <StatCard
            title="Összes projekt"
            value={dashboard.projects?.total || 0}
            color="#6366f1"
            icon={<ProjectIcon />}
          />
          <StatCard
            title="Aktív projektek"
            value={dashboard.projects?.active || 0}
            color="#22c55e"
            icon={<ActiveIcon />}
          />
          <StatCard
            title="Késedelmes feladatok"
            value={dashboard.overdue_tasks?.length || 0}
            color="#ef4444"
            icon={<OverdueIcon />}
          />
          <StatCard
            title="Teljes költségvetés"
            value={formatCurrency(dashboard.projects?.total_budget)}
            subtitle={`Tényleges: ${formatCurrency(dashboard.projects?.total_actual_cost)}`}
            color="#f59e0b"
            icon={<BudgetIcon />}
          />
        </Stack>
      )}

      {/* Filters + View Toggle */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
          >
            <ToggleButton value="grid">
              <ViewModuleIcon fontSize="small" sx={{ mr: 0.5 }} /> Kártyák
            </ToggleButton>
            <ToggleButton value="table">
              <ViewListIcon fontSize="small" sx={{ mr: 0.5 }} /> Táblázat
            </ToggleButton>
          </ToggleButtonGroup>

          <TextField
            placeholder="Keresés név, kód szerint..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            size="small"
            sx={{ minWidth: 250 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Státusz</InputLabel>
            <Select
              value={filterStatus}
              label="Státusz"
              onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
            >
              <MenuItem value="">Összes</MenuItem>
              {Object.entries(STATUS_MAP).map(([val, { label }]) => (
                <MenuItem key={val} value={val}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Prioritás</InputLabel>
            <Select
              value={filterPriority}
              label="Prioritás"
              onChange={(e) => { setFilterPriority(e.target.value); setPage(0); }}
            >
              <MenuItem value="">Összes</MenuItem>
              {Object.entries(PRIORITY_MAP).map(([val, { label }]) => (
                <MenuItem key={val} value={val}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {viewMode === 'grid' && (
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Rendezés</InputLabel>
              <Select
                value={sortBy}
                label="Rendezés"
                onChange={(e) => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {(search || filterStatus || filterPriority) && (
            <Button
              size="small"
              startIcon={<FilterListOffIcon />}
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterPriority(''); setPage(0); }}
            >
              Szűrők törlése
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Loading */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      ) : projects.length === 0 ? (
        <Paper sx={{ p: 5, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">Nincsenek projektek</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Hozzon létre egy új projektet a fenti gombbal.
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Grid View */}
          {viewMode === 'grid' && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {sortedProjects.map((p) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={p.id}>
                  <ProjectCard
                    project={p}
                    onView={(proj) => navigate(`/projects/${proj.id}`)}
                    onEdit={(proj) => { setEditData(proj); setFormModalOpen(true); }}
                    onDelete={(proj) => { setDeleteTarget(proj); setDeleteConfirmOpen(true); }}
                  />
                </Grid>
              ))}
            </Grid>
          )}

          {/* Table View */}
          {viewMode === 'table' && (
            <Paper>
              <ResponsiveTable>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Név</TableCell>
                      <TableCell>Kód</TableCell>
                      <TableCell>Státusz</TableCell>
                      <TableCell>Prioritás</TableCell>
                      <TableCell>Haladás</TableCell>
                      <TableCell>Projektvezető</TableCell>
                      <TableCell>Határidő</TableCell>
                      <TableCell align="right">Feladatok</TableCell>
                      <TableCell align="right">Költségvetés</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {projects.map((p) => {
                      const completion = getCompletionPercent(p);
                      return (
                        <TableRow
                          key={p.id}
                          hover
                          onClick={() => navigate(`/projects/${p.id}`)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {p.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">{p.code || '-'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={STATUS_MAP[p.status]?.label || p.status}
                              color={STATUS_MAP[p.status]?.color || 'default'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={PRIORITY_MAP[p.priority]?.label || p.priority}
                              color={PRIORITY_MAP[p.priority]?.color || 'default'}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 120 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LinearProgress
                                variant="determinate"
                                value={completion}
                                sx={{ flex: 1, height: 6, borderRadius: 3 }}
                              />
                              <Typography variant="caption" sx={{ minWidth: 30 }}>
                                {completion}%
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {p.pm_last_name
                              ? `${p.pm_last_name} ${p.pm_first_name}`
                              : '-'}
                          </TableCell>
                          <TableCell>{formatDate(p.end_date)}</TableCell>
                          <TableCell align="right">{p.task_count || 0}</TableCell>
                          <TableCell align="right">{formatCurrency(p.budget)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </Paper>
          )}

          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="Sorok száma:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
          />
        </>
      )}

      {/* Form Modal */}
      <ProjectFormModal
        open={formModalOpen}
        onClose={() => { setFormModalOpen(false); setEditData(null); }}
        onSave={editData ? handleEditProject : handleCreateProject}
        editData={editData}
        users={users}
        costCenters={costCenters}
      />

      {/* Delete confirmation */}
      <Dialog open={deleteConfirmOpen} onClose={() => { setDeleteConfirmOpen(false); setDeleteTarget(null); }}>
        <DialogTitle>Projekt törlése</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan törölni szeretné a(z) <strong>{deleteTarget?.name}</strong> projektet?
            A projekt archiválásra kerül.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteConfirmOpen(false); setDeleteTarget(null); }}>Mégse</Button>
          <Button variant="contained" color="error" onClick={handleDeleteProject}>Törlés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
