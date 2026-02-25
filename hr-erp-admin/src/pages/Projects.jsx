import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  LinearProgress,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon,
  Assignment as ProjectIcon, PlayArrow as ActiveIcon,
  Warning as OverdueIcon, AccountBalance as BudgetIcon,
} from '@mui/icons-material';
import { projectsAPI, usersAPI, costCentersAPI } from '../services/api';
import { toast } from 'react-toastify';
import ResponsiveTable from '../components/ResponsiveTable';
import ProjectFormModal from '../components/projects/ProjectFormModal';

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

  // Dashboard stats
  const [dashboard, setDashboard] = useState(null);

  // Modal
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);

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

  const handleOpenCreate = () => {
    setEditData(null);
    setFormModalOpen(true);
  };

  const getCompletionPercent = (p) => {
    if (p.completion_percentage != null) return p.completion_percentage;
    if (p.task_count > 0 && p.completed_task_count != null) {
      return Math.round((p.completed_task_count / p.task_count) * 100);
    }
    return 0;
  };

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

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
        </Stack>
      </Paper>

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress />
          </Box>
        ) : projects.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">Nincsenek projektek</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Hozzon létre egy új projektet a fenti gombbal.
            </Typography>
          </Box>
        ) : (
          <>
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
      </Paper>

      {/* Form Modal */}
      <ProjectFormModal
        open={formModalOpen}
        onClose={() => { setFormModalOpen(false); setEditData(null); }}
        onSave={editData ? handleEditProject : handleCreateProject}
        editData={editData}
        users={users}
        costCenters={costCenters}
      />
    </Box>
  );
}
