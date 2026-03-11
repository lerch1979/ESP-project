import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Tabs, Tab, Button, IconButton, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
  Grid, Card, CardContent, Tooltip, Alert, CircularProgress,
  InputAdornment, FormControl, InputLabel, Select, Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
  History as HistoryIcon,
  AttachMoney as MoneyIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { salaryAPI, employeesAPI } from '../services/api';

const LEVELS = [
  { value: 'junior', label: 'Junior' },
  { value: 'medior', label: 'Medior' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'manager', label: 'Manager' },
  { value: 'director', label: 'Director' },
];

const CHANGE_TYPES = [
  { value: 'initial', label: 'Kezdeti' },
  { value: 'raise', label: 'Emelés' },
  { value: 'promotion', label: 'Előléptetés' },
  { value: 'adjustment', label: 'Korrekció' },
  { value: 'demotion', label: 'Visszasorolás' },
  { value: 'annual_review', label: 'Éves felülvizsgálat' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Teljes munkaidős' },
  { value: 'part_time', label: 'Részmunkaidős' },
  { value: 'contract', label: 'Megbízási' },
];

function formatCurrency(amount, currency = 'HUF') {
  if (!amount) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU');
}

// ============================================
// STATS CARDS
// ============================================
function StatsCards({ stats, loading }) {
  if (loading) return <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />;
  if (!stats?.overall) return null;

  const { overall, by_department, gender_gap, active_bands } = stats;

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PeopleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">Alkalmazottak</Typography>
              </Box>
              <Typography variant="h4">{overall.total_employees || 0}</Typography>
              <Typography variant="body2" color="text.secondary">aktív bérrekorddal</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <MoneyIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">Átlagbér</Typography>
              </Box>
              <Typography variant="h5">{formatCurrency(overall.avg_salary)}</Typography>
              <Typography variant="body2" color="text.secondary">bruttó havi</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <TrendingUpIcon color="warning" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">Medián bér</Typography>
              </Box>
              <Typography variant="h5">{formatCurrency(overall.median_salary)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatCurrency(overall.min_salary)} - {formatCurrency(overall.max_salary)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <AssessmentIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="subtitle2" color="text.secondary">Bérsávok</Typography>
              </Box>
              <Typography variant="h4">{active_bands || 0}</Typography>
              <Typography variant="body2" color="text.secondary">aktív bérsáv</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Department breakdown */}
      {by_department && by_department.length > 0 && (
        <Paper sx={{ mt: 2, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Részleg szerinti bontás</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Részleg</TableCell>
                  <TableCell align="right">Létszám</TableCell>
                  <TableCell align="right">Átlag</TableCell>
                  <TableCell align="right">Medián</TableCell>
                  <TableCell align="right">Min</TableCell>
                  <TableCell align="right">Max</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {by_department.map((dept) => (
                  <TableRow key={dept.department}>
                    <TableCell>{dept.department}</TableCell>
                    <TableCell align="right">{dept.employee_count}</TableCell>
                    <TableCell align="right">{formatCurrency(dept.avg_salary)}</TableCell>
                    <TableCell align="right">{formatCurrency(dept.median_salary)}</TableCell>
                    <TableCell align="right">{formatCurrency(dept.min_salary)}</TableCell>
                    <TableCell align="right">{formatCurrency(dept.max_salary)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Gender pay gap */}
      {gender_gap && gender_gap.length > 0 && (
        <Paper sx={{ mt: 2, p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Nemek szerinti bontás</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nem</TableCell>
                  <TableCell align="right">Létszám</TableCell>
                  <TableCell align="right">Átlag</TableCell>
                  <TableCell align="right">Medián</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {gender_gap.map((g) => (
                  <TableRow key={g.gender}>
                    <TableCell>{g.gender === 'male' ? 'Férfi' : g.gender === 'female' ? 'Nő' : 'Egyéb'}</TableCell>
                    <TableCell align="right">{g.employee_count}</TableCell>
                    <TableCell align="right">{formatCurrency(g.avg_salary)}</TableCell>
                    <TableCell align="right">{formatCurrency(g.median_salary)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}

// ============================================
// BAND DIALOG
// ============================================
function BandDialog({ open, onClose, onSave, band, departments }) {
  const [form, setForm] = useState({
    position_name: '', department: '', level: '', min_salary: '', max_salary: '',
    median_salary: '', currency: 'HUF', employment_type: 'full_time', location: '', notes: '',
  });

  useEffect(() => {
    if (band) {
      setForm({
        position_name: band.position_name || '',
        department: band.department || '',
        level: band.level || '',
        min_salary: band.min_salary || '',
        max_salary: band.max_salary || '',
        median_salary: band.median_salary || '',
        currency: band.currency || 'HUF',
        employment_type: band.employment_type || 'full_time',
        location: band.location || '',
        notes: band.notes || '',
      });
    } else {
      setForm({ position_name: '', department: '', level: '', min_salary: '', max_salary: '', median_salary: '', currency: 'HUF', employment_type: 'full_time', location: '', notes: '' });
    }
  }, [band, open]);

  const handleSubmit = () => {
    if (!form.position_name || !form.min_salary || !form.max_salary) {
      toast.error('Pozíció, minimum és maximum bér megadása kötelező');
      return;
    }
    if (parseFloat(form.min_salary) > parseFloat(form.max_salary)) {
      toast.error('A minimum bér nem lehet nagyobb a maximum bérnél');
      return;
    }
    onSave(form);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{band ? 'Bérsáv szerkesztése' : 'Új bérsáv'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Pozíció neve" value={form.position_name} onChange={(e) => setForm({ ...form, position_name: e.target.value })} required />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Autocomplete
              freeSolo options={departments || []} value={form.department}
              onInputChange={(e, val) => setForm({ ...form, department: val })}
              renderInput={(params) => <TextField {...params} label="Részleg" />}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth select label="Szint" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <MenuItem value="">-</MenuItem>
              {LEVELS.map((l) => <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth select label="Foglalkoztatás" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
              {EMPLOYMENT_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth label="Helyszín" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Minimum bér" value={form.min_salary} onChange={(e) => setForm({ ...form, min_salary: e.target.value })} required
              InputProps={{ endAdornment: <InputAdornment position="end">Ft</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Maximum bér" value={form.max_salary} onChange={(e) => setForm({ ...form, max_salary: e.target.value })} required
              InputProps={{ endAdornment: <InputAdornment position="end">Ft</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Medián bér" value={form.median_salary} onChange={(e) => setForm({ ...form, median_salary: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">Ft</InputAdornment> }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={2} label="Megjegyzés" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit}>{band ? 'Mentés' : 'Létrehozás'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// SALARY DIALOG
// ============================================
function SalaryDialog({ open, onClose, onSave, salary, bands, employees }) {
  const [form, setForm] = useState({
    employee_id: '', gross_salary: '', net_salary: '', salary_band_id: '',
    effective_date: '', change_reason: '', change_type: 'initial', notes: '',
  });

  useEffect(() => {
    if (salary) {
      setForm({
        employee_id: salary.employee_id || '',
        gross_salary: salary.gross_salary || '',
        net_salary: salary.net_salary || '',
        salary_band_id: salary.salary_band_id || '',
        effective_date: salary.effective_date ? salary.effective_date.substring(0, 10) : '',
        change_reason: salary.change_reason || '',
        change_type: salary.change_type || 'initial',
        notes: salary.notes || '',
      });
    } else {
      setForm({ employee_id: '', gross_salary: '', net_salary: '', salary_band_id: '', effective_date: new Date().toISOString().substring(0, 10), change_reason: '', change_type: 'initial', notes: '' });
    }
  }, [salary, open]);

  const handleSubmit = () => {
    if (!form.employee_id || !form.gross_salary || !form.effective_date) {
      toast.error('Munkavállaló, bruttó bér és dátum megadása kötelező');
      return;
    }
    onSave(form);
  };

  const selectedEmployee = employees.find((e) => e.id === form.employee_id);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{salary ? 'Bérrekord szerkesztése' : 'Új bérrekord'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={6}>
            <Autocomplete
              options={employees} getOptionLabel={(opt) => `${opt.last_name} ${opt.first_name} (${opt.department || 'N/A'})`}
              value={selectedEmployee || null}
              onChange={(e, val) => setForm({ ...form, employee_id: val?.id || '' })}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderOption={(props, option) => <li {...props} key={option.id}>{option.last_name} {option.first_name} ({option.department || 'N/A'})</li>}
              renderInput={(params) => <TextField {...params} label="Munkavállaló" required />}
              disabled={!!salary}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth select label="Bérsáv" value={form.salary_band_id} onChange={(e) => setForm({ ...form, salary_band_id: e.target.value })}>
              <MenuItem value="">Nincs hozzárendelve</MenuItem>
              {bands.map((b) => <MenuItem key={b.id} value={b.id}>{b.position_name} ({b.level || 'N/A'}) - {formatCurrency(b.min_salary)}-{formatCurrency(b.max_salary)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Bruttó bér" value={form.gross_salary} onChange={(e) => setForm({ ...form, gross_salary: e.target.value })} required
              InputProps={{ endAdornment: <InputAdornment position="end">Ft</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="number" label="Nettó bér" value={form.net_salary} onChange={(e) => setForm({ ...form, net_salary: e.target.value })}
              InputProps={{ endAdornment: <InputAdornment position="end">Ft</InputAdornment> }} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField fullWidth type="date" label="Hatályos dátum" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} required InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth select label="Változás típusa" value={form.change_type} onChange={(e) => setForm({ ...form, change_type: e.target.value })}>
              {CHANGE_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Változás indoka" value={form.change_reason} onChange={(e) => setForm({ ...form, change_reason: e.target.value })} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={2} label="Megjegyzés" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit}>{salary ? 'Mentés' : 'Létrehozás'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// HISTORY DIALOG
// ============================================
function HistoryDialog({ open, onClose, employeeId, employeeName }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && employeeId) {
      setLoading(true);
      salaryAPI.getEmployeeSalaryHistory(employeeId)
        .then((res) => setHistory(res.data?.salary_history || []))
        .catch(() => toast.error('Bértörténet betöltési hiba'))
        .finally(() => setLoading(false));
    }
  }, [open, employeeId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Bértörténet - {employeeName}</DialogTitle>
      <DialogContent>
        {loading ? <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} /> : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Hatályos</TableCell>
                  <TableCell>Záró dátum</TableCell>
                  <TableCell align="right">Bruttó</TableCell>
                  <TableCell align="right">Nettó</TableCell>
                  <TableCell>Típus</TableCell>
                  <TableCell>Bérsáv</TableCell>
                  <TableCell>Indok</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id} sx={!h.end_date ? { bgcolor: 'action.selected' } : {}}>
                    <TableCell>{formatDate(h.effective_date)}</TableCell>
                    <TableCell>{formatDate(h.end_date)}</TableCell>
                    <TableCell align="right">{formatCurrency(h.gross_salary)}</TableCell>
                    <TableCell align="right">{formatCurrency(h.net_salary)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={CHANGE_TYPES.find((t) => t.value === h.change_type)?.label || h.change_type} />
                    </TableCell>
                    <TableCell>{h.band_position ? `${h.band_position} (${h.band_level || ''})` : '-'}</TableCell>
                    <TableCell>{h.change_reason || '-'}</TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center">Nincs bértörténet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Bezárás</Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function SalaryTransparency() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Bands
  const [bands, setBands] = useState([]);
  const [bandsTotal, setBandsTotal] = useState(0);
  const [bandsPage, setBandsPage] = useState(0);
  const [bandDialog, setBandDialog] = useState(false);
  const [editBand, setEditBand] = useState(null);

  // Employee Salaries
  const [salaries, setSalaries] = useState([]);
  const [salariesTotal, setSalariesTotal] = useState(0);
  const [salariesPage, setSalariesPage] = useState(0);
  const [salaryDialog, setSalaryDialog] = useState(false);
  const [editSalary, setEditSalary] = useState(null);

  // History
  const [historyDialog, setHistoryDialog] = useState(false);
  const [historyEmployee, setHistoryEmployee] = useState({ id: null, name: '' });

  // Helpers
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allBands, setAllBands] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');

  // Load departments, employees, and all bands on mount
  useEffect(() => {
    salaryAPI.getDepartments().then((res) => setDepartments(res.data?.departments || [])).catch(() => {});
    employeesAPI.getAll({ limit: 1000 }).then((res) => {
      const emps = res.data?.employees || res.data || [];
      setEmployees(Array.isArray(emps) ? emps : []);
    }).catch(() => {});
    salaryAPI.getBands({ limit: 1000 }).then((res) => setAllBands(res.data?.salary_bands || [])).catch(() => {});
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await salaryAPI.getStats(deptFilter ? { department: deptFilter } : {});
      setStats(res.data);
    } catch { toast.error('Statisztikák betöltési hiba'); }
    setStatsLoading(false);
  }, [deptFilter]);

  const loadBands = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salaryAPI.getBands({ page: bandsPage + 1, limit: 25, department: deptFilter || undefined });
      setBands(res.data?.salary_bands || []);
      setBandsTotal(res.data?.pagination?.total || 0);
    } catch { toast.error('Bérsávok betöltési hiba'); }
    setLoading(false);
  }, [bandsPage, deptFilter]);

  const loadSalaries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salaryAPI.getEmployeeSalaries({ page: salariesPage + 1, limit: 25, current_only: 'true', department: deptFilter || undefined });
      setSalaries(res.data?.employee_salaries || []);
      setSalariesTotal(res.data?.pagination?.total || 0);
    } catch { toast.error('Bérek betöltési hiba'); }
    setLoading(false);
  }, [salariesPage, deptFilter]);

  useEffect(() => {
    if (tab === 0) loadStats();
    else if (tab === 1) loadBands();
    else if (tab === 2) loadSalaries();
  }, [tab, loadStats, loadBands, loadSalaries]);

  // Band CRUD
  const handleSaveBand = async (form) => {
    try {
      if (editBand) {
        await salaryAPI.updateBand(editBand.id, form);
        toast.success('Bérsáv frissítve');
      } else {
        await salaryAPI.createBand(form);
        toast.success('Bérsáv létrehozva');
      }
      setBandDialog(false);
      setEditBand(null);
      loadBands();
      loadStats();
      salaryAPI.getBands({ limit: 1000 }).then((res) => setAllBands(res.data?.salary_bands || [])).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hiba történt');
    }
  };

  const handleDeleteBand = async (id) => {
    if (!window.confirm('Biztosan törölni szeretné ezt a bérsávot?')) return;
    try {
      await salaryAPI.deleteBand(id);
      toast.success('Bérsáv törölve');
      loadBands();
      loadStats();
      salaryAPI.getBands({ limit: 1000 }).then((res) => setAllBands(res.data?.salary_bands || [])).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Törlési hiba');
    }
  };

  // Salary CRUD
  const handleSaveSalary = async (form) => {
    try {
      if (editSalary) {
        await salaryAPI.updateEmployeeSalary(editSalary.id, form);
        toast.success('Bérrekord frissítve');
      } else {
        await salaryAPI.createEmployeeSalary(form);
        toast.success('Bérrekord létrehozva');
      }
      setSalaryDialog(false);
      setEditSalary(null);
      loadSalaries();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hiba történt');
    }
  };

  const handleDeleteSalary = async (id) => {
    if (!window.confirm('Biztosan törölni szeretné ezt a bérrekordot?')) return;
    try {
      await salaryAPI.deleteEmployeeSalary(id);
      toast.success('Bérrekord törölve');
      loadSalaries();
      loadStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Törlési hiba');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Bértranszparencia</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Részleg szűrő</InputLabel>
            <Select value={deptFilter} label="Részleg szűrő" onChange={(e) => setDeptFilter(e.target.value)}>
              <MenuItem value="">Összes részleg</MenuItem>
              {departments.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
            </Select>
          </FormControl>
          <Tooltip title="Frissítés">
            <IconButton onClick={() => { if (tab === 0) loadStats(); else if (tab === 1) loadBands(); else loadSalaries(); }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<AssessmentIcon />} label="Áttekintés" iconPosition="start" />
        <Tab icon={<TrendingUpIcon />} label="Bérsávok" iconPosition="start" />
        <Tab icon={<PeopleIcon />} label="Munkavállalói bérek" iconPosition="start" />
      </Tabs>

      {/* TAB 0: Stats */}
      {tab === 0 && <StatsCards stats={stats} loading={statsLoading} />}

      {/* TAB 1: Salary Bands */}
      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Bérsávok</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditBand(null); setBandDialog(true); }}>
              Új bérsáv
            </Button>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Pozíció</TableCell>
                  <TableCell>Részleg</TableCell>
                  <TableCell>Szint</TableCell>
                  <TableCell>Foglalkoztatás</TableCell>
                  <TableCell align="right">Min bér</TableCell>
                  <TableCell align="right">Max bér</TableCell>
                  <TableCell align="right">Medián</TableCell>
                  <TableCell align="center">Alkalmazottak</TableCell>
                  <TableCell align="center">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} align="center"><CircularProgress size={24} /></TableCell></TableRow>
                ) : bands.length === 0 ? (
                  <TableRow><TableCell colSpan={9} align="center">Nincs bérsáv</TableCell></TableRow>
                ) : bands.map((band) => (
                  <TableRow key={band.id}>
                    <TableCell>{band.position_name}</TableCell>
                    <TableCell>{band.department || '-'}</TableCell>
                    <TableCell>
                      {band.level ? <Chip size="small" label={LEVELS.find((l) => l.value === band.level)?.label || band.level} /> : '-'}
                    </TableCell>
                    <TableCell>{EMPLOYMENT_TYPES.find((t) => t.value === band.employment_type)?.label || band.employment_type}</TableCell>
                    <TableCell align="right">{formatCurrency(band.min_salary)}</TableCell>
                    <TableCell align="right">{formatCurrency(band.max_salary)}</TableCell>
                    <TableCell align="right">{formatCurrency(band.median_salary)}</TableCell>
                    <TableCell align="center">{band.employee_count || 0}</TableCell>
                    <TableCell align="center">
                      <Tooltip title="Szerkesztés">
                        <IconButton size="small" onClick={() => { setEditBand(band); setBandDialog(true); }}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Törlés">
                        <IconButton size="small" color="error" onClick={() => handleDeleteBand(band.id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div" count={bandsTotal} page={bandsPage} onPageChange={(e, p) => setBandsPage(p)}
            rowsPerPage={25} rowsPerPageOptions={[25]} labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
          />
        </Paper>
      )}

      {/* TAB 2: Employee Salaries */}
      {tab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">Munkavállalói bérek (aktuális)</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditSalary(null); setSalaryDialog(true); }}>
              Új bérrekord
            </Button>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Munkavállaló</TableCell>
                  <TableCell>Részleg</TableCell>
                  <TableCell>Pozíció</TableCell>
                  <TableCell align="right">Bruttó bér</TableCell>
                  <TableCell align="right">Nettó bér</TableCell>
                  <TableCell>Bérsáv</TableCell>
                  <TableCell>Hatályos</TableCell>
                  <TableCell>Típus</TableCell>
                  <TableCell align="center">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} align="center"><CircularProgress size={24} /></TableCell></TableRow>
                ) : salaries.length === 0 ? (
                  <TableRow><TableCell colSpan={9} align="center">Nincs bérrekord</TableCell></TableRow>
                ) : salaries.map((sal) => {
                  const inBand = sal.band_min && sal.band_max && (parseFloat(sal.gross_salary) >= parseFloat(sal.band_min) && parseFloat(sal.gross_salary) <= parseFloat(sal.band_max));
                  const outOfBand = sal.band_min && sal.band_max && !inBand;

                  return (
                    <TableRow key={sal.id}>
                      <TableCell>{sal.employee_last_name} {sal.employee_first_name}</TableCell>
                      <TableCell>{sal.employee_department || '-'}</TableCell>
                      <TableCell>{sal.employee_position || '-'}</TableCell>
                      <TableCell align="right" sx={outOfBand ? { color: 'error.main', fontWeight: 'bold' } : {}}>
                        {formatCurrency(sal.gross_salary)}
                        {outOfBand && <Tooltip title="Bérsávon kívül!"><Chip size="small" color="error" label="!" sx={{ ml: 0.5 }} /></Tooltip>}
                      </TableCell>
                      <TableCell align="right">{formatCurrency(sal.net_salary)}</TableCell>
                      <TableCell>{sal.band_position ? `${sal.band_position} (${sal.band_level || ''})` : '-'}</TableCell>
                      <TableCell>{formatDate(sal.effective_date)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={CHANGE_TYPES.find((t) => t.value === sal.change_type)?.label || sal.change_type || '-'} />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Történet">
                          <IconButton size="small" onClick={() => { setHistoryEmployee({ id: sal.employee_id, name: `${sal.employee_last_name} ${sal.employee_first_name}` }); setHistoryDialog(true); }}>
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Szerkesztés">
                          <IconButton size="small" onClick={() => { setEditSalary(sal); setSalaryDialog(true); }}><EditIcon fontSize="small" /></IconButton>
                        </Tooltip>
                        <Tooltip title="Törlés">
                          <IconButton size="small" color="error" onClick={() => handleDeleteSalary(sal.id)}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div" count={salariesTotal} page={salariesPage} onPageChange={(e, p) => setSalariesPage(p)}
            rowsPerPage={25} rowsPerPageOptions={[25]} labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
          />
        </Paper>
      )}

      {/* Dialogs */}
      <BandDialog open={bandDialog} onClose={() => { setBandDialog(false); setEditBand(null); }} onSave={handleSaveBand} band={editBand} departments={departments} />
      <SalaryDialog open={salaryDialog} onClose={() => { setSalaryDialog(false); setEditSalary(null); }} onSave={handleSaveSalary} salary={editSalary} bands={allBands} employees={employees} />
      <HistoryDialog open={historyDialog} onClose={() => setHistoryDialog(false)} employeeId={historyEmployee.id} employeeName={historyEmployee.name} />
    </Box>
  );
}
