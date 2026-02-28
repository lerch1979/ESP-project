import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Alert,
  AlertTitle,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Skeleton,
} from '@mui/material';
import {
  ConfirmationNumber,
  Assignment,
  PriorityHigh,
} from '@mui/icons-material';
import { tasksAPI, ticketsAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'most';
  if (mins < 60) return `${mins} perce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} napja`;
  const months = Math.floor(days / 30);
  return `${months} hónapja`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('hu-HU');
}

export default function MyTasksWidget() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      try {
        const [statsRes, tasksRes, ticketsRes] = await Promise.all([
          tasksAPI.getMyTasksStats(),
          tasksAPI.getMyTasks({ limit: 3 }),
          ticketsAPI.getAll({ assigned_to: user.id, limit: 3 }),
        ]);

        if (cancelled) return;

        setStats(statsRes.data);

        // Combine and sort top items by priority
        const PRIORITY_ORDER = { critical: 0, urgent: 0, high: 1, medium: 2, normal: 2, low: 3 };
        const combined = [
          ...(tasksRes?.data?.tasks || []).map(t => ({
            id: `task-${t.id}`,
            type: 'task',
            title: t.title,
            priority: t.priority,
            created_at: t.created_at,
            due_date: t.due_date,
            url: `/projects/${t.project_id}`,
          })),
          ...(ticketsRes?.data?.tickets || []).map(t => ({
            id: `ticket-${t.id}`,
            type: 'ticket',
            title: t.title,
            priority: t.priority_slug || t.priority,
            created_at: t.created_at,
            due_date: t.due_date,
            url: `/tickets/${t.id}`,
          })),
        ]
          .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
          .slice(0, 3);

        setItems(combined);
      } catch (error) {
        console.error('My tasks widget load error:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading) {
    return <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1, mb: 3 }} />;
  }

  if (!stats || stats.total === 0) {
    return (
      <Alert severity="success" sx={{ mb: 3 }}>
        <AlertTitle>Nincs rád váró feladat</AlertTitle>
        Nagyszerű! Minden feladatodat elvégezted.
      </Alert>
    );
  }

  const hasUrgent = stats.urgent > 0;
  const hasOverdue = stats.overdue > 0;

  return (
    <Alert
      severity={hasUrgent || hasOverdue ? 'error' : 'warning'}
      sx={{ mb: 3 }}
      action={
        <Button
          color="inherit"
          size="small"
          onClick={() => navigate('/my-tasks')}
        >
          Mind megtekintem
        </Button>
      }
    >
      <AlertTitle>
        {hasOverdue && hasUrgent
          ? `${stats.total} feladatod vár`
          : hasUrgent
          ? `${stats.total} feladatod vár`
          : hasOverdue
          ? `${stats.total} feladatod vár`
          : `${stats.total} feladatod vár`}
      </AlertTitle>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        {hasUrgent && (
          <Chip label={`${stats.urgent} sürgős`} color="error" size="small" />
        )}
        {hasOverdue && (
          <Chip label={`${stats.overdue} lejárt`} color="warning" size="small" />
        )}
        {stats.new > 0 && (
          <Chip label={`${stats.new} új`} color="info" size="small" />
        )}
      </Box>

      {items.length > 0 && (
        <List dense sx={{ mt: 2 }}>
          {items.map(task => (
            <ListItem
              key={task.id}
              onClick={() => navigate(task.url)}
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1,
                mb: 1,
                cursor: 'pointer',
                border: ['urgent', 'critical'].includes(task.priority)
                  ? '2px solid'
                  : '1px solid',
                borderColor: ['urgent', 'critical'].includes(task.priority)
                  ? 'error.main'
                  : 'divider',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                {task.type === 'ticket' ? (
                  <ConfirmationNumber fontSize="small" />
                ) : (
                  <Assignment fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={task.title}
                secondary={
                  <>
                    {task.type === 'ticket' ? 'Hibajegy' : 'Feladat'}
                    {' \u2022 '}
                    {relativeTime(task.created_at)}
                    {task.due_date && ` \u2022 Határidő: ${formatDate(task.due_date)}`}
                  </>
                }
                primaryTypographyProps={{ noWrap: true, fontWeight: 500 }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              {['urgent', 'critical'].includes(task.priority) && (
                <PriorityHigh color="error" fontSize="small" />
              )}
            </ListItem>
          ))}
        </List>
      )}
    </Alert>
  );
}
