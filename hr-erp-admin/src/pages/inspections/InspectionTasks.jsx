import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Grid, Card, CardContent, Chip, IconButton, Button,
  CircularProgress, Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon, Assignment as AssignmentIcon, AccessTime as AccessTimeIcon,
  PlayArrow as PlayArrowIcon, CheckCircle as CheckCircleIcon, Warning as WarningIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';
import TaskAssignmentModal from '../../components/inspections/TaskAssignmentModal';

const PRIORITY_STYLE = {
  emergency: { bgcolor: '#b91c1c', color: '#fff', label: 'Azonnali' },
  critical: { bgcolor: '#dc2626', color: '#fff', label: 'Kritikus' },
  high: { bgcolor: '#f97316', color: '#fff', label: 'Magas' },
  medium: { bgcolor: '#eab308', color: '#111', label: 'Közepes' },
  low: { bgcolor: '#9ca3af', color: '#fff', label: 'Alacsony' },
};

const COLUMNS = [
  { key: 'pending', label: 'Függőben', icon: <AssignmentIcon fontSize="small" />, color: '#64748b' },
  { key: 'in_progress', label: 'Folyamatban', icon: <PlayArrowIcon fontSize="small" />, color: '#f59e0b' },
  { key: 'completed', label: 'Kész', icon: <CheckCircleIcon fontSize="small" />, color: '#16a34a' },
  { key: 'overdue', label: 'Lejárt', icon: <WarningIcon fontSize="small" />, color: '#dc2626' },
];

const isOverdue = (t) => {
  if (!t.due_date) return false;
  if (t.status === 'completed' || t.status === 'cancelled') return false;
  try { return new Date(t.due_date) < new Date(); } catch { return false; }
};

export default function InspectionTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inspectionsAPI.listTasks();
      setTasks(res?.data || []);
    } catch (e) {
      toast.error('Nem sikerült betölteni a feladatokat');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const buckets = { pending: [], in_progress: [], completed: [], overdue: [] };
    (tasks || []).forEach((t) => {
      if (isOverdue(t)) {
        buckets.overdue.push(t);
      } else if (t.status === 'in_progress') {
        buckets.in_progress.push(t);
      } else if (t.status === 'completed') {
        buckets.completed.push(t);
      } else {
        buckets.pending.push(t);
      }
    });
    return buckets;
  }, [tasks]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Ellenőrzési feladatok</Typography>
        <IconButton onClick={load}><RefreshIcon /></IconButton>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2}>
          {COLUMNS.map((col) => {
            const list = groups[col.key] || [];
            return (
              <Grid item xs={12} md={3} key={col.key}>
                <Paper variant="outlined" sx={{ minHeight: 400, bgcolor: '#f9fafb' }}>
                  <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: col.color }}>{col.icon}</Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flexGrow: 1 }}>{col.label}</Typography>
                    <Chip size="small" label={list.length} />
                  </Box>
                  <Box sx={{ p: 1 }}>
                    {list.length === 0 ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 2, textAlign: 'center' }}>
                        Nincs feladat
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {list.map((t) => {
                          const prio = PRIORITY_STYLE[t.priority] || { bgcolor: '#e5e7eb', color: '#111', label: t.priority || '-' };
                          return (
                            <Card
                              key={t.id}
                              variant="outlined"
                              sx={{ cursor: 'pointer', '&:hover': { borderColor: '#6366f1' } }}
                              onClick={() => setSelectedTask(t)}
                            >
                              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
                                  <Chip size="small" label={prio.label} sx={{ bgcolor: prio.bgcolor, color: prio.color, fontSize: '0.7rem', height: 20 }} />
                                  {t.category && <Chip size="small" variant="outlined" label={t.category} sx={{ fontSize: '0.7rem', height: 20 }} />}
                                </Stack>
                                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                  {t.title || 'Névtelen feladat'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {t.accommodation_name || '-'}
                                </Typography>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                                  <Typography variant="caption" color="text.secondary">
                                    {t.assignee_name || '—'}
                                  </Typography>
                                  {t.due_date && (
                                    <Tooltip title="Határidő">
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <AccessTimeIcon sx={{ fontSize: 12 }} />
                                        <Typography variant="caption">{new Date(t.due_date).toLocaleDateString('hu-HU')}</Typography>
                                      </Box>
                                    </Tooltip>
                                  )}
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </Stack>
                    )}
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}

      <TaskAssignmentModal
        open={Boolean(selectedTask)}
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onAssigned={load}
      />
    </Box>
  );
}
