import React, { useState, useEffect, useCallback } from 'react';
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
  Stack,
  Divider,
  LinearProgress,
  Card,
  CardContent,
  Alert,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  WorkOutline as WorkloadIcon,
  ConfirmationNumber as TicketIcon,
  Assignment as TaskIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Star as SkillIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccessTime as TimeIcon,
  Info as InfoIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { userWorkloadAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILL_OPTIONS = [
  'backend', 'frontend', 'fullstack', 'devops',
  'electrical', 'plumbing', 'hvac', 'carpentry',
  'painting', 'cleaning', 'security', 'management',
  'hr', 'finance', 'legal', 'design',
];

const PROFICIENCY_LEVELS = [
  { value: 1, label: 'Kezdő', color: '#94a3b8' },
  { value: 2, label: 'Alapszintű', color: '#60a5fa' },
  { value: 3, label: 'Középszintű', color: '#34d399' },
  { value: 4, label: 'Haladó', color: '#f59e0b' },
  { value: 5, label: 'Szakértő', color: '#ef4444' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWorkloadLevel(total) {
  if (total === 0) return { label: 'Szabad', color: '#16a34a', severity: 0 };
  if (total <= 3) return { label: 'Alacsony', color: '#22c55e', severity: 25 };
  if (total <= 6) return { label: 'Közepes', color: '#f59e0b', severity: 50 };
  if (total <= 10) return { label: 'Magas', color: '#f97316', severity: 75 };
  return { label: 'Túlterhelt', color: '#ef4444', severity: 100 };
}

function getProficiencyInfo(level) {
  return PROFICIENCY_LEVELS.find(p => p.value === level) || PROFICIENCY_LEVELS[0];
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

function UserWorkload() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('settings.edit') || hasPermission('users.edit');

  // List state
  const [workloads, setWorkloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Skill dialog
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [skillUserId, setSkillUserId] = useState(null);
  const [skillUserName, setSkillUserName] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [newProficiency, setNewProficiency] = useState(3);
  const [skillSaving, setSkillSaving] = useState(false);

  // Stats
  const [stats, setStats] = useState({ totalUsers: 0, avgLoad: 0, overloaded: 0, free: 0 });

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadWorkloads = useCallback(async () => {
    try {
      setLoading(true);
      const res = await userWorkloadAPI.getAll();
      const data = res.data?.workloads || [];
      setWorkloads(data);

      // Calculate stats
      const totalUsers = data.length;
      const totalLoad = data.reduce((sum, w) => sum + (w.total_pending_items || 0), 0);
      const avgLoad = totalUsers > 0 ? (totalLoad / totalUsers).toFixed(1) : 0;
      const overloaded = data.filter(w => (w.total_pending_items || 0) > 10).length;
      const free = data.filter(w => (w.total_pending_items || 0) === 0).length;
      setStats({ totalUsers, avgLoad, overloaded, free });
    } catch (error) {
      toast.error('Hiba a munkaterhelés betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkloads();
  }, [loadWorkloads]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await userWorkloadAPI.recalculate();
      toast.success('Munkaterhelés sikeresen újraszámítva');
      loadWorkloads();
    } catch (error) {
      toast.error('Hiba az újraszámításkor');
    } finally {
      setRecalculating(false);
    }
  };

  const handleOpenDetail = async (workload) => {
    setDetailUser(workload);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await userWorkloadAPI.getByUserId(workload.user_id);
      setDetailData(res.data);
    } catch (error) {
      toast.error('Hiba a részletek betöltésekor');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenSkillDialog = (userId, userName) => {
    setSkillUserId(userId);
    setSkillUserName(userName);
    setNewSkill('');
    setNewProficiency(3);
    setSkillDialogOpen(true);
  };

  const handleAddSkill = async () => {
    if (!newSkill.trim()) {
      toast.error('Képesség megadása kötelező');
      return;
    }
    try {
      setSkillSaving(true);
      await userWorkloadAPI.addSkill({
        user_id: skillUserId,
        skill: newSkill.trim(),
        proficiency: newProficiency,
      });
      toast.success('Képesség hozzáadva');
      setNewSkill('');
      setNewProficiency(3);
      loadWorkloads();
      // Refresh detail if open
      if (detailUser && detailUser.user_id === skillUserId) {
        const res = await userWorkloadAPI.getByUserId(skillUserId);
        setDetailData(res.data);
      }
    } catch (error) {
      const msg = error.response?.data?.message || 'Hiba a képesség hozzáadásakor';
      toast.error(msg);
    } finally {
      setSkillSaving(false);
    }
  };

  const handleRemoveSkill = async (skillId) => {
    try {
      await userWorkloadAPI.removeSkill(skillId);
      toast.success('Képesség törölve');
      loadWorkloads();
      if (detailUser) {
        const res = await userWorkloadAPI.getByUserId(detailUser.user_id);
        setDetailData(res.data);
      }
    } catch (error) {
      toast.error('Hiba a képesség törlésekor');
    }
  };

  // ── Sort by workload descending ───────────────────────────────────────────
  const sortedWorkloads = [...workloads].sort((a, b) => (b.total_pending_items || 0) - (a.total_pending_items || 0));

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
            <SpeedIcon sx={{ fontSize: 28, color: '#2563eb' }} />
            <Typography variant="h5" fontWeight={700}>
              Munkaterhelés
            </Typography>
            <Chip label={`${stats.totalUsers} felhasználó`} size="small" sx={{ ml: 1 }} />
          </Box>
          {canEdit && (
            <Button
              variant="outlined"
              startIcon={recalculating ? <CircularProgress size={16} /> : <RefreshIcon />}
              onClick={handleRecalculate}
              disabled={recalculating}
            >
              Újraszámítás
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
                  {stats.totalUsers}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TrendingUpIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                  <Typography variant="caption" color="text.secondary">Átlag terhelés</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5 }}>
                  {stats.avgLoad}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TrendingDownIcon sx={{ color: '#16a34a', fontSize: 20 }} />
                  <Typography variant="caption" color="text.secondary">Szabad</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#16a34a' }}>
                  {stats.free}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={6} md={3}>
            <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <WorkloadIcon sx={{ color: '#ef4444', fontSize: 20 }} />
                  <Typography variant="caption" color="text.secondary">Túlterhelt</Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#ef4444' }}>
                  {stats.overloaded}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ── Table ── */}
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 600 }}>Felhasználó</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Hibajegyek</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Feladatok</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Összesen</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>
                  Terhelés
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>
                  Képességek
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>
                  Utolsó kiosztás
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Műveletek
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : sortedWorkloads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <SpeedIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                      Nincsenek munkaterhelési adatok
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Futtasd az újraszámítást az adatok inicializálásához.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sortedWorkloads.map((w) => {
                  const level = getWorkloadLevel(w.total_pending_items);
                  return (
                    <TableRow key={w.user_id} hover sx={{ cursor: 'pointer' }} onClick={() => handleOpenDetail(w)}>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {w.user_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {w.email}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          icon={<TicketIcon sx={{ fontSize: 14 }} />}
                          label={w.active_tickets || 0}
                          size="small"
                          variant="outlined"
                          color={w.active_tickets > 5 ? 'warning' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          icon={<TaskIcon sx={{ fontSize: 14 }} />}
                          label={w.active_tasks || 0}
                          size="small"
                          variant="outlined"
                          color={w.active_tasks > 5 ? 'warning' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={w.total_pending_items || 0}
                          size="small"
                          sx={{
                            bgcolor: `${level.color}15`,
                            color: level.color,
                            fontWeight: 700,
                            border: `1px solid ${level.color}30`,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, minWidth: 160 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(level.severity, 100)}
                            sx={{
                              flex: 1,
                              height: 8,
                              borderRadius: 4,
                              bgcolor: '#f1f5f9',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: level.color,
                                borderRadius: 4,
                              },
                            }}
                          />
                          <Typography variant="caption" sx={{ color: level.color, fontWeight: 600, minWidth: 60 }}>
                            {level.label}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {(w.skills || []).slice(0, 3).map((skill, idx) => (
                            <Chip
                              key={idx}
                              label={skill}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', height: 22 }}
                            />
                          ))}
                          {(w.skills || []).length > 3 && (
                            <Chip
                              label={`+${w.skills.length - 3}`}
                              size="small"
                              sx={{ fontSize: '0.7rem', height: 22 }}
                            />
                          )}
                          {(!w.skills || w.skills.length === 0) && (
                            <Typography variant="caption" color="text.secondary">-</Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(w.last_assignment_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Részletek">
                          <IconButton size="small" onClick={() => handleOpenDetail(w)} color="primary">
                            <InfoIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canEdit && (
                          <Tooltip title="Képesség kezelés">
                            <IconButton size="small" onClick={() => handleOpenSkillDialog(w.user_id, w.user_name)} sx={{ color: '#8b5cf6' }}>
                              <SkillIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* ── Detail Dialog ── */}
        <Dialog
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          fullWidth
          maxWidth="md"
          fullScreen={isMobile}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon sx={{ color: '#2563eb' }} />
              <Typography variant="h6" fontWeight={600}>
                {detailUser?.user_name || 'Felhasználó'} - Munkaterhelés
              </Typography>
            </Box>
            <IconButton onClick={() => setDetailOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <Divider />

          <DialogContent sx={{ p: 3 }}>
            {detailLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress />
              </Box>
            ) : detailData ? (
              <Grid container spacing={3}>
                {/* Workload Summary */}
                <Grid item xs={12}>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, bgcolor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <TicketIcon sx={{ color: '#3b82f6', fontSize: 28 }} />
                        <Typography variant="h5" fontWeight={700}>{detailData.workload?.active_tickets || 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Aktív hibajegyek</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, bgcolor: '#f5f3ff', border: '1px solid #c4b5fd' }}>
                        <TaskIcon sx={{ color: '#8b5cf6', fontSize: 28 }} />
                        <Typography variant="h5" fontWeight={700}>{detailData.workload?.active_tasks || 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Aktív feladatok</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2, bgcolor: '#fefce8', border: '1px solid #fde047' }}>
                        <WorkloadIcon sx={{ color: '#eab308', fontSize: 28 }} />
                        <Typography variant="h5" fontWeight={700}>{detailData.workload?.total_pending_items || 0}</Typography>
                        <Typography variant="caption" color="text.secondary">Összesen</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Grid>

                {/* Skills */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <SkillIcon sx={{ fontSize: 18 }} /> Képességek
                  </Typography>
                  <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    {(detailData.skills || []).length > 0 ? (
                      <Stack spacing={1}>
                        {detailData.skills.map((skill) => {
                          const prof = getProficiencyInfo(skill.proficiency);
                          return (
                            <Box key={skill.id || skill.skill} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" fontWeight={500}>{skill.skill}</Typography>
                                <Chip
                                  label={prof.label}
                                  size="small"
                                  sx={{ bgcolor: `${prof.color}15`, color: prof.color, fontWeight: 600, fontSize: '0.7rem' }}
                                />
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {[1, 2, 3, 4, 5].map(s => (
                                  <Box
                                    key={s}
                                    sx={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: '50%',
                                      bgcolor: s <= skill.proficiency ? prof.color : '#e2e8f0',
                                    }}
                                  />
                                ))}
                                {canEdit && (
                                  <IconButton size="small" onClick={() => handleRemoveSkill(skill.id)} sx={{ ml: 0.5 }}>
                                    <DeleteIcon sx={{ fontSize: 14 }} color="error" />
                                  </IconButton>
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Nincsenek rögzített képességek
                      </Typography>
                    )}
                    {canEdit && (
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenSkillDialog(detailUser?.user_id, detailUser?.user_name)}
                        sx={{ mt: 1.5 }}
                      >
                        Képesség hozzáadása
                      </Button>
                    )}
                  </Paper>
                </Grid>

                {/* Last assignment info */}
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TimeIcon sx={{ fontSize: 18 }} /> Utolsó kiosztás
                  </Typography>
                  <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(detailData.workload?.last_assignment_at) || 'Még nem volt kiosztás'}
                    </Typography>
                  </Paper>

                  {/* Recent Tickets */}
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TicketIcon sx={{ fontSize: 18 }} /> Aktív hibajegyek
                  </Typography>
                  <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    {(detailData.recent_tickets || []).length > 0 ? (
                      <Stack spacing={1}>
                        {detailData.recent_tickets.map((t) => (
                          <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                              <Typography variant="body2" fontWeight={500}>{t.ticket_number}</Typography>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                                {t.title}
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {formatDate(t.created_at)}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">Nincs aktív hibajegy</Typography>
                    )}
                  </Paper>

                  {/* Recent Tasks */}
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 2, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TaskIcon sx={{ fontSize: 18 }} /> Aktív feladatok
                  </Typography>
                  <Paper sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    {(detailData.recent_tasks || []).length > 0 ? (
                      <Stack spacing={1}>
                        {detailData.recent_tasks.map((t) => (
                          <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                              <Typography variant="body2" fontWeight={500}>{t.title}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {t.project_name || 'Nincs projekt'}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.5}>
                              <Chip label={t.status} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                              <Chip label={t.priority} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">Nincs aktív feladat</Typography>
                    )}
                  </Paper>
                </Grid>
              </Grid>
            ) : (
              <Alert severity="warning">Nem sikerült betölteni a részleteket</Alert>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setDetailOpen(false)}>Bezárás</Button>
          </DialogActions>
        </Dialog>

        {/* ── Skill Add Dialog ── */}
        <Dialog open={skillDialogOpen} onClose={() => setSkillDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>
            Képesség hozzáadása - {skillUserName}
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Képesség</InputLabel>
                <Select
                  value={newSkill}
                  label="Képesség"
                  onChange={(e) => setNewSkill(e.target.value)}
                >
                  {SKILL_OPTIONS.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Vagy egyéni képesség"
                value={SKILL_OPTIONS.includes(newSkill) ? '' : newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                fullWidth
                size="small"
                placeholder="pl. project_management"
                helperText="Ha a listában nem találod, írd be kézzel"
              />

              <FormControl fullWidth size="small">
                <InputLabel>Jártasság</InputLabel>
                <Select
                  value={newProficiency}
                  label="Jártasság"
                  onChange={(e) => setNewProficiency(e.target.value)}
                >
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
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setSkillDialogOpen(false)} disabled={skillSaving}>
              Mégse
            </Button>
            <Button
              onClick={handleAddSkill}
              variant="contained"
              disabled={skillSaving || !newSkill.trim()}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              {skillSaving ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Hozzáadás'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}

export default UserWorkload;
