import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Grid,
  Tooltip,
  CircularProgress,
  InputAdornment,
  Stack,
  Divider,
  Card,
  CardContent,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Close as CloseIcon,
  Star as SkillIcon,
  Person as PersonIcon,
  FilterList as FilterIcon,
  Upgrade as UpgradeIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { userWorkloadAPI, usersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILL_PRESETS = [
  { value: 'backend', label: 'Backend', category: 'IT' },
  { value: 'frontend', label: 'Frontend', category: 'IT' },
  { value: 'fullstack', label: 'Fullstack', category: 'IT' },
  { value: 'devops', label: 'DevOps', category: 'IT' },
  { value: 'database', label: 'Adatbázis', category: 'IT' },
  { value: 'electrical', label: 'Elektromos', category: 'Karbantartás' },
  { value: 'plumbing', label: 'Vízvezeték', category: 'Karbantartás' },
  { value: 'hvac', label: 'HVAC / Klíma', category: 'Karbantartás' },
  { value: 'carpentry', label: 'Asztalos', category: 'Karbantartás' },
  { value: 'painting', label: 'Festés', category: 'Karbantartás' },
  { value: 'cleaning', label: 'Takarítás', category: 'Üzemeltetés' },
  { value: 'security', label: 'Biztonság', category: 'Üzemeltetés' },
  { value: 'management', label: 'Menedzsment', category: 'Egyéb' },
  { value: 'hr', label: 'HR', category: 'Egyéb' },
  { value: 'finance', label: 'Pénzügy', category: 'Egyéb' },
  { value: 'legal', label: 'Jogi', category: 'Egyéb' },
  { value: 'design', label: 'Design', category: 'Egyéb' },
  { value: 'project_management', label: 'Projektvezetés', category: 'Egyéb' },
];

const PROFICIENCY_LEVELS = [
  { value: 1, label: 'Kezdő', color: '#94a3b8' },
  { value: 2, label: 'Alapszintű', color: '#60a5fa' },
  { value: 3, label: 'Középszintű', color: '#34d399' },
  { value: 4, label: 'Haladó', color: '#f59e0b' },
  { value: 5, label: 'Szakértő', color: '#ef4444' },
];

const SKILL_CATEGORIES = [...new Set(SKILL_PRESETS.map(s => s.category))];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProficiencyInfo(level) {
  return PROFICIENCY_LEVELS.find(p => p.value === level) || PROFICIENCY_LEVELS[0];
}

function getSkillPreset(skillValue) {
  return SKILL_PRESETS.find(s => s.value === skillValue);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

function UserSkills() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('settings.edit') || hasPermission('users.edit');

  // List state
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [filterSkill, setFilterSkill] = useState('');
  const [filterProficiency, setFilterProficiency] = useState('');

  // Add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addForm, setAddForm] = useState({ user_id: '', skill: '', customSkill: '', proficiency: 3 });

  // Users lookup
  const [users, setUsers] = useState([]);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadSkills = useCallback(async () => {
    try {
      setLoading(true);
      const res = await userWorkloadAPI.getSkills();
      setSkills(res.data?.skills || []);
    } catch (error) {
      toast.error('Hiba a képességek betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = async () => {
    try {
      const res = await usersAPI.getAll({ limit: 200 });
      setUsers(res.data?.users || res.data?.items || []);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // ── Filtered & paginated data ─────────────────────────────────────────────

  const filteredSkills = useMemo(() => {
    let result = [...skills];

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(sk =>
        (sk.user_name || '').toLowerCase().includes(s) ||
        (sk.email || '').toLowerCase().includes(s) ||
        (sk.skill || '').toLowerCase().includes(s)
      );
    }

    if (filterSkill) {
      result = result.filter(sk => sk.skill === filterSkill);
    }

    if (filterProficiency) {
      result = result.filter(sk => sk.proficiency === parseInt(filterProficiency));
    }

    return result;
  }, [skills, search, filterSkill, filterProficiency]);

  const paginatedSkills = filteredSkills.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // ── Grouped stats ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const uniqueUsers = new Set(skills.map(s => s.user_id)).size;
    const uniqueSkills = new Set(skills.map(s => s.skill)).size;
    const avgProficiency = skills.length > 0
      ? (skills.reduce((sum, s) => sum + (s.proficiency || 0), 0) / skills.length).toFixed(1)
      : 0;
    const experts = skills.filter(s => s.proficiency === 5).length;
    return { uniqueUsers, uniqueSkills, avgProficiency, experts };
  }, [skills]);

  // Unique skill names for filter dropdown
  const uniqueSkillNames = useMemo(() => {
    return [...new Set(skills.map(s => s.skill))].sort();
  }, [skills]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setAddForm({ user_id: '', skill: '', customSkill: '', proficiency: 3 });
    loadUsers();
    setAddOpen(true);
  };

  const handleAdd = async () => {
    const skillValue = addForm.skill === '__custom__' ? addForm.customSkill.trim().toLowerCase() : addForm.skill;

    if (!addForm.user_id) {
      toast.error('Felhasználó kiválasztása kötelező');
      return;
    }
    if (!skillValue) {
      toast.error('Képesség megadása kötelező');
      return;
    }

    try {
      setAddSaving(true);
      await userWorkloadAPI.addSkill({
        user_id: addForm.user_id,
        skill: skillValue,
        proficiency: addForm.proficiency,
      });
      toast.success('Képesség sikeresen hozzáadva');
      setAddOpen(false);
      loadSkills();
    } catch (error) {
      const msg = error.response?.data?.message || 'Hiba a képesség hozzáadásakor';
      toast.error(msg);
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      setDeleteLoading(true);
      await userWorkloadAPI.removeSkill(id);
      toast.success('Képesség törölve');
      setDeleteConfirm(null);
      loadSkills();
    } catch (error) {
      toast.error('Hiba a képesség törlésekor');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleUpdateProficiency = async (skill) => {
    const newLevel = skill.proficiency >= 5 ? 1 : skill.proficiency + 1;
    try {
      await userWorkloadAPI.addSkill({
        user_id: skill.user_id,
        skill: skill.skill,
        proficiency: newLevel,
      });
      toast.success(`Jártasság frissítve: ${getProficiencyInfo(newLevel).label}`);
      loadSkills();
    } catch (error) {
      toast.error('Hiba a jártasság frissítésekor');
    }
  };

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
            <SkillIcon sx={{ fontSize: 28, color: '#8b5cf6' }} />
            <Typography variant="h5" fontWeight={700}>
              Képességek kezelése
            </Typography>
            <Chip label={`${filteredSkills.length} bejegyzés`} size="small" sx={{ ml: 1 }} />
          </Box>
          {canEdit && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenAdd}
              sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' } }}
            >
              Képesség hozzáadása
            </Button>
          )}
        </Box>

        {/* ── Stats Cards ── */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <PersonIcon sx={{ color: '#2563eb', fontSize: 20 }} />
                  <Typography variant="caption" color="text.secondary">Felhasználók</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                  {stats.uniqueUsers}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <SkillIcon sx={{ color: '#8b5cf6', fontSize: 20 }} />
                  <Typography variant="caption" color="text.secondary">Egyedi képességek</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                  {stats.uniqueSkills}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <UpgradeIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                  <Typography variant="caption" color="text.secondary">Átlag jártasság</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                  {stats.avgProficiency}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <SkillIcon sx={{ color: '#ef4444', fontSize: 20 }} />
                  <Typography variant="caption" color="text.secondary">Szakértők</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#ef4444' }}>
                  {stats.experts}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ── Filters ── */}
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ sm: 'center' }}
          >
            <TextField
              placeholder="Keresés név, email vagy képesség alapján..."
              size="small"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              sx={{ minWidth: 280 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Képesség</InputLabel>
              <Select
                value={filterSkill}
                label="Képesség"
                onChange={(e) => { setFilterSkill(e.target.value); setPage(0); }}
              >
                <MenuItem value="">Összes képesség</MenuItem>
                {uniqueSkillNames.map((s) => {
                  const preset = getSkillPreset(s);
                  return (
                    <MenuItem key={s} value={s}>
                      {preset ? preset.label : s}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Jártasság</InputLabel>
              <Select
                value={filterProficiency}
                label="Jártasság"
                onChange={(e) => { setFilterProficiency(e.target.value); setPage(0); }}
              >
                <MenuItem value="">Összes szint</MenuItem>
                {PROFICIENCY_LEVELS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.color }} />
                      {p.value} - {p.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {(search || filterSkill || filterProficiency) && (
              <Button
                size="small"
                onClick={() => { setSearch(''); setFilterSkill(''); setFilterProficiency(''); setPage(0); }}
              >
                Szűrők törlése
              </Button>
            )}
          </Stack>
        </Paper>

        {/* ── Table ── */}
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 600 }}>Felhasználó</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Képesség</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Jártasság</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>
                  Szint
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>
                  Hozzáadva
                </TableCell>
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
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : paginatedSkills.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <SkillIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                      Nincsenek képességek
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {search || filterSkill || filterProficiency
                        ? 'Próbálj más szűrési feltételt.'
                        : 'Adj hozzá képességeket a felhasználókhoz.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedSkills.map((sk) => {
                  const prof = getProficiencyInfo(sk.proficiency);
                  const preset = getSkillPreset(sk.skill);
                  return (
                    <TableRow key={sk.id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {sk.user_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {sk.email}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={preset ? preset.label : sk.skill}
                          size="small"
                          sx={{
                            bgcolor: '#f5f3ff',
                            color: '#7c3aed',
                            fontWeight: 500,
                            border: '1px solid #c4b5fd',
                          }}
                        />
                        {preset && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                            {preset.category}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {[1, 2, 3, 4, 5].map(level => (
                            <Box
                              key={level}
                              sx={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                bgcolor: level <= sk.proficiency ? prof.color : '#e2e8f0',
                                cursor: canEdit ? 'pointer' : 'default',
                                transition: 'transform 0.15s',
                                '&:hover': canEdit ? { transform: 'scale(1.3)' } : {},
                              }}
                              onClick={canEdit ? async () => {
                                try {
                                  await userWorkloadAPI.addSkill({
                                    user_id: sk.user_id,
                                    skill: sk.skill,
                                    proficiency: level,
                                  });
                                  loadSkills();
                                } catch { toast.error('Hiba'); }
                              } : undefined}
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        <Chip
                          label={prof.label}
                          size="small"
                          sx={{
                            bgcolor: `${prof.color}15`,
                            color: prof.color,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            border: `1px solid ${prof.color}30`,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(sk.created_at)}
                        </Typography>
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Tooltip title="Törlés">
                            <IconButton size="small" onClick={() => setDeleteConfirm(sk)} color="error">
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
            count={filteredSkills.length}
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
          <DialogTitle>Képesség törlése</DialogTitle>
          <DialogContent>
            <Typography>
              Biztosan törölni szeretnéd a(z) <strong>{deleteConfirm?.skill}</strong> képességet{' '}
              <strong>{deleteConfirm?.user_name}</strong> felhasználótól?
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

        {/* ── Add Skill Dialog ── */}
        <Dialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          fullWidth
          maxWidth="sm"
          fullScreen={isMobile}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SkillIcon sx={{ color: '#8b5cf6' }} />
              <Typography variant="h6" fontWeight={600}>
                Képesség hozzáadása
              </Typography>
            </Box>
            <IconButton onClick={() => setAddOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <Divider />

          <DialogContent sx={{ p: 3 }}>
            <Stack spacing={2.5}>
              {/* User selection */}
              <FormControl fullWidth size="small" required>
                <InputLabel>Felhasználó</InputLabel>
                <Select
                  value={addForm.user_id}
                  label="Felhasználó"
                  onChange={(e) => setAddForm(prev => ({ ...prev, user_id: e.target.value }))}
                >
                  {users.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                        {u.first_name} {u.last_name}
                        <Typography variant="caption" color="text.secondary">
                          ({u.email})
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Skill selection by category */}
              <FormControl fullWidth size="small" required>
                <InputLabel>Képesség</InputLabel>
                <Select
                  value={addForm.skill}
                  label="Képesség"
                  onChange={(e) => setAddForm(prev => ({ ...prev, skill: e.target.value }))}
                >
                  {SKILL_CATEGORIES.map(cat => [
                    <MenuItem key={`cat-${cat}`} disabled sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', bgcolor: '#f8fafc' }}>
                      {cat}
                    </MenuItem>,
                    ...SKILL_PRESETS
                      .filter(s => s.category === cat)
                      .map(s => (
                        <MenuItem key={s.value} value={s.value} sx={{ pl: 4 }}>
                          {s.label}
                        </MenuItem>
                      ))
                  ]).flat()}
                  <Divider />
                  <MenuItem value="__custom__" sx={{ fontStyle: 'italic' }}>
                    Egyéni képesség...
                  </MenuItem>
                </Select>
              </FormControl>

              {/* Custom skill input */}
              {addForm.skill === '__custom__' && (
                <TextField
                  label="Egyéni képesség neve"
                  value={addForm.customSkill}
                  onChange={(e) => setAddForm(prev => ({ ...prev, customSkill: e.target.value }))}
                  fullWidth
                  size="small"
                  required
                  placeholder="pl. project_management"
                  helperText="Kisbetűk, szóköz nélkül"
                />
              )}

              {/* Proficiency selection */}
              <Box>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                  Jártassági szint
                </Typography>
                <Grid container spacing={1}>
                  {PROFICIENCY_LEVELS.map((p) => (
                    <Grid item xs={12} sm={6} md={4} key={p.value}>
                      <Paper
                        onClick={() => setAddForm(prev => ({ ...prev, proficiency: p.value }))}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          borderRadius: 2,
                          border: addForm.proficiency === p.value
                            ? `2px solid ${p.color}`
                            : '2px solid #e2e8f0',
                          bgcolor: addForm.proficiency === p.value ? `${p.color}08` : 'transparent',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: p.color },
                        }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1}>
                          <Box sx={{ display: 'flex', gap: 0.3 }}>
                            {[1, 2, 3, 4, 5].map(d => (
                              <Box
                                key={d}
                                sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  bgcolor: d <= p.value ? p.color : '#e2e8f0',
                                }}
                              />
                            ))}
                          </Box>
                          <Typography variant="body2" fontWeight={addForm.proficiency === p.value ? 700 : 400}>
                            {p.label}
                          </Typography>
                        </Stack>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Info about upsert */}
              <Paper sx={{ p: 1.5, bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 2 }}>
                <Typography variant="caption" color="#1e40af">
                  Ha a felhasználó már rendelkezik ezzel a képességgel, a jártassági szint frissítésre kerül.
                </Typography>
              </Paper>
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setAddOpen(false)} disabled={addSaving}>
              Mégse
            </Button>
            <Button
              onClick={handleAdd}
              variant="contained"
              disabled={addSaving || !addForm.user_id || (!addForm.skill || (addForm.skill === '__custom__' && !addForm.customSkill.trim()))}
              sx={{ bgcolor: '#8b5cf6', '&:hover': { bgcolor: '#7c3aed' } }}
            >
              {addSaving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Hozzáadás'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}

export default UserSkills;
