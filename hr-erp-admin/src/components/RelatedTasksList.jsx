import React, { useCallback, useEffect, useState } from 'react';
import {
  Paper, Box, Typography, Button, Stack, Chip, IconButton, Tooltip,
  CircularProgress, Avatar, AvatarGroup,
} from '@mui/material';
import {
  Add as AddIcon, CheckCircleOutline as DoneIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ticketsAPI, tasksAPI } from '../services/api';
import TaskCreationModal from './TaskCreationModal';

// Mirrors the status colors used elsewhere in the admin UI for tasks.
const STATUS = {
  todo:        { label: 'Teendő',      color: 'default' },
  in_progress: { label: 'Folyamatban', color: 'primary' },
  review:      { label: 'Ellenőrzés',  color: 'warning' },
  done:        { label: 'Kész',        color: 'success' },
  blocked:     { label: 'Blokkolva',   color: 'error' },
};

const fmtDate = (s) => s ? new Date(s).toLocaleDateString('hu-HU') : '—';

/**
 * Lists tasks linked to a ticket (tasks.linked_ticket_id = ticketId) and
 * lets the operator add a new one. The new-task modal is pre-filled with
 * linked_ticket_id + a "[Hibajegy #N]" title prefix so the origin is
 * obvious in any task list.
 */
export default function RelatedTasksList({ ticketId, ticketNumber, relatedEmployeeId }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await ticketsAPI.getRelatedTasks(ticketId);
      if (res?.success) setTasks(res.data?.tasks || []);
    } catch {
      toast.error('Kapcsolódó feladatok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const markDone = async (t) => {
    try {
      await tasksAPI.updateStatus(t.id, { status: 'done' });
      toast.success('Feladat kész');
      load();
    } catch {
      toast.error('Állapot módosítás sikertelen');
    }
  };

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Kapcsolódó feladatok
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreatorOpen(true)}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          Új feladat
        </Button>
      </Stack>

      {loading ? (
        <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : tasks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          Még nincs kapcsolódó feladat. Az „Új feladat” gombbal hozhatsz létre egyet.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {tasks.map((t) => {
            const s = STATUS[t.status] || { label: t.status, color: 'default' };
            const assignee = [t.assignee_first_name, t.assignee_last_name].filter(Boolean).join(' ')
              || t.assignee_email || '—';
            const helpers = Array.isArray(t.helpers) ? t.helpers : [];
            const isDone = t.status === 'done';
            const helperLabel = helpers.length === 0
              ? null
              : helpers.length === 1
                ? `+1 segítő (${[helpers[0].first_name, helpers[0].last_name].filter(Boolean).join(' ')})`
                : `+${helpers.length} segítő`;
            return (
              <Box
                key={t.id}
                sx={{
                  p: 1.25, border: '1px solid #e5e7eb', borderRadius: 1,
                  bgcolor: isDone ? '#f9fafb' : 'transparent',
                  opacity: isDone ? 0.7 : 1,
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, textDecoration: isDone ? 'line-through' : 'none' }}>
                      {t.title}
                    </Typography>
                    <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} alignItems="center" flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">👤 {assignee}</Typography>
                      {helpers.length > 0 && (
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <AvatarGroup
                            max={4}
                            sx={{
                              '& .MuiAvatar-root': {
                                width: 22, height: 22, fontSize: 10,
                                border: '1.5px solid white',
                              },
                            }}
                          >
                            {helpers.map((h, i) => {
                              const name = [h.first_name, h.last_name].filter(Boolean).join(' ') || h.email;
                              const initial = (name || '?').charAt(0).toUpperCase();
                              const done = h.status === 'completed';
                              return (
                                <Tooltip key={h.user_id || i} title={`${name} — ${h.status}`}>
                                  <Avatar sx={{ bgcolor: done ? '#16a34a' : '#6b7280' }}>{initial}</Avatar>
                                </Tooltip>
                              );
                            })}
                          </AvatarGroup>
                          <Typography variant="caption" color="text.secondary">{helperLabel}</Typography>
                        </Stack>
                      )}
                      <Typography variant="caption" color="text.secondary">⏰ {fmtDate(t.deadline || t.due_date)}</Typography>
                      <Chip size="small" label={s.label} color={s.color} variant="outlined" />
                    </Stack>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    {!isDone && (
                      <Tooltip title="Kész">
                        <IconButton size="small" color="success" onClick={() => markDone(t)}>
                          <DoneIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Megnyitás">
                      <IconButton size="small" onClick={() => navigate(`/tasks/${t.id}`)}>
                        <OpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      <TaskCreationModal
        open={creatorOpen}
        onClose={() => setCreatorOpen(false)}
        onSuccess={() => { setCreatorOpen(false); load(); }}
        linkedTicketId={ticketId}
        ticketNumberPrefix={ticketNumber}
        relatedEmployeeId={relatedEmployeeId || null}
      />
    </Paper>
  );
}
