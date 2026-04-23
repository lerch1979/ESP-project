import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, Chip, CircularProgress, Button, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, FormControl, InputLabel, Select, MenuItem, TextField,
  Tooltip, IconButton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  FileDownload as ExportIcon,
  OpenInNew as OpenIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { tasksAPI, usersAPI } from '../../services/api';
import TaskDetailModal from '../../components/TaskDetailModal';

const STATUS_LABELS = {
  todo:        { label: 'Teendő',       color: 'default' },
  in_progress: { label: 'Folyamatban',  color: 'primary' },
  review:      { label: 'Ellenőrzés',   color: 'warning' },
  done:        { label: 'Kész',         color: 'success' },
  blocked:     { label: 'Blokkolva',    color: 'error' },
};

const PRIORITY_LABELS = {
  low:      { label: 'Alacsony', color: 'default' },
  medium:   { label: 'Közepes',  color: 'info' },
  high:     { label: 'Magas',    color: 'warning' },
  critical: { label: 'Kritikus', color: 'error' },
};

const fmtDate = (s) => s ? new Date(s).toLocaleDateString('hu-HU') : '—';
const isOverdue = (s, status) => !!(s && new Date(s) < new Date() && status !== 'done');

export default function AllTasks() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [users, setUsers] = useState([]);
  const [openTaskId, setOpenTaskId] = useState(null);

  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    assigned_to: 'all',
    overdue: false,
    due_from: '',
    due_to: '',
    search: '',
  });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const queryParams = useMemo(() => ({
    status:      filters.status,
    priority:    filters.priority,
    assigned_to: filters.assigned_to,
    overdue:     filters.overdue ? 'true' : undefined,
    due_from:    filters.due_from || undefined,
    due_to:      filters.due_to || undefined,
    search:      filters.search || undefined,
    page:        page + 1,
    limit:       rowsPerPage,
  }), [filters, page, rowsPerPage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tasksAPI.getAllAdmin(queryParams);
      if (res.success) {
        setRows(res.data.tasks || []);
        setStats(res.data.stats || null);
        setTotalCount(res.data.pagination?.total || 0);
      }
    } catch (err) {
      const msg = err?.response?.status === 403
        ? 'Ehhez az oldalhoz superadmin jogosultság kell.'
        : 'Feladatok betöltése sikertelen';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => {
      try {
        const r = await usersAPI.getAll({ limit: 500 });
        setUsers(r?.data?.users || r?.data || []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const setFilter = (k, v) => {
    setFilters(prev => ({ ...prev, [k]: v }));
    setPage(0);
  };

  const exportCsv = () => {
    const header = ['Cím','Állapot','Prioritás','Felelős','Létrehozta','Határidő','Létrehozva'];
    const lines = rows.map(t => [
      (t.title || '').replace(/"/g, '""'),
      STATUS_LABELS[t.status]?.label || t.status,
      PRIORITY_LABELS[t.priority]?.label || t.priority,
      [t.assignee_first_name, t.assignee_last_name].filter(Boolean).join(' '),
      [t.creator_first_name, t.creator_last_name].filter(Boolean).join(' '),
      fmtDate(t.due_date),
      fmtDate(t.created_at),
    ].map(v => `"${v || ''}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob(["﻿" + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `feladatok-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const StatCard = ({ label, value, color = 'inherit' }) => (
    <Paper sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color, mt: 0.5 }}>
        {value ?? '—'}
      </Typography>
    </Paper>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Minden feladat</Typography>
        <Stack direction="row" spacing={1}>
          <Button startIcon={<RefreshIcon />} onClick={load}>Frissítés</Button>
          <Button variant="outlined" startIcon={<ExportIcon />} onClick={exportCsv}
            sx={{ borderColor: '#2563eb', color: '#2563eb' }}>Export CSV</Button>
        </Stack>
      </Stack>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={2}><StatCard label="Összes" value={stats?.total} /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Teendő" value={stats?.count_todo} /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Folyamatban" value={stats?.count_in_progress} color="#2563eb" /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Kész" value={stats?.count_done} color="#16a34a" /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Blokkolva" value={stats?.count_blocked} color="#dc2626" /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Lejárt" value={stats?.count_overdue} color="#ea580c" /></Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" label="Keresés"
              value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Státusz</InputLabel>
              <Select value={filters.status} onChange={e => setFilter('status', e.target.value)} label="Státusz">
                <MenuItem value="all">Összes</MenuItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Prioritás</InputLabel>
              <Select value={filters.priority} onChange={e => setFilter('priority', e.target.value)} label="Prioritás">
                <MenuItem value="all">Összes</MenuItem>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Felelős</InputLabel>
              <Select value={filters.assigned_to} onChange={e => setFilter('assigned_to', e.target.value)} label="Felelős">
                <MenuItem value="all">Összes</MenuItem>
                {users.map(u => (
                  <MenuItem key={u.id} value={u.id}>
                    {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField fullWidth size="small" type="date" label="Határidő-tól" InputLabelProps={{ shrink: true }}
              value={filters.due_from} onChange={e => setFilter('due_from', e.target.value)} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <TextField fullWidth size="small" type="date" label="Határidő-ig" InputLabelProps={{ shrink: true }}
              value={filters.due_to} onChange={e => setFilter('due_to', e.target.value)} />
          </Grid>
          <Grid item xs={6} sm={3} md={2}>
            <Button
              fullWidth
              size="small"
              variant={filters.overdue ? 'contained' : 'outlined'}
              startIcon={<WarningIcon />}
              onClick={() => setFilter('overdue', !filters.overdue)}
              sx={filters.overdue ? { bgcolor: '#ea580c' } : { borderColor: '#ea580c', color: '#ea580c' }}
            >
              Csak lejárt
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Állapot</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Felelős</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Határidő</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Létrehozta</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                        Nincs találat
                      </TableCell>
                    </TableRow>
                  ) : rows.map(t => {
                    const overdue = isOverdue(t.due_date, t.status);
                    return (
                      <TableRow key={t.id} hover sx={{ cursor: 'pointer' }} onClick={() => setOpenTaskId(t.id)}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.title}</Typography>
                          {(t.related_employee_first_name || t.related_employee_last_name) && (
                            <Typography variant="caption" color="text.secondary">
                              {[t.related_employee_first_name, t.related_employee_last_name].filter(Boolean).join(' ')}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip size="small"
                            label={STATUS_LABELS[t.status]?.label || t.status}
                            color={STATUS_LABELS[t.status]?.color || 'default'} />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" variant="outlined"
                            label={PRIORITY_LABELS[t.priority]?.label || t.priority}
                            color={PRIORITY_LABELS[t.priority]?.color || 'default'} />
                        </TableCell>
                        <TableCell>
                          {[t.assignee_first_name, t.assignee_last_name].filter(Boolean).join(' ') || '—'}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: overdue ? '#ea580c' : 'text.primary', fontWeight: overdue ? 600 : 400 }}>
                            {fmtDate(t.due_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {[t.creator_first_name, t.creator_last_name].filter(Boolean).join(' ') || '—'}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Megnyitás">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpenTaskId(t.id); }}>
                              <OpenIcon fontSize="small" />
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
              count={totalCount}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[25, 50, 100, 200]}
              labelRowsPerPage="Soronként:"
            />
          </>
        )}
      </Paper>

      <TaskDetailModal
        open={!!openTaskId}
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChange={load}
      />
    </Box>
  );
}
