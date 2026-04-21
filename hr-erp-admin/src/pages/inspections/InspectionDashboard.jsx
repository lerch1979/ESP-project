import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Grid, Card, CardContent, Stack, LinearProgress,
  List, ListItem, ListItemText, Chip, IconButton, CircularProgress, Alert,
} from '@mui/material';
import {
  Refresh as RefreshIcon, Warning as WarningIcon, Assignment as AssignmentIcon,
  CheckCircle as CheckCircleIcon, PlayArrow as PlayArrowIcon, Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { inspectionsAPI } from '../../services/api';
import TrendChart from '../../components/inspections/TrendChart';
import GradeBadge from '../../components/inspections/GradeBadge';

const StatCard = ({ label, value, color, icon }) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
            {label}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 700, color: color || 'text.primary', mt: 0.5 }}>
            {value ?? '—'}
          </Typography>
        </Box>
        {icon && <Box sx={{ color: color || 'text.secondary' }}>{icon}</Box>}
      </Stack>
    </CardContent>
  </Card>
);

export default function InspectionDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [inspections, setInspections] = useState([]);
  const [tasks, setTasks] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inspRes, tasksRes] = await Promise.all([
        inspectionsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
        inspectionsAPI.listTasks({ limit: 500 }).catch(() => ({ data: [] })),
      ]);
      setInspections(inspRes?.data || []);
      setTasks(tasksRes?.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const total = inspections.length;
    const completed = inspections.filter((i) => i.status === 'completed' || i.status === 'reviewed').length;
    const inProgress = inspections.filter((i) => i.status === 'in_progress').length;
    const critical = inspections.filter((i) => i.grade === 'bad' || i.grade === 'critical').length;
    const overdueTasks = tasks.filter((t) => {
      if (t.status === 'completed' || t.status === 'cancelled') return false;
      if (!t.due_date) return false;
      try { return new Date(t.due_date) < new Date(); } catch { return false; }
    }).length;
    const scored = inspections.filter((i) => i.totalScore != null);
    const avgScore = scored.length > 0
      ? scored.reduce((a, b) => a + Number(b.totalScore || 0), 0) / scored.length
      : 0;
    return { total, completed, inProgress, critical, overdueTasks, avgScore };
  }, [inspections, tasks]);

  const trendData = useMemo(() => {
    const buckets = new Map();
    inspections.forEach((i) => {
      if (!i.completedAt && !i.scheduledAt) return;
      if (i.totalScore == null) return;
      const d = new Date(i.completedAt || i.scheduledAt);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets.has(key)) buckets.set(key, { month: key, scores: [], tech: [], hyg: [], aes: [] });
      const b = buckets.get(key);
      b.scores.push(Number(i.totalScore || 0));
      if (i.technicalScore != null) b.tech.push(Number(i.technicalScore));
      if (i.hygieneScore != null) b.hyg.push(Number(i.hygieneScore));
      if (i.aestheticScore != null) b.aes.push(Number(i.aestheticScore));
    });
    const avg = (arr) => arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;
    return Array.from(buckets.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((b) => ({
        month: b.month,
        avg_score: avg(b.scores),
        avg_technical: avg(b.tech),
        avg_hygiene: avg(b.hyg),
        avg_aesthetic: avg(b.aes),
      }));
  }, [inspections]);

  const criticalList = useMemo(
    () => inspections.filter((i) => i.grade === 'bad' || i.grade === 'critical').slice(0, 10),
    [inspections],
  );

  const pendingTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const completionPct = tasks.length > 0
    ? Math.round(((tasks.length - pendingTasks.length) / tasks.length) * 100)
    : 0;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Ellenőrzési Dashboard</Typography>
        <IconButton onClick={load}><RefreshIcon /></IconButton>
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} md={2}>
              <StatCard label="Összes" value={stats.total} icon={<AssessmentIcon />} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard label="Befejezett" value={stats.completed} color="#16a34a" icon={<CheckCircleIcon />} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard label="Folyamatban" value={stats.inProgress} color="#f59e0b" icon={<PlayArrowIcon />} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard label="Lejárt feladat" value={stats.overdueTasks} color="#dc2626" icon={<WarningIcon />} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard label="Kritikus sorok" value={stats.critical} color="#b91c1c" icon={<WarningIcon />} />
            </Grid>
            <Grid item xs={6} md={2}>
              <StatCard
                label="Átlag pontszám"
                value={stats.avgScore ? stats.avgScore.toFixed(1) : '—'}
                color={stats.avgScore >= 70 ? '#16a34a' : stats.avgScore >= 50 ? '#f59e0b' : '#dc2626'}
                icon={<AssignmentIcon />}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Havi átlagpontszám trend
                </Typography>
                <TrendChart data={trendData} height={280} />
              </Paper>

              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                  Függő feladatok ({pendingTasks.length} / {tasks.length})
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={completionPct}
                  sx={{ height: 12, borderRadius: 6, mb: 1 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {completionPct}% befejezve
                </Typography>
              </Paper>
            </Grid>

            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <WarningIcon color="error" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Kritikus állapotú sorok
                  </Typography>
                </Stack>
                {criticalList.length === 0 ? (
                  <Alert severity="success" variant="outlined">
                    Nincs kritikus állapotú ellenőrzés.
                  </Alert>
                ) : (
                  <List dense>
                    {criticalList.map((i) => (
                      <ListItem
                        key={i.id}
                        button
                        onClick={() => navigate(`/inspections/${i.id}`)}
                        sx={{ borderLeft: '3px solid #dc2626', pl: 1.5, mb: 0.5, bgcolor: '#fef2f2' }}
                      >
                        <ListItemText
                          primary={i.accommodationName || `#${i.id}`}
                          secondary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="caption">{i.inspectionNumber}</Typography>
                              <GradeBadge grade={i.grade} size="small" />
                            </Stack>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
