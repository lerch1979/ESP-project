import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, Alert, Collapse, IconButton, Divider, Tooltip,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon, CheckCircle as CheckCircleIcon, Cancel as CancelIcon,
  KeyboardArrowDown, KeyboardArrowRight, MeetingRoom as RoomIcon, Lock as LockIcon,
  SwapHoriz as SwapHorizIcon,
} from '@mui/icons-material';
import { consolidationAPI } from '../services/api';
import { CONSOLIDATION_ROLES } from '../components/AccommodationDetailModal';
import { toast } from 'react-toastify';

const GOLD = '#8B6B33';
const SHIFT_LABEL = { day: 'Nappali', night: 'Éjszakai', rotating: 'Váltott', flexible: 'Rugalmas' };
const GENDER_LABEL = { male: 'Férfi', female: 'Nő', other: 'Egyéb' };

function RoleBadge({ role, locked }) {
  const r = CONSOLIDATION_ROLES[role] || CONSOLIDATION_ROLES.normal;
  return (
    <Box sx={{ display: 'inline-flex', gap: 0.5 }}>
      <Chip size="small" label={r.label} sx={{ bgcolor: r.color, color: '#fff', fontWeight: 600, height: 20 }} />
      {locked && <Chip size="small" icon={<LockIcon sx={{ fontSize: 14 }} />} label="Zárolt"
        sx={{ bgcolor: '#c62828', color: '#fff', height: 20, '& .MuiChip-icon': { color: '#fff' } }} />}
    </Box>
  );
}

export default function ConsolidationEngine() {
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [expanded, setExpanded] = useState({});   // plan_key -> bool
  const [busy, setBusy] = useState(false);

  const loadRun = async (runId) => {
    const res = await consolidationAPI.getRun(runId);
    setRun(res.data.run);
    setSuggestions(res.data.suggestions || []);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await consolidationAPI.listRuns();
        if (res.data?.length) await loadRun(res.data[0].id);
      } catch { /* first-time: no runs yet */ }
    })();
  }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await consolidationAPI.run();
      await loadRun(res.data.run_id);
      toast.success(`Kész: ${res.data.total_moves} költözés, ${res.data.freed_rooms} felszabaduló szoba.`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'A futtatás sikertelen.');
    } finally {
      setRunning(false);
    }
  };

  const handleApprovePlan = async (planKey, planLabel) => {
    if (!window.confirm(`Biztosan alkalmazod a(z) "${planLabel}" konszolidációs tervét? A költözések azonnal életbe lépnek.`)) return;
    setBusy(true);
    try {
      const res = await consolidationAPI.apply(run.id, planKey);
      toast.success(`${res.data.applied} költözés alkalmazva.`);
      await loadRun(run.id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Alkalmazási hiba.');
    } finally { setBusy(false); }
  };

  const handleReject = async (suggestionId) => {
    const reason = window.prompt('Elutasítás oka (opcionális):') ?? null;
    setBusy(true);
    try {
      await consolidationAPI.reject(suggestionId, reason);
      await loadRun(run.id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Elutasítási hiba.');
    } finally { setBusy(false); }
  };

  const byPlan = run?.summary?.by_plan || [];
  const suggestionsForPlan = (planKey) => suggestions.filter((s) => s.payload.plan_key === planKey);
  const statusChip = (st) => {
    const map = { pending: ['Függőben', 'warning'], applied: ['Alkalmazva', 'success'], rejected: ['Elutasítva', 'default'] };
    const [label, color] = map[st] || [st, 'default'];
    return <Chip label={label} size="small" color={color} />;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Szoba-konszolidáció</Typography>
          <Typography variant="body2" color="text.secondary">
            Javaslatok a szobák felszabadítására — a motor senkit sem költöztet, minden lépés emberi jóváhagyást igényel.
            A szerepek (mag / puffer / kivezetendő) és a zárolás a szálláshelyen állíthatók.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={running ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
          onClick={handleRun} disabled={running}
          sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#6f552a' } }}>
          Konszolidáció futtatása
        </Button>
      </Box>

      {!run && !running && (
        <Alert severity="info">Még nincs futtatás. Kattints a „Konszolidáció futtatása” gombra.</Alert>
      )}

      {run && (
        <>
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Summary label="Javasolt költözések" value={run.total_moves} />
            <Summary label="Felszabaduló szobák" value={run.freed_rooms} />
            <Summary label="Felszabaduló ágyak" value={run.freed_beds} />
            <Summary label="Tervek" value={byPlan.length} />
            <Box sx={{ ml: 'auto', alignSelf: 'center' }}>{statusChip(run.status === 'applied' ? 'applied' : 'pending')}</Box>
          </Paper>

          {byPlan.length === 0 && <Alert severity="success">Nincs konszolidálható szálláshely — minden optimális.</Alert>}

          {byPlan.map((plan) => {
            const sug = suggestionsForPlan(plan.plan_key);
            const pending = sug.filter((s) => s.status === 'pending').length;
            const open = !!expanded[plan.plan_key];
            const isCrossPlan = (plan.cross_moves || 0) > 0;
            const planLabel = (plan.accommodation_names || []).join(isCrossPlan ? ' ⇄ ' : ', ');
            return (
              <Paper key={plan.plan_key} sx={{ mb: 1.5, ...(isCrossPlan ? { border: '1px solid #8B6B33' } : {}) }}>
                <Box sx={{ display: 'flex', alignItems: 'center', p: 1.5, gap: 1 }}>
                  <IconButton size="small" onClick={() => setExpanded((e) => ({ ...e, [plan.plan_key]: !open }))}>
                    {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
                  </IconButton>
                  {isCrossPlan ? <SwapHorizIcon sx={{ color: GOLD }} /> : <RoomIcon sx={{ color: GOLD }} />}
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 700 }}>{planLabel}</Typography>
                      {isCrossPlan && <Chip size="small" label={`${plan.cross_moves} szálláshelyközi`} icon={<SwapHorizIcon sx={{ fontSize: 15 }} />}
                        sx={{ bgcolor: '#8B6B33', color: '#fff', height: 20, '& .MuiChip-icon': { color: '#fff' } }} />}
                      {(plan.accommodations || []).map((a) => <RoleBadge key={a.id} role={a.role} locked={a.locked} />)}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {plan.moves} költözés · felszabadít {plan.freed_rooms} szobát / {plan.freed_beds} ágyat ·
                      kihasználtság {(plan.utilization_before * 100).toFixed(0)}% · prioritás {plan.score}
                    </Typography>
                  </Box>
                  <Button size="small" variant="contained" startIcon={<CheckCircleIcon />}
                    disabled={busy || pending === 0}
                    onClick={() => handleApprovePlan(plan.plan_key, planLabel)}
                    sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#6f552a' } }}>
                    {pending === 0 ? 'Alkalmazva' : `Terv jóváhagyása (${pending})`}
                  </Button>
                </Box>
                <Collapse in={open}>
                  <Divider />
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f8fafc' }}>
                          <TableCell sx={{ fontWeight: 700 }}>Munkavállaló</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Nem / Műszak</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Honnan</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Hova</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Típus</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Állapot</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Művelet</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sug.map((s) => {
                          const p = s.payload;
                          return (
                            <TableRow key={s.id} hover sx={p.is_cross ? { bgcolor: '#fbf6ec' } : {}}>
                              <TableCell>{s.employee_name}</TableCell>
                              <TableCell>{GENDER_LABEL[s.gender] || s.gender} · {SHIFT_LABEL[s.shift] || s.shift || '—'}</TableCell>
                              <TableCell>
                                {p.is_cross && <Typography variant="caption" color="text.secondary" display="block">{p.from_accommodation_name}</Typography>}
                                {p.from_room_number || '—'}
                              </TableCell>
                              <TableCell>
                                {p.is_cross && <Typography variant="caption" sx={{ color: GOLD, fontWeight: 600 }} display="block">{p.to_accommodation_name}</Typography>}
                                <strong>{p.to_room_number}</strong>
                              </TableCell>
                              <TableCell>
                                {p.is_cross
                                  ? <Tooltip title="Másik szálláshelyre költözés"><Chip size="small" icon={<SwapHorizIcon sx={{ fontSize: 14 }} />} label="Szálláshelyközi" sx={{ bgcolor: '#8B6B33', color: '#fff', '& .MuiChip-icon': { color: '#fff' } }} /></Tooltip>
                                  : <Chip size="small" label="Helyi" variant="outlined" />}
                              </TableCell>
                              <TableCell>{statusChip(s.status)}</TableCell>
                              <TableCell align="right">
                                {s.status === 'pending' && (
                                  <IconButton size="small" color="error" disabled={busy}
                                    onClick={() => handleReject(s.id)} title="Elutasítás">
                                    <CancelIcon fontSize="small" />
                                  </IconButton>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Collapse>
              </Paper>
            );
          })}
        </>
      )}
    </Box>
  );
}

function Summary({ label, value }) {
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 800, color: '#111' }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
