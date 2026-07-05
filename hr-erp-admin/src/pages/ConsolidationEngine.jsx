import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, Alert, Collapse, IconButton, Divider, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
  TextField, Checkbox, Stack,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon, CheckCircle as CheckCircleIcon, Cancel as CancelIcon,
  KeyboardArrowDown, KeyboardArrowRight, MeetingRoom as RoomIcon, Lock as LockIcon,
  SwapHoriz as SwapHorizIcon, Assignment as AssignmentIcon, DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import { consolidationAPI, usersAPI } from '../services/api';
import { CONSOLIDATION_ROLES } from '../components/AccommodationDetailModal';
import { toast } from 'react-toastify';

const GOLD = '#8B6B33';
const SHIFT_LABEL = { day: 'Nappali', night: 'Éjszakai', rotating: 'Váltott', flexible: 'Rugalmas' };
const GENDER_LABEL = { male: 'Férfi', female: 'Nő', other: 'Egyéb' };

// Plan lifecycle chip.
const PLAN_STATUS = {
  approved_pending_move: { label: 'Jóváhagyva — költöztetés folyamatban', color: '#0288d1' },
  moved: { label: 'Beköltöztetve', color: '#2e7d32' },
  partially_moved: { label: 'Részben beköltöztetve', color: '#ed6c02' },
  cancelled: { label: 'Visszavonva', color: '#9e9e9e' },
};
const SUG_STATUS = {
  pending: ['Javasolt', 'default'], approved: ['Jóváhagyva', 'info'], applied: ['Beköltöztetve', 'success'],
  skipped: ['Kihagyva', 'warning'], cancelled: ['Visszavonva', 'default'], rejected: ['Elutasítva', 'default'],
};

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
  const [plans, setPlans] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState([]);

  // dialogs
  const [approveDlg, setApproveDlg] = useState(null); // { plan, planLabel } | null
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [confirmDlg, setConfirmDlg] = useState(null); // { plan, planLabel, moves } | null
  const [decisions, setDecisions] = useState({});     // suggestionId -> { done, reason }
  const [conflicts, setConflicts] = useState([]);

  const loadRun = async (runId) => {
    const res = await consolidationAPI.getRun(runId);
    setRun(res.data.run);
    setSuggestions(res.data.suggestions || []);
    setPlans(res.data.plans || []);
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await consolidationAPI.listRuns();
        if (res.data?.length) await loadRun(res.data[0].id);
      } catch { /* first-time */ }
      try {
        const u = await usersAPI.getAll({ limit: 500 });
        setUsers(u.data?.users || u.data || []);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const planRowFor = (planKey) => plans.find((p) => p.plan_key === planKey) || null;
  const suggestionsForPlan = (planKey) => suggestions.filter((s) => s.payload.plan_key === planKey);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await consolidationAPI.run();
      await loadRun(res.data.run_id);
      toast.success(`Kész: ${res.data.total_moves} költözés, ${res.data.freed_rooms} felszabaduló szoba.`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'A futtatás sikertelen.');
    } finally { setRunning(false); }
  };

  // ── approve ──
  const openApprove = (plan, planLabel) => {
    setAssignee(''); setDueDate('');
    setApproveDlg({ plan, planLabel });
  };
  const submitApprove = async () => {
    setBusy(true);
    try {
      const res = await consolidationAPI.approve(run.id, approveDlg.plan.plan_key, assignee || null, dueDate || null);
      toast.success(`Jóváhagyva. Költözési feladat létrehozva: ${res.data.ticket_number}`);
      setApproveDlg(null);
      await loadRun(run.id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Jóváhagyási hiba.');
    } finally { setBusy(false); }
  };

  // ── confirm ──
  const openConfirm = (plan, planLabel) => {
    const moves = suggestionsForPlan(plan.plan_key).filter((s) => s.status === 'approved');
    const init = {};
    moves.forEach((m) => { init[m.id] = { done: true, reason: '' }; });
    setDecisions(init); setConflicts([]);
    setConfirmDlg({ plan, planLabel, moves });
  };
  const submitConfirm = async () => {
    setBusy(true);
    try {
      const decisionArr = confirmDlg.moves.map((m) => ({
        suggestion_id: m.id, done: decisions[m.id]?.done ?? true, reason: decisions[m.id]?.reason || null,
      }));
      const res = await consolidationAPI.confirm(run.id, confirmDlg.plan.plan_key, decisionArr);
      toast.success(`Költözés megerősítve: ${res.data.applied} alkalmazva${res.data.skipped ? `, ${res.data.skipped} kihagyva` : ''}.`);
      setConfirmDlg(null);
      await loadRun(run.id);
    } catch (e) {
      const data = e.response?.data;
      if (data?.error === 'conflict') {
        setConflicts(data.conflicts || []);
        toast.error('Ütközés: a terv időközben elavult. Nézd át a jelölt költözéseket.');
      } else {
        toast.error(data?.message || 'Megerősítési hiba.');
      }
    } finally { setBusy(false); }
  };

  // ── cancel ──
  const handleCancel = async (plan, planLabel) => {
    if (!window.confirm(`Biztosan visszavonod a(z) "${planLabel}" jóváhagyott tervét? A költözési feladat lezárul, szobák nem változnak.`)) return;
    setBusy(true);
    try {
      await consolidationAPI.cancel(run.id, plan.plan_key);
      toast.success('Terv visszavonva.');
      await loadRun(run.id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Visszavonási hiba.');
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
  const fmtDue = (d) => d ? new Date(d).toLocaleDateString('hu-HU') : '—';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Szoba-konszolidáció</Typography>
          <Typography variant="body2" color="text.secondary">
            Jóváhagyás = költözési feladat (nem azonnali átsorolás). A szobák a rendszerben csak a
            fizikai költözés megerősítése után változnak: utasítás → végrehajtás → megerősítés.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={running ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
          onClick={handleRun} disabled={running}
          sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#6f552a' } }}>
          Konszolidáció futtatása
        </Button>
      </Box>

      {!run && !running && <Alert severity="info">Még nincs futtatás. Kattints a „Konszolidáció futtatása" gombra.</Alert>}

      {run && (
        <>
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Summary label="Javasolt költözések" value={run.total_moves} />
            <Summary label="Felszabaduló szobák" value={run.freed_rooms} />
            <Summary label="Felszabaduló ágyak" value={run.freed_beds} />
            <Summary label="Tervek" value={byPlan.length} />
          </Paper>

          {byPlan.length === 0 && <Alert severity="success">Nincs konszolidálható szálláshely — minden optimális.</Alert>}

          {byPlan.map((plan) => {
            const sug = suggestionsForPlan(plan.plan_key);
            const planRow = planRowFor(plan.plan_key);
            const open = !!expanded[plan.plan_key];
            const isCrossPlan = (plan.cross_moves || 0) > 0;
            const planLabel = (plan.accommodation_names || []).join(isCrossPlan ? ' ⇄ ' : ', ');
            const lifecycle = planRow ? PLAN_STATUS[planRow.status] : { label: 'Javasolt', color: '#8B6B33' };
            const isPendingMove = planRow?.status === 'approved_pending_move';
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
                      <Chip size="small" label={lifecycle.label} sx={{ bgcolor: lifecycle.color, color: '#fff', height: 20, fontWeight: 600 }} />
                      {isCrossPlan && <Chip size="small" label={`${plan.cross_moves} szálláshelyközi`} icon={<SwapHorizIcon sx={{ fontSize: 15 }} />}
                        sx={{ bgcolor: '#8B6B33', color: '#fff', height: 20, '& .MuiChip-icon': { color: '#fff' } }} />}
                      {(plan.accommodations || []).map((a) => <RoleBadge key={a.id} role={a.role} locked={a.locked} />)}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {plan.moves} költözés · felszabadít {plan.freed_rooms} szobát / {plan.freed_beds} ágyat · prioritás {plan.score}
                      {planRow && ` · jegy ${planRow.ticket_number || '—'} · felelős ${planRow.assignee_name || '—'} · határidő ${fmtDue(planRow.due_date)}`}
                    </Typography>
                  </Box>
                  {/* lifecycle actions */}
                  {!planRow && (
                    <Button size="small" variant="contained" startIcon={<AssignmentIcon />} disabled={busy}
                      onClick={() => openApprove(plan, planLabel)} sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#6f552a' } }}>
                      Jóváhagyás → feladat
                    </Button>
                  )}
                  {isPendingMove && (
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" startIcon={<DoneAllIcon />} disabled={busy}
                        onClick={() => openConfirm(plan, planLabel)} sx={{ bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}>
                        Költözés megerősítése
                      </Button>
                      <Button size="small" variant="outlined" color="inherit" disabled={busy}
                        onClick={() => handleCancel(plan, planLabel)}>Mégse</Button>
                    </Stack>
                  )}
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
                          const [lbl, col] = SUG_STATUS[s.status] || [s.status, 'default'];
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
                                  ? <Chip size="small" icon={<SwapHorizIcon sx={{ fontSize: 14 }} />} label="Szálláshelyközi" sx={{ bgcolor: '#8B6B33', color: '#fff', '& .MuiChip-icon': { color: '#fff' } }} />
                                  : <Chip size="small" label="Helyi" variant="outlined" />}
                              </TableCell>
                              <TableCell>
                                <Chip label={lbl} size="small" color={col} />
                                {s.status === 'skipped' && p.skip_reason &&
                                  <Tooltip title={p.skip_reason}><Typography variant="caption" display="block" color="text.secondary">ok: {p.skip_reason}</Typography></Tooltip>}
                              </TableCell>
                              <TableCell align="right">
                                {s.status === 'pending' && (
                                  <IconButton size="small" color="error" disabled={busy} onClick={() => handleReject(s.id)} title="Elutasítás">
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

      {/* ── Approve dialog ── */}
      <Dialog open={!!approveDlg} onClose={() => !busy && setApproveDlg(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Jóváhagyás → költözési feladat</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            <strong>{approveDlg?.planLabel}</strong> — {approveDlg && suggestionsForPlan(approveDlg.plan.plan_key).filter(s => s.status === 'pending').length} költözés.
            Ez költözési feladatot (jegyet) hoz létre. A szobák NEM változnak most — csak a fizikai költözés megerősítése után.
          </Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Felelős (szállásvezető)</InputLabel>
            <Select value={assignee} label="Felelős (szállásvezető)" onChange={(e) => setAssignee(e.target.value)}>
              <MenuItem value="">— nincs kijelölve —</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>{u.last_name} {u.first_name} ({u.email})</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField fullWidth type="date" label="Határidő" InputLabelProps={{ shrink: true }}
            value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setApproveDlg(null)} disabled={busy}>Mégse</Button>
          <Button variant="contained" onClick={submitApprove} disabled={busy}
            sx={{ bgcolor: GOLD, '&:hover': { bgcolor: '#6f552a' } }}>
            {busy ? <CircularProgress size={22} /> : 'Feladat létrehozása'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm dialog ── */}
      <Dialog open={!!confirmDlg} onClose={() => !busy && setConfirmDlg(null)} maxWidth="md" fullWidth>
        <DialogTitle>Költözés megerősítése — {confirmDlg?.planLabel}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Jelöld be a ténylegesen elvégzett költözéseket. A bejelöltek MOST életbe lépnek (szoba frissül);
            a kihagyottakat indoklással rögzítjük, és a terv részben teljesültként zárul.
          </Typography>
          {conflicts.length > 0 && (
            <Alert severity="error" sx={{ mb: 1 }}>
              A terv időközben elavult — az alábbi költözések nem végezhetők el:
              <ul style={{ margin: '4px 0 0 16px' }}>
                {conflicts.map((c) => <li key={c.suggestion_id}>{c.reason}</li>)}
              </ul>
              Vedd ki a jelölést ezekről, majd próbáld újra.
            </Alert>
          )}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">Kész?</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Munkavállaló</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Honnan → Hova</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Ha nem: indok</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {confirmDlg?.moves.map((m) => {
                  const p = m.payload;
                  const dec = decisions[m.id] || { done: true, reason: '' };
                  const conflicted = conflicts.some((c) => c.suggestion_id === m.id);
                  return (
                    <TableRow key={m.id} sx={conflicted ? { bgcolor: '#fdecea' } : {}}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={dec.done}
                          onChange={(e) => setDecisions((d) => ({ ...d, [m.id]: { ...dec, done: e.target.checked } }))} />
                      </TableCell>
                      <TableCell>{m.employee_name}</TableCell>
                      <TableCell>
                        {p.from_accommodation_name} {p.from_room_number} → <strong>{p.to_accommodation_name} {p.to_room_number}</strong>
                      </TableCell>
                      <TableCell>
                        {!dec.done && (
                          <TextField size="small" fullWidth placeholder="pl. a dolgozó nem volt elérhető"
                            value={dec.reason}
                            onChange={(e) => setDecisions((d) => ({ ...d, [m.id]: { ...dec, reason: e.target.value } }))} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDlg(null)} disabled={busy}>Mégse</Button>
          <Button variant="contained" startIcon={<DoneAllIcon />} onClick={submitConfirm} disabled={busy}
            sx={{ bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}>
            {busy ? <CircularProgress size={22} /> : 'Megerősítés + szobák frissítése'}
          </Button>
        </DialogActions>
      </Dialog>
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
