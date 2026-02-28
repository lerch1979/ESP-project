import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  Divider,
  Grid,
  Tooltip,
  InputAdornment,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Timer as TimerIcon,
  Close as CloseIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { slaPoliciesAPI, ticketsAPI } from '../services/api';

const PRIORITY_CONFIG = {
  low: { label: 'Alacsony', color: '#94a3b8' },
  normal: { label: 'Normál', color: '#60a5fa' },
  urgent: { label: 'Sürgős', color: '#f59e0b' },
  critical: { label: 'Kritikus', color: '#ef4444' },
};

const PRIORITY_ORDER = ['low', 'normal', 'urgent', 'critical'];

const emptyForm = {
  name: '',
  description: '',
  is_active: true,
  rules: {
    low: { response_hours: 24, resolution_hours: 72 },
    normal: { response_hours: 8, resolution_hours: 48 },
    urgent: { response_hours: 4, resolution_hours: 24 },
    critical: { response_hours: 1, resolution_hours: 8 },
  },
  business_hours_only: true,
  business_hours_start: '08:00',
  business_hours_end: '17:00',
  escalation_enabled: false,
  escalation_after_percentage: 80,
  escalation_to_role: '',
  apply_to_categories: [],
};

function SLAPolicies() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('settings.edit');

  // List state
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterActive, setFilterActive] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Categories for multi-select
  const [categories, setCategories] = useState([]);

  // Load categories
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await ticketsAPI.getCategories();
        setCategories(res.data?.categories || res.data || []);
      } catch (error) {
        // Categories are optional, don't show error
      }
    };
    loadCategories();
  }, []);

  // Load policies
  const loadPolicies = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterActive !== '') params.is_active = filterActive;

      const res = await slaPoliciesAPI.getAll(params);
      setPolicies(res.data?.policies || []);
    } catch (error) {
      toast.error('Hiba az SLA szabályzatok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [filterActive]);

  useEffect(() => {
    loadPolicies();
  }, [loadPolicies]);

  const paginatedPolicies = policies.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // CRUD handlers
  const handleOpenCreate = () => {
    setEditingItem(null);
    setForm({ ...emptyForm, rules: { ...emptyForm.rules } });
    setDialogOpen(true);
  };

  const handleOpenEdit = (policy) => {
    setEditingItem(policy);
    const rules = typeof policy.rules === 'string' ? JSON.parse(policy.rules) : (policy.rules || {});
    setForm({
      name: policy.name || '',
      description: policy.description || '',
      is_active: policy.is_active !== false,
      rules: {
        low: { response_hours: rules.low?.response_hours || 24, resolution_hours: rules.low?.resolution_hours || 72 },
        normal: { response_hours: rules.normal?.response_hours || 8, resolution_hours: rules.normal?.resolution_hours || 48 },
        urgent: { response_hours: rules.urgent?.response_hours || 4, resolution_hours: rules.urgent?.resolution_hours || 24 },
        critical: { response_hours: rules.critical?.response_hours || 1, resolution_hours: rules.critical?.resolution_hours || 8 },
      },
      business_hours_only: policy.business_hours_only !== false,
      business_hours_start: policy.business_hours_start || '08:00',
      business_hours_end: policy.business_hours_end || '17:00',
      escalation_enabled: policy.escalation_enabled || false,
      escalation_after_percentage: policy.escalation_after_percentage || 80,
      escalation_to_role: policy.escalation_to_role || '',
      apply_to_categories: policy.apply_to_categories || [],
    });
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingItem(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('A név megadása kötelező');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        is_active: form.is_active,
        rules: form.rules,
        business_hours_only: form.business_hours_only,
        business_hours_start: form.business_hours_start,
        business_hours_end: form.business_hours_end,
        escalation_enabled: form.escalation_enabled,
        escalation_after_percentage: form.escalation_after_percentage,
        escalation_to_role: form.escalation_to_role || null,
        apply_to_categories: form.apply_to_categories.length > 0 ? form.apply_to_categories : null,
      };

      if (editingItem) {
        await slaPoliciesAPI.update(editingItem.id, payload);
        toast.success('SLA szabályzat sikeresen frissítve');
      } else {
        await slaPoliciesAPI.create(payload);
        toast.success('SLA szabályzat sikeresen létrehozva');
      }
      handleClose();
      loadPolicies();
    } catch (error) {
      const msg = error.response?.data?.message || 'Hiba a mentéskor';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setDeleteLoading(true);
      await slaPoliciesAPI.delete(id);
      toast.success('SLA szabályzat sikeresen törölve');
      setDeleteConfirm(null);
      loadPolicies();
    } catch (error) {
      toast.error('Hiba a törléskor');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRuleChange = (priority, field, value) => {
    setForm(prev => ({
      ...prev,
      rules: {
        ...prev.rules,
        [priority]: {
          ...prev.rules[priority],
          [field]: parseFloat(value) || 0,
        },
      },
    }));
  };

  const formatHours = (hours) => {
    if (hours < 1) return `${Math.round(hours * 60)} perc`;
    if (hours === 1) return '1 óra';
    return `${hours} óra`;
  };

  const renderRulesChips = (rules) => {
    if (!rules || typeof rules !== 'object') return '-';
    const parsed = typeof rules === 'string' ? JSON.parse(rules) : rules;

    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {PRIORITY_ORDER.map(key => {
          const rule = parsed[key];
          if (!rule) return null;
          const cfg = PRIORITY_CONFIG[key];
          return (
            <Tooltip
              key={key}
              title={`Válasz: ${formatHours(rule.response_hours)} | Megoldás: ${formatHours(rule.resolution_hours)}`}
            >
              <Chip
                size="small"
                label={`${cfg.label}: ${formatHours(rule.response_hours)} / ${formatHours(rule.resolution_hours)}`}
                sx={{
                  bgcolor: `${cfg.color}20`,
                  color: cfg.color,
                  fontWeight: 500,
                  fontSize: '0.7rem',
                  mb: 0.5,
                }}
              />
            </Tooltip>
          );
        })}
      </Stack>
    );
  };

  return (
    <Layout>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimerIcon sx={{ fontSize: 28, color: '#2563eb' }} />
            <Typography variant="h5" fontWeight={700}>
              SLA Szabályzatok
            </Typography>
          </Box>
          {canEdit && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              Új szabályzat
            </Button>
          )}
        </Box>

        {/* Info alert */}
        <Alert severity="info" sx={{ mb: 3 }}>
          Az SLA (Service Level Agreement) szabályzatok meghatározzák a válasz- és megoldási időket prioritás szintenként.
          Segítségükkel biztosítható, hogy a hibajegyek időben kezelésre kerüljenek.
        </Alert>

        {/* Filters */}
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Státusz</InputLabel>
              <Select
                value={filterActive}
                label="Státusz"
                onChange={(e) => { setFilterActive(e.target.value); setPage(0); }}
              >
                <MenuItem value="">Összes</MenuItem>
                <MenuItem value="true">Aktív</MenuItem>
                <MenuItem value="false">Inaktív</MenuItem>
              </Select>
            </FormControl>
            {filterActive !== '' && (
              <Button size="small" onClick={() => { setFilterActive(''); setPage(0); }}>
                Szűrők törlése
              </Button>
            )}
          </Stack>
        </Paper>

        {/* Table */}
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>Leírás</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Szabályok</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>Munkaidő</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>Eszkaláció</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                {canEdit && <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 7 : 6} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : paginatedPolicies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 7 : 6} align="center" sx={{ py: 5 }}>
                    <TimerIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                      Nincsenek SLA szabályzatok
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {filterActive !== '' ? 'Próbálj más szűrési feltételt.' : 'Hozz létre egy új SLA szabályzatot.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPolicies.map((policy) => (
                  <TableRow key={policy.id} hover sx={{ '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}>
                    <TableCell>
                      <Typography fontWeight={600} variant="body2">{policy.name}</Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, maxWidth: 200 }}>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {policy.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {renderRulesChips(policy.rules)}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {policy.business_hours_only ? (
                        <Chip
                          size="small"
                          label={`${policy.business_hours_start?.slice(0, 5) || '08:00'} - ${policy.business_hours_end?.slice(0, 5) || '17:00'}`}
                          sx={{ bgcolor: '#dbeafe', color: '#2563eb', fontWeight: 500 }}
                        />
                      ) : (
                        <Chip size="small" label="0-24" sx={{ bgcolor: '#fef3c7', color: '#d97706', fontWeight: 500 }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {policy.escalation_enabled ? (
                        <Chip
                          size="small"
                          label={`${policy.escalation_after_percentage}%`}
                          sx={{ bgcolor: '#fee2e2', color: '#dc2626', fontWeight: 500 }}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={policy.is_active ? 'Aktív' : 'Inaktív'}
                        sx={{
                          bgcolor: policy.is_active ? '#dcfce7' : '#f1f5f9',
                          color: policy.is_active ? '#16a34a' : '#94a3b8',
                          fontWeight: 500,
                        }}
                      />
                    </TableCell>
                    {canEdit && (
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Szerkesztés">
                            <IconButton size="small" onClick={() => handleOpenEdit(policy)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Törlés">
                            <IconButton size="small" color="error" onClick={() => setDeleteConfirm(policy)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={policies.length}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="Sorok/oldal:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
          />
        </TableContainer>

        {/* Create/Edit Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={handleClose}
          fullWidth
          maxWidth="md"
          fullScreen={isMobile}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TimerIcon sx={{ color: '#2563eb' }} />
              <Typography variant="h6" fontWeight={600}>
                {editingItem ? 'SLA szabályzat szerkesztése' : 'Új SLA szabályzat'}
              </Typography>
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <Divider />

          <DialogContent sx={{ p: 3 }}>
            {/* Basic info */}
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
              Alapadatok
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={8}>
                <TextField
                  label="Név"
                  fullWidth
                  required
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="pl. Standard SLA"
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.is_active}
                      onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                      color="success"
                    />
                  }
                  label="Aktív"
                  sx={{ mt: 1 }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Leírás"
                  fullWidth
                  multiline
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="pl. Alapértelmezett SLA szabályzat"
                />
              </Grid>
            </Grid>

            <Divider sx={{ mb: 3 }} />

            {/* Priority rules */}
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
              Időkorlátok prioritás szerint
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Válaszidő (óra)</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Megoldási idő (óra)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {PRIORITY_ORDER.map(key => {
                    const cfg = PRIORITY_CONFIG[key];
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Chip
                            size="small"
                            label={cfg.label}
                            sx={{ bgcolor: `${cfg.color}20`, color: cfg.color, fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            size="small"
                            value={form.rules[key]?.response_hours || ''}
                            onChange={(e) => handleRuleChange(key, 'response_hours', e.target.value)}
                            inputProps={{ min: 0, step: 0.5 }}
                            sx={{ width: 120 }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            size="small"
                            value={form.rules[key]?.resolution_hours || ''}
                            onChange={(e) => handleRuleChange(key, 'resolution_hours', e.target.value)}
                            inputProps={{ min: 0, step: 0.5 }}
                            sx={{ width: 120 }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Divider sx={{ mb: 3 }} />

            {/* Business hours */}
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
              Munkaidő beállítások
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.business_hours_only}
                      onChange={(e) => setForm(prev => ({ ...prev, business_hours_only: e.target.checked }))}
                    />
                  }
                  label="Csak munkaidőben számoljon (ha ki van kapcsolva, 0-24 órás)"
                />
              </Grid>
              {form.business_hours_only && (
                <>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Kezdés"
                      type="time"
                      fullWidth
                      size="small"
                      value={form.business_hours_start}
                      onChange={(e) => setForm(prev => ({ ...prev, business_hours_start: e.target.value }))}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField
                      label="Befejezés"
                      type="time"
                      fullWidth
                      size="small"
                      value={form.business_hours_end}
                      onChange={(e) => setForm(prev => ({ ...prev, business_hours_end: e.target.value }))}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </>
              )}
            </Grid>

            <Divider sx={{ mb: 3 }} />

            {/* Escalation */}
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
              Eszkaláció
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.escalation_enabled}
                      onChange={(e) => setForm(prev => ({ ...prev, escalation_enabled: e.target.checked }))}
                    />
                  }
                  label="Eszkaláció engedélyezése"
                />
              </Grid>
              {form.escalation_enabled && (
                <>
                  <Grid item xs={6} sm={4}>
                    <TextField
                      label="Eszkaláció után (%)"
                      type="number"
                      fullWidth
                      size="small"
                      value={form.escalation_after_percentage}
                      onChange={(e) => setForm(prev => ({ ...prev, escalation_after_percentage: parseInt(e.target.value) || 80 }))}
                      inputProps={{ min: 1, max: 100 }}
                      helperText="Az SLA idő ennyi %-a után"
                    />
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Eszkaláció célszerepkör</InputLabel>
                      <Select
                        value={form.escalation_to_role}
                        label="Eszkaláció célszerepkör"
                        onChange={(e) => setForm(prev => ({ ...prev, escalation_to_role: e.target.value }))}
                      >
                        <MenuItem value="">Nincs megadva</MenuItem>
                        <MenuItem value="admin">Admin</MenuItem>
                        <MenuItem value="manager">Manager</MenuItem>
                        <MenuItem value="facility_manager">Facility Manager</MenuItem>
                        <MenuItem value="superadmin">Superadmin</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </>
              )}
            </Grid>

            <Divider sx={{ mb: 3 }} />

            {/* Category assignment */}
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
              Kategória hozzárendelés
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Alkalmazás kategóriákra</InputLabel>
              <Select
                multiple
                value={form.apply_to_categories || []}
                label="Alkalmazás kategóriákra"
                onChange={(e) => setForm(prev => ({ ...prev, apply_to_categories: e.target.value }))}
                renderValue={(selected) => (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                    {selected.map(id => {
                      const cat = categories.find(c => c.id === id);
                      return <Chip key={id} size="small" label={cat?.name || id} />;
                    })}
                  </Stack>
                )}
              >
                {categories.map(cat => (
                  <MenuItem key={cat.id} value={cat.id}>{cat.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Ha nem választasz kategóriát, az összes kategóriára érvényes lesz.
            </Typography>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={handleClose} disabled={saving}>
              Mégse
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              {saving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Mentés'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Törlés</DialogTitle>
          <DialogContent>
            <Typography>
              Biztosan törölni szeretnéd a <strong>{deleteConfirm?.name}</strong> SLA szabályzatot?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Ez a művelet nem vonható vissza.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>
              Mégse
            </Button>
            <Button
              onClick={() => handleDelete(deleteConfirm?.id)}
              color="error"
              variant="contained"
              disabled={deleteLoading}
            >
              {deleteLoading ? <CircularProgress size={20} /> : 'Törlés'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}

export default SLAPolicies;
