import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Grid,
  Tooltip,
  CircularProgress,
  InputAdornment,
  Stack,
  Divider,
  Alert,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  AutoAwesome as AutoAssignIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  Psychology as StrategyIcon,
  Person as PersonIcon,
  Group as GroupIcon,
  Shuffle as RandomIcon,
  TrendingDown as LeastBusyIcon,
  Loop as RoundRobinIcon,
  Star as SkillIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { assignmentRulesAPI, usersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_TYPES = [
  { value: 'ticket', label: 'Hibajegy', color: '#3b82f6' },
  { value: 'task', label: 'Feladat', color: '#8b5cf6' },
];

const STRATEGIES = [
  { value: 'round_robin', label: 'Körforgó (Round Robin)', icon: <RoundRobinIcon fontSize="small" />, description: 'Felváltva oszt ki a felhasználók között' },
  { value: 'least_busy', label: 'Legkevésbé foglalt', icon: <LeastBusyIcon fontSize="small" />, description: 'A legkevesebb aktív feladattal rendelkező felhasználónak' },
  { value: 'skill_match', label: 'Képesség alapú', icon: <SkillIcon fontSize="small" />, description: 'A legmagasabb jártassággal rendelkező felhasználónak' },
  { value: 'random', label: 'Véletlenszerű', icon: <RandomIcon fontSize="small" />, description: 'Véletlenszerűen választ a jelöltek közül' },
];

const COMMON_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'superadmin', label: 'Szuperadmin' },
  { value: 'facility_manager', label: 'Facility Manager' },
  { value: 'developer', label: 'Fejlesztő' },
  { value: 'hr_manager', label: 'HR Manager' },
  { value: 'data_controller', label: 'Adatkezelő' },
  { value: 'contractor', label: 'Alvállalkozó' },
];

const CONDITION_KEYS_TICKET = [
  { value: 'priority_slug', label: 'Prioritás (slug)' },
  { value: 'category_slug', label: 'Kategória (slug)' },
  { value: 'status_slug', label: 'Státusz (slug)' },
];

const CONDITION_KEYS_TASK = [
  { value: 'priority', label: 'Prioritás' },
  { value: 'status', label: 'Státusz' },
  { value: 'skill_required', label: 'Szükséges képesség' },
  { value: 'project_id', label: 'Projekt ID' },
];

const emptyForm = {
  name: '',
  type: 'ticket',
  conditions: {},
  assign_to_role: '',
  assign_to_user_id: '',
  assign_strategy: 'round_robin',
  priority: 0,
  is_active: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTypeInfo(typeValue) {
  return RULE_TYPES.find((t) => t.value === typeValue) || { label: typeValue, color: '#64748b' };
}

function getStrategyInfo(strategyValue) {
  return STRATEGIES.find((s) => s.value === strategyValue) || { label: strategyValue, icon: null };
}

function formatConditions(conditions) {
  if (!conditions || Object.keys(conditions).length === 0) return '-';
  return Object.entries(conditions)
    .map(([key, value]) => {
      const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
      return `${key}: ${displayValue}`;
    })
    .join(' | ');
}

// ─── Component ────────────────────────────────────────────────────────────────

function AssignmentRules() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('settings.edit');

  // List state
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [filterType, setFilterType] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const searchTimeout = useRef(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // Condition builder state
  const [conditionKey, setConditionKey] = useState('');
  const [conditionValue, setConditionValue] = useState('');

  // Users lookup
  const [users, setUsers] = useState([]);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType) params.type = filterType;
      if (filterActive) params.is_active = filterActive;

      const res = await assignmentRulesAPI.getAll(params);
      const allRules = res.data?.rules || [];
      setRules(allRules);
      setTotalCount(allRules.length);
    } catch (error) {
      toast.error('Hiba a szabályok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterActive]);

  const loadUsers = async () => {
    try {
      const res = await usersAPI.getAll({ limit: 200 });
      setUsers(res.data?.users || res.data?.items || []);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setEditingRule(null);
    setForm({ ...emptyForm });
    setConditionKey('');
    setConditionValue('');
    loadUsers();
    setDialogOpen(true);
  };

  const handleOpenEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name || '',
      type: rule.type || 'ticket',
      conditions: rule.conditions || {},
      assign_to_role: rule.assign_to_role || '',
      assign_to_user_id: rule.assign_to_user_id || '',
      assign_strategy: rule.assign_strategy || 'round_robin',
      priority: rule.priority || 0,
      is_active: rule.is_active !== false,
    });
    setConditionKey('');
    setConditionValue('');
    loadUsers();
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingRule(null);
    setForm({ ...emptyForm });
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('A szabály neve kötelező');
      return;
    }
    if (!form.type) {
      toast.error('A típus megadása kötelező');
      return;
    }
    if (Object.keys(form.conditions).length === 0) {
      toast.error('Legalább egy feltétel megadása kötelező');
      return;
    }
    if (!form.assign_to_role && !form.assign_to_user_id) {
      toast.error('Célszerepkör vagy célfelhasználó megadása kötelező');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        type: form.type,
        conditions: form.conditions,
        assign_to_role: form.assign_to_role || null,
        assign_to_user_id: form.assign_to_user_id || null,
        assign_strategy: form.assign_strategy,
        priority: parseInt(form.priority) || 0,
        is_active: form.is_active,
      };

      if (editingRule) {
        await assignmentRulesAPI.update(editingRule.id, payload);
        toast.success('Szabály sikeresen frissítve');
      } else {
        await assignmentRulesAPI.create(payload);
        toast.success('Szabály sikeresen létrehozva');
      }
      handleClose();
      loadRules();
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
      await assignmentRulesAPI.delete(id);
      toast.success('Szabály sikeresen törölve');
      setDeleteConfirm(null);
      loadRules();
    } catch (error) {
      toast.error('Hiba a törléskor');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleActive = async (rule) => {
    try {
      await assignmentRulesAPI.update(rule.id, { is_active: !rule.is_active });
      toast.success(rule.is_active ? 'Szabály deaktiválva' : 'Szabály aktiválva');
      loadRules();
    } catch (error) {
      toast.error('Hiba a státusz módosításakor');
    }
  };

  // ── Condition builder ─────────────────────────────────────────────────────

  const handleAddCondition = () => {
    if (!conditionKey || !conditionValue.trim()) return;

    const newConditions = { ...form.conditions };
    // Support comma-separated values as arrays
    const values = conditionValue.includes(',')
      ? conditionValue.split(',').map(v => v.trim()).filter(Boolean)
      : conditionValue.trim();

    newConditions[conditionKey] = values;

    setForm(prev => ({ ...prev, conditions: newConditions }));
    setConditionKey('');
    setConditionValue('');
  };

  const handleRemoveCondition = (key) => {
    const newConditions = { ...form.conditions };
    delete newConditions[key];
    setForm(prev => ({ ...prev, conditions: newConditions }));
  };

  const conditionKeys = form.type === 'ticket' ? CONDITION_KEYS_TICKET : CONDITION_KEYS_TASK;

  // ── Paginated rules ───────────────────────────────────────────────────────
  const paginatedRules = rules.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <Box>
        {/* ── Header ── */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            mb: 3,
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAssignIcon sx={{ fontSize: 28, color: '#2563eb' }} />
            <Typography variant="h5" fontWeight={700}>
              Automatikus kiosztás
            </Typography>
            <Chip label={`${totalCount} szabály`} size="small" sx={{ ml: 1 }} />
          </Box>
          {canEdit && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              Új szabály
            </Button>
          )}
        </Box>

        {/* ── Info Box ── */}
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }} icon={<InfoIcon />}>
          Az automatikus kiosztási szabályok a hibajegyeket és feladatokat automatikusan a megfelelő felhasználókhoz rendelik a beállított feltételek és stratégiák alapján.
          A magasabb prioritású szabály elsőbbséget élvez.
        </Alert>

        {/* ── Filters ── */}
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ sm: 'center' }}
          >
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Típus</InputLabel>
              <Select
                value={filterType}
                label="Típus"
                onChange={(e) => {
                  setFilterType(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">Összes típus</MenuItem>
                {RULE_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Státusz</InputLabel>
              <Select
                value={filterActive}
                label="Státusz"
                onChange={(e) => {
                  setFilterActive(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">Összes</MenuItem>
                <MenuItem value="true">Aktív</MenuItem>
                <MenuItem value="false">Inaktív</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        {/* ── Table ── */}
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>
                  Feltételek
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>
                  Stratégia
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>
                  Célszerepkör
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                {canEdit && (
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Műveletek
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : paginatedRules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <AutoAssignIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                      Nincsenek kiosztási szabályok
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {filterType || filterActive
                        ? 'Próbálj más szűrési feltételt.'
                        : 'Hozz létre egy új szabályt a kezdéshez.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRules.map((rule) => {
                  const typeInfo = getTypeInfo(rule.type);
                  const strategyInfo = getStrategyInfo(rule.assign_strategy);
                  return (
                    <TableRow key={rule.id} hover sx={{ cursor: canEdit ? 'pointer' : 'default' }}>
                      <TableCell onClick={() => canEdit && handleOpenEdit(rule)}>
                        <Typography variant="body2" fontWeight={600}>
                          {rule.name}
                        </Typography>
                        {rule.assign_to_user_name && (
                          <Typography variant="caption" color="text.secondary">
                            <PersonIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                            {rule.assign_to_user_name}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell onClick={() => canEdit && handleOpenEdit(rule)}>
                        <Chip
                          label={typeInfo.label}
                          size="small"
                          sx={{
                            bgcolor: `${typeInfo.color}15`,
                            color: typeInfo.color,
                            fontWeight: 500,
                            border: `1px solid ${typeInfo.color}30`,
                          }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{ display: { xs: 'none', md: 'table-cell' }, maxWidth: 250 }}
                        onClick={() => canEdit && handleOpenEdit(rule)}
                      >
                        <Typography variant="body2" noWrap title={formatConditions(rule.conditions)}>
                          {formatConditions(rule.conditions)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }} onClick={() => canEdit && handleOpenEdit(rule)}>
                        <Chip
                          icon={strategyInfo.icon}
                          label={strategyInfo.label}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }} onClick={() => canEdit && handleOpenEdit(rule)}>
                        <Chip
                          icon={<GroupIcon sx={{ fontSize: 14 }} />}
                          label={rule.assign_to_role || '-'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell onClick={() => canEdit && handleOpenEdit(rule)}>
                        <Chip
                          label={rule.priority}
                          size="small"
                          color={rule.priority >= 100 ? 'error' : rule.priority >= 50 ? 'warning' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={rule.is_active ? <ActiveIcon /> : <InactiveIcon />}
                          label={rule.is_active ? 'Aktív' : 'Inaktív'}
                          size="small"
                          color={rule.is_active ? 'success' : 'default'}
                          variant={rule.is_active ? 'filled' : 'outlined'}
                          onClick={canEdit ? () => handleToggleActive(rule) : undefined}
                          sx={canEdit ? { cursor: 'pointer' } : {}}
                        />
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Tooltip title="Szerkesztés">
                            <IconButton size="small" onClick={() => handleOpenEdit(rule)} color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Törlés">
                            <IconButton size="small" onClick={() => setDeleteConfirm(rule)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={totalCount}
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

        {/* ── Delete Confirmation Dialog ── */}
        <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Szabály törlése</DialogTitle>
          <DialogContent>
            <Typography>
              Biztosan törölni szeretnéd a <strong>{deleteConfirm?.name}</strong> szabályt?
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

        {/* ── Create/Edit Dialog ── */}
        <Dialog
          open={dialogOpen}
          onClose={handleClose}
          fullWidth
          maxWidth="md"
          fullScreen={isMobile}
        >
          <DialogTitle
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoAssignIcon sx={{ color: '#2563eb' }} />
              <Typography variant="h6" fontWeight={600}>
                {editingRule ? 'Szabály szerkesztése' : 'Új kiosztási szabály'}
              </Typography>
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <Divider />

          <DialogContent sx={{ p: 3 }}>
            <Grid container spacing={3}>
              {/* Left column: Basic info */}
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                  Alapadatok
                </Typography>

                <Stack spacing={2}>
                  <TextField
                    label="Szabály neve"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    fullWidth
                    required
                    size="small"
                    placeholder="pl. Sürgős hibajegyek facility managernek"
                  />

                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <FormControl fullWidth size="small" required>
                        <InputLabel>Típus</InputLabel>
                        <Select
                          value={form.type}
                          label="Típus"
                          onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value, conditions: {} }))}
                        >
                          {RULE_TYPES.map((t) => (
                            <MenuItem key={t.value} value={t.value}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.color }} />
                                {t.label}
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Prioritás (szám)"
                        type="number"
                        value={form.priority}
                        onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value }))}
                        fullWidth
                        size="small"
                        helperText="Magasabb = fontosabb"
                        inputProps={{ min: 0 }}
                      />
                    </Grid>
                  </Grid>

                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.is_active}
                        onChange={(e) => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        color="success"
                      />
                    }
                    label="Aktív"
                  />

                  <Divider />

                  <Typography variant="subtitle2" fontWeight={600}>
                    Kiosztás célpontja
                  </Typography>

                  <FormControl fullWidth size="small">
                    <InputLabel>Célszerepkör</InputLabel>
                    <Select
                      value={form.assign_to_role}
                      label="Célszerepkör"
                      onChange={(e) => setForm(prev => ({ ...prev, assign_to_role: e.target.value }))}
                    >
                      <MenuItem value="">
                        <em>Nincs (felhasználó alapú)</em>
                      </MenuItem>
                      {COMMON_ROLES.map((r) => (
                        <MenuItem key={r.value} value={r.value}>
                          {r.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <InputLabel>Célfelhasználó (opcionális)</InputLabel>
                    <Select
                      value={form.assign_to_user_id}
                      label="Célfelhasználó (opcionális)"
                      onChange={(e) => setForm(prev => ({ ...prev, assign_to_user_id: e.target.value }))}
                    >
                      <MenuItem value="">
                        <em>Nincs (szerep alapú)</em>
                      </MenuItem>
                      {users.map((u) => (
                        <MenuItem key={u.id} value={u.id}>
                          {u.first_name} {u.last_name} ({u.email})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small" required>
                    <InputLabel>Kiosztási stratégia</InputLabel>
                    <Select
                      value={form.assign_strategy}
                      label="Kiosztási stratégia"
                      onChange={(e) => setForm(prev => ({ ...prev, assign_strategy: e.target.value }))}
                    >
                      {STRATEGIES.map((s) => (
                        <MenuItem key={s.value} value={s.value}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {s.icon}
                            <Box>
                              <Typography variant="body2">{s.label}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {s.description}
                              </Typography>
                            </Box>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Grid>

              {/* Right column: Conditions */}
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                  Feltételek (mikor alkalmazódjon)
                </Typography>

                <Paper
                  sx={{
                    p: 2,
                    bgcolor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                  }}
                >
                  {/* Current conditions */}
                  {Object.keys(form.conditions).length > 0 ? (
                    <Box sx={{ mb: 2 }}>
                      {Object.entries(form.conditions).map(([key, value]) => (
                        <Chip
                          key={key}
                          label={`${key}: ${Array.isArray(value) ? value.join(', ') : value}`}
                          onDelete={() => handleRemoveCondition(key)}
                          sx={{ mr: 0.5, mb: 0.5 }}
                          color="primary"
                          variant="outlined"
                          size="small"
                        />
                      ))}
                    </Box>
                  ) : (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Adj hozzá legalább egy feltételt
                    </Alert>
                  )}

                  <Divider sx={{ my: 1.5 }} />

                  <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                    Új feltétel hozzáadása
                  </Typography>

                  <Stack spacing={1.5}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Mező</InputLabel>
                      <Select
                        value={conditionKey}
                        label="Mező"
                        onChange={(e) => setConditionKey(e.target.value)}
                      >
                        {conditionKeys
                          .filter(ck => !form.conditions[ck.value])
                          .map((ck) => (
                            <MenuItem key={ck.value} value={ck.value}>
                              {ck.label}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>

                    <TextField
                      label="Érték"
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                      fullWidth
                      size="small"
                      placeholder="pl. urgent vagy urgent, high"
                      helperText="Több értéknél vesszővel válaszd el"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCondition()}
                    />

                    <Button
                      variant="outlined"
                      size="small"
                      onClick={handleAddCondition}
                      disabled={!conditionKey || !conditionValue.trim()}
                      startIcon={<AddIcon />}
                    >
                      Feltétel hozzáadása
                    </Button>
                  </Stack>

                  {/* Help text */}
                  <Box
                    sx={{
                      mt: 2,
                      p: 1.5,
                      bgcolor: '#fff',
                      borderRadius: 1,
                      border: '1px solid #e0e0e0',
                    }}
                  >
                    <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
                      Tipp
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {form.type === 'ticket'
                        ? 'Hibajegyeknél a priority_slug (pl. urgent, high, medium, low) és category_slug (pl. rezsi, technical) mezőket használd.'
                        : 'Feladatoknál a priority (pl. critical, high), status (pl. todo, in_progress) és skill_required (pl. backend, frontend) mezőket használd.'}
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
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
              {saving ? (
                <CircularProgress size={20} sx={{ color: 'white' }} />
              ) : editingRule ? (
                'Mentés'
              ) : (
                'Létrehozás'
              )}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}

export default AssignmentRules;
