import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Chip, IconButton, Tooltip, Button,
  CircularProgress, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  CheckCircleOutline as CheckIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { tasksAPI } from '../services/api';

const STATUS_LABEL = {
  pending:   { label: 'Várakozik',   color: 'default' },
  visited:   { label: 'Megnézte',    color: 'info'    },
  completed: { label: 'Befejezte',   color: 'success' },
  cancelled: { label: 'Visszavonva', color: 'default' },
};

const fmtDateTime = (s) => s ? new Date(s).toLocaleString('hu-HU', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—';

/**
 * "Hozzárendelt segítők" panel for the task detail modal. Lists every
 * task_assignees row with the per-person status, plus per-row visit /
 * complete actions for the actor (or admin) and a delete affordance for
 * admins. Backend does the auth gating; this UI mostly hides irrelevant
 * buttons to keep the panel uncluttered.
 */
export default function TaskAssigneesPanel({ taskId, currentUser, onTaskUpdated }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(null); // user_id currently mid-action

  // Completion dialog (lets the actor add notes when marking done)
  const [completeFor, setCompleteFor] = useState(null);
  const [completeNotes, setCompleteNotes] = useState('');

  const myId = currentUser?.id;
  const isAdmin = !!(currentUser?.roles || []).find(r => r === 'admin' || r === 'superadmin');

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const r = await tasksAPI.listAssignees(taskId);
      if (r?.success) setRows(r.data?.assignees || []);
    } catch {
      toast.error('Hozzárendelések betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const visit = async (userId) => {
    setActing(userId);
    try {
      const r = await tasksAPI.markAssigneeVisited(taskId, userId);
      if (r?.success) {
        toast.success('Megjelölve: megnézte');
        load();
        onTaskUpdated?.();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Sikertelen');
    } finally {
      setActing(null);
    }
  };

  const startComplete = (userId) => {
    setCompleteFor(userId);
    setCompleteNotes('');
  };

  const submitComplete = async () => {
    const userId = completeFor;
    setActing(userId);
    try {
      const r = await tasksAPI.markAssigneeCompleted(taskId, userId, { notes: completeNotes || null });
      if (r?.success) {
        toast.success('Befejezve');
        setCompleteFor(null);
        setCompleteNotes('');
        load();
        onTaskUpdated?.();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Sikertelen');
    } finally {
      setActing(null);
    }
  };

  const removeRow = async (userId) => {
    if (!confirm('Biztosan eltávolítod ezt a hozzárendelést?')) return;
    setActing(userId);
    try {
      const r = await tasksAPI.removeAssignee(taskId, userId);
      if (r?.success) { toast.success('Eltávolítva'); load(); onTaskUpdated?.(); }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Sikertelen');
    } finally {
      setActing(null);
    }
  };

  if (loading && rows.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}><CircularProgress size={20} /></Box>
    );
  }
  if (rows.length === 0) {
    return null; // no helpers — hide the panel entirely
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Segítők ({rows.length})
      </Typography>
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {rows.map(a => {
          const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email;
          const status = STATUS_LABEL[a.status] || { label: a.status, color: 'default' };
          const canActSelf = a.user_id === myId;
          const canModify = canActSelf || isAdmin;
          const isWorking = acting === a.user_id;
          return (
            <Box key={a.id} sx={{
              p: 1.25, border: '1px solid #e5e7eb', borderRadius: 1,
              display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
            }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{name}</Typography>
                  <Chip size="small" label={a.role} variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                  <Chip size="small" label={status.label} color={status.color} sx={{ height: 18 }} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                  {a.completed_at
                    ? `Befejezte: ${fmtDateTime(a.completed_at)}${a.completion_notes ? ` — „${a.completion_notes}"` : ''}`
                    : a.visited_at ? `Megnézte: ${fmtDateTime(a.visited_at)}`
                    : a.notified_at ? `Értesítve: ${fmtDateTime(a.notified_at)}`
                    : `Létrehozva: ${fmtDateTime(a.created_at)}`}
                </Typography>
              </Box>
              {canModify && a.status !== 'completed' && (
                <>
                  {a.status !== 'visited' && (
                    <Tooltip title="Megjelölés: megnézte">
                      <span>
                        <IconButton size="small" onClick={() => visit(a.user_id)} disabled={isWorking}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  <Tooltip title="Befejeztem">
                    <span>
                      <IconButton size="small" color="success" onClick={() => startComplete(a.user_id)} disabled={isWorking}>
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
              {isAdmin && (
                <Tooltip title="Eltávolítás">
                  <span>
                    <IconButton size="small" color="error" onClick={() => removeRow(a.user_id)} disabled={isWorking}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          );
        })}
      </Stack>

      {/* Completion notes dialog */}
      <Dialog open={!!completeFor} onClose={() => setCompleteFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Feladat befejezése</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth multiline rows={3}
            label="Megjegyzés (opcionális)"
            placeholder="Pl. mit csináltam, mit hagytam ott…"
            value={completeNotes}
            onChange={e => setCompleteNotes(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteFor(null)}>Mégse</Button>
          <Button variant="contained" onClick={submitComplete} disabled={!!acting}
            sx={{ bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' } }}>
            Befejezem
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
