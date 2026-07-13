import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, Alert, Collapse, IconButton, Divider,
} from '@mui/material';
import {
  PlayArrow as PlayArrowIcon, CheckCircle as CheckCircleIcon, Cancel as CancelIcon,
  KeyboardArrowDown, KeyboardArrowRight, MeetingRoom as RoomIcon,
} from '@mui/icons-material';
import { consolidationAPI } from '../services/api';
import { toast } from 'react-toastify';

const GOLD = '#8B6B33';
const SHIFT_LABEL = { delelott: 'Délelőttös', delutan: 'Délutános', ejszaka: 'Éjszakás', valtott: 'Váltott' };
const GENDER_LABEL = { male: 'Férfi', female: 'Nő', other: 'Egyéb' };

export default function ConsolidationEngine() {
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null);          // { run_id, total_moves, freed_rooms, freed_beds, summary }
  const [suggestions, setSuggestions] = useState([]);
  const [expanded, setExpanded] = useState({});   // accommodation_id -> bool
  const [busy, setBusy] = useState(false);

  const loadRun = async (runId) => {
    const res = await consolidationAPI.getRun(runId);
    setRun(res.data.run);
    setSuggestions(res.data.suggestions || []);
  };

  useEffect(() => {
    // Show the most recent run on mount, if any.
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

  const handleApproveSite = async (accId, accName) => {
    if (!window.confirm(`Biztosan alkalmazod a(z) "${accName}" konszolidációs tervét? A költözések azonnal életbe lépnek.`)) return;
    setBusy(true);
    try {
      const res = await consolidationAPI.apply(run.run_id, accId);
      toast.success(`${res.data.applied} költözés alkalmazva.`);
      await loadRun(run.run_id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Alkalmazási hiba.');
    } finally { setBusy(false); }
  };

  const handleReject = async (suggestionId) => {
    const reason = window.prompt('Elutasítás oka (opcionális):') ?? null;
    setBusy(true);
    try {
      await consolidationAPI.reject(suggestionId, reason);
      await loadRun(run.run_id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Elutasítási hiba.');
    } finally { setBusy(false); }
  };

  const byAcc = run?.summary?.by_accommodation || [];
  const suggestionsForAcc = (accId) => suggestions.filter((s) => s.payload.accommodation_id === accId);
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
          {/* Run-level summary */}
          <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Summary label="Javasolt költözések" value={run.total_moves} />
            <Summary label="Felszabaduló szobák" value={run.freed_rooms} />
            <Summary label="Felszabaduló ágyak" value={run.freed_beds} />
            <Summary label="Érintett szálláshelyek" value={byAcc.length} />
            {run.summary?.flagged_unknown_shift_count > 0 && (
              <Summary label="Hiányzó műszak (nem mozgatható)" value={run.summary.flagged_unknown_shift_count} />
            )}
            <Box sx={{ ml: 'auto', alignSelf: 'center' }}>{statusChip(run.status === 'applied' ? 'applied' : 'pending')}</Box>
          </Paper>

          {run.summary?.flagged_unknown_shift_count > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {run.summary.flagged_unknown_shift_count} dolgozónak nincs megadva a műszakja — őket a motor <b>nem mozgatja</b> és nem is helyezi senki mellé. Töltsd ki a műszakjukat (Dolgozók → Műszak / Szoba-sablon), majd futtasd újra.
            </Alert>
          )}

          {byAcc.length === 0 && <Alert severity="success">Nincs konszolidálható szálláshely — minden optimális.</Alert>}

          {/* Per-accommodation plans, ranked by score */}
          {byAcc.map((acc) => {
            const sug = suggestionsForAcc(acc.accommodation_id);
            const pending = sug.filter((s) => s.status === 'pending').length;
            const open = !!expanded[acc.accommodation_id];
            return (
              <Paper key={acc.accommodation_id} sx={{ mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', p: 1.5, gap: 1 }}>
                  <IconButton size="small" onClick={() => setExpanded((e) => ({ ...e, [acc.accommodation_id]: !open }))}>
                    {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
                  </IconButton>
                  <RoomIcon sx={{ color: GOLD }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 700 }}>{acc.accommodation_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {acc.moves} költözés · felszabadít {acc.freed_rooms} szobát / {acc.freed_beds} ágyat ·
                      kihasználtság {(acc.utilization_before * 100).toFixed(0)}% · prioritás {acc.score}
                    </Typography>
                  </Box>
                  <Button size="small" variant="contained" startIcon={<CheckCircleIcon />}
                    disabled={busy || pending === 0}
                    onClick={() => handleApproveSite(acc.accommodation_id, acc.accommodation_name)}
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
                          <TableCell sx={{ fontWeight: 700 }}>Jelenlegi szoba</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Javasolt szoba</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Állapot</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>Művelet</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sug.map((s) => (
                          <TableRow key={s.id} hover>
                            <TableCell>{s.employee_name}</TableCell>
                            <TableCell>{GENDER_LABEL[s.gender] || s.gender} · {SHIFT_LABEL[s.shift] || s.shift || '—'}</TableCell>
                            <TableCell>{s.payload.from_room_number || '—'}</TableCell>
                            <TableCell><strong>{s.payload.to_room_number}</strong></TableCell>
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
                        ))}
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
