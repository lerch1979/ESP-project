import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Paper, Box, Typography, Stack, Chip, IconButton, Tooltip, Button,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  CheckCircleOutline as CheckIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { tasksAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import TaskDetailModal from './TaskDetailModal';

// Deadline → urgency band. The widget uses these for the left border
// strip color and the small role/status chips.
const URGENCY = {
  overdue:    { color: '#dc2626', label: '⚠️ Lejárt!' },
  today:      { color: '#ea580c', label: 'Ma' },
  this_week:  { color: '#eab308', label: 'A héten' },
  future:     { color: '#16a34a', label: 'Később' },
  none:       { color: '#6b7280', label: 'Nincs határidő' },
};

// Border color classifier — visual urgency. Past-now is always red even
// if the deadline was earlier today (the work is genuinely late).
function classifyDeadline(deadlineStr, dueDateStr) {
  const target = deadlineStr || dueDateStr;
  if (!target) return 'none';
  const d = new Date(target);
  const now = new Date();
  if (d.getTime() < now.getTime()) return 'overdue';
  if (d.toDateString() === now.toDateString()) return 'today';
  const oneWeek = 7 * 24 * 3600 * 1000;
  if (d.getTime() - now.getTime() < oneWeek) return 'this_week';
  return 'future';
}

// Header-chip classifier — uses CALENDAR-DAY semantics so "Ma 14:00" and
// "Ma 18:00" both count as 'today' even when the time has already passed.
// "Lejárt" therefore means "deadline before today's start" (yesterday or
// earlier), not just "any past-now". This keeps the inline 'Ma HH:MM'
// label honest and the two header chips disjoint.
function classifyForBadge(deadlineStr, dueDateStr) {
  const target = deadlineStr || dueDateStr;
  if (!target) return 'none';
  const d = new Date(target);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  if (d.getTime() < startOfToday.getTime()) return 'overdue';
  if (d.getTime() < startOfTomorrow.getTime()) return 'today';
  return 'future';
}

function fmtDeadline(deadlineStr, dueDateStr) {
  const target = deadlineStr || dueDateStr;
  if (!target) return null;
  const d = new Date(target);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow  = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const opts = { hour: '2-digit', minute: '2-digit' };
  if (sameDay) return `Ma ${d.toLocaleTimeString('hu-HU', opts)}`;
  if (d.toDateString() === yesterday.toDateString()) return `Tegnap ${d.toLocaleTimeString('hu-HU', opts)}`;
  if (d.toDateString() === tomorrow.toDateString())  return `Holnap ${d.toLocaleTimeString('hu-HU', opts)}`;
  return d.toLocaleString('hu-HU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Homepage widget: every non-completed task where the caller is either
 * the main responsible or a helper with their personal row still open.
 *
 * Renders a stack of compact rows with quick "Megnéztem" / "Befejeztem"
 * actions inline, deadline-based color coding on the left edge, and a
 * click-anywhere-to-open-detail affordance. Empty state shown when
 * everything's clear.
 */
export default function MyActiveTasksWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(null);   // taskId currently mid-action
  const [openTaskId, setOpenTaskId] = useState(null); // detail modal

  // Completion notes dialog (mirrors the one on TaskAssigneesPanel so
  // the homepage flow matches the detail-modal flow).
  const [completeFor, setCompleteFor] = useState(null);
  const [completeNotes, setCompleteNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await tasksAPI.myActive();
      if (r?.success) setTasks(r.data?.tasks || []);
    } catch {
      toast.error('Aktív feladatok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const myId = user?.id;

  // Per-task: figure out which assignee row the action targets.
  // - 'main' role  → no task_assignees row, action targets task.assigned_to
  //   (which IS me by definition for these rows). Backend's visit/complete
  //   endpoints require a task_assignees row, so a 'main' click on
  //   "Befejeztem" doesn't have a clean target — instead we open the
  //   detail modal so the user can use the existing status flow.
  // - 'helper' role → row is in task_assignees with my user_id, fire
  //   the existing endpoint.
  const handleVisit = async (task) => {
    if (task.role !== 'helper') {
      // For main responsibles we don't have a per-helper visited
      // semantic; punt to the modal.
      setOpenTaskId(task.id);
      return;
    }
    setActing(task.id);
    try {
      const r = await tasksAPI.markAssigneeVisited(task.id, myId);
      if (r?.success) {
        toast.success('Megjelölve: megnézte');
        // Update locally so the row updates without a full reload
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, helper_status: 'visited' } : t));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Sikertelen');
    } finally {
      setActing(null);
    }
  };

  const startComplete = (task) => {
    if (task.role !== 'helper') {
      // Main responsible: drive completion through the existing status
      // flow (TaskDetailModal).
      setOpenTaskId(task.id);
      return;
    }
    setCompleteFor(task);
    setCompleteNotes('');
  };

  const submitComplete = async () => {
    const task = completeFor;
    if (!task) return;
    setActing(task.id);
    try {
      const r = await tasksAPI.markAssigneeCompleted(task.id, myId, { notes: completeNotes || null });
      if (r?.success) {
        toast.success('Feladat befejezve');
        // Remove from list — this user is done with this task
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setCompleteFor(null);
        setCompleteNotes('');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Sikertelen');
    } finally {
      setActing(null);
    }
  };

  // Sort already done by the backend; group counts go in the header chip.
  // Use the calendar-day classifier so "Ma 14:00" past noon still counts
  // as 'today' (the inline label says "Ma HH:MM" — the chip should agree).
  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0 };
    for (const t of tasks) {
      const u = classifyForBadge(t.deadline, t.due_date);
      if (u === 'overdue') c.overdue++;
      else if (u === 'today') c.today++;
    }
    return c;
  }, [tasks]);

  return (
    <Paper sx={{ p: 2.5 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" sx={{ fontWeight: 700 }}>🎯 Elvégzendő feladataim</Typography>
          {tasks.length > 0 && <Chip size="small" label={tasks.length} color="primary" />}
          {counts.overdue > 0 && (
            <Chip size="small" label={`${counts.overdue} lejárt`} sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 600 }} />
          )}
          {counts.today > 0 && (
            <Chip size="small" label={`${counts.today} ma`} sx={{ bgcolor: '#fed7aa', color: '#9a3412', fontWeight: 600 }} />
          )}
        </Stack>
        <Tooltip title="Frissítés">
          <IconButton size="small" onClick={load} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      {loading && tasks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={24} /></Box>
      ) : tasks.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="h2" sx={{ mb: 1 }}>🎉</Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>Nincs aktív feladatod!</Typography>
          <Typography variant="caption" color="text.secondary">Minden feladatod kész 🌟</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {tasks.map(t => {
            const urgency = classifyDeadline(t.deadline, t.due_date);
            const u = URGENCY[urgency];
            const deadlineLabel = fmtDeadline(t.deadline, t.due_date);
            const role = t.role === 'main' ? 'Felelős vagy' : 'Segítő vagy';
            const helperVisited = t.helper_status === 'visited';
            const isWorking = acting === t.id;
            return (
              <Box
                key={t.id}
                onClick={() => setOpenTaskId(t.id)}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.5,
                  p: 1.25,
                  borderLeft: `4px solid ${u.color}`,
                  border: '1px solid #e5e7eb',
                  borderRadius: 1,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                  '&:hover': { bgcolor: 'rgba(37,99,235,0.04)' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{t.title}</Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} alignItems="center" flexWrap="wrap">
                    {t.ticket_number && (
                      <Chip
                        size="small"
                        label={`Hibajegy ${t.ticket_number}`}
                        sx={{ height: 18, fontSize: 11 }}
                        variant="outlined"
                      />
                    )}
                    <Chip
                      size="small"
                      label={role}
                      sx={{
                        height: 18, fontSize: 11,
                        bgcolor: t.role === 'main' ? '#dbeafe' : '#dcfce7',
                        color:   t.role === 'main' ? '#1e40af' : '#166534',
                      }}
                    />
                    {helperVisited && (
                      <Chip size="small" label="Megnézted" sx={{ height: 18, fontSize: 11, bgcolor: '#e0f2fe' }} />
                    )}
                    {deadlineLabel && (
                      <Typography variant="caption" sx={{ color: u.color, fontWeight: urgency === 'overdue' ? 700 : 500 }}>
                        ⏰ {deadlineLabel}
                      </Typography>
                    )}
                  </Stack>
                </Box>
                <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                  {t.role === 'helper' && !helperVisited && (
                    <Tooltip title="Megnéztem">
                      <span>
                        <IconButton size="small" onClick={() => handleVisit(t)} disabled={isWorking}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip title={t.role === 'helper' ? 'Befejeztem' : 'Megnyitás'}>
                    <span>
                      <IconButton
                        size="small"
                        color={t.role === 'helper' ? 'success' : 'default'}
                        onClick={() => t.role === 'helper' ? startComplete(t) : setOpenTaskId(t.id)}
                        disabled={isWorking}
                      >
                        {t.role === 'helper' ? <CheckIcon fontSize="small" /> : <OpenIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Task detail modal — clicking a row opens it */}
      <TaskDetailModal
        open={!!openTaskId}
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChange={load}
      />

      {/* Completion notes (helper only) */}
      <Dialog open={!!completeFor} onClose={() => setCompleteFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Feladat befejezése</DialogTitle>
        <DialogContent>
          {completeFor && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {completeFor.title}
            </Typography>
          )}
          <TextField
            autoFocus fullWidth multiline rows={3}
            label="Megjegyzés (opcionális)"
            value={completeNotes}
            onChange={e => setCompleteNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteFor(null)}>Mégse</Button>
          <Button
            variant="contained" onClick={submitComplete} disabled={!!acting}
            sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}
          >
            Befejezem
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
