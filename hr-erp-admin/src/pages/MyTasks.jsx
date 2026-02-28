import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  AlertTitle,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Pagination,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
} from '@mui/material';
import {
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  ExpandMore as ExpandMoreIcon,
  ConfirmationNumber as TicketIcon,
  Assignment as TaskIcon,
  AccessTime as AccessTimeIcon,
  FolderOpen as FolderOpenIcon,
  Warning as WarningIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { tasksAPI, ticketsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// --- Status / priority maps ---

const TASK_STATUS_MAP = {
  todo: { label: 'Teendő', color: 'default' },
  in_progress: { label: 'Folyamatban', color: 'primary' },
  review: { label: 'Ellenőrzés', color: 'warning' },
  done: { label: 'Kész', color: 'success' },
  blocked: { label: 'Blokkolva', color: 'error' },
};

const TASK_PRIORITY_MAP = {
  low: { label: 'Alacsony', color: 'default' },
  medium: { label: 'Közepes', color: 'info' },
  high: { label: 'Magas', color: 'warning' },
  critical: { label: 'Kritikus', color: 'error' },
};

const TICKET_STATUS_COLORS = {
  new: 'info',
  in_progress: 'warning',
  completed: 'success',
  rejected: 'error',
  waiting: 'default',
  waiting_material: 'warning',
  invoicing: 'info',
  payment_pending: 'warning',
  transferred: 'info',
  not_feasible: 'default',
};

const TICKET_PRIORITY_COLORS = {
  low: 'success',
  normal: 'default',
  urgent: 'warning',
  critical: 'error',
};

// --- Helpers ---

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
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('hu-HU');
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date() && new Date(dateStr).toDateString() !== new Date().toDateString();
}

// --- Filter definitions ---
const FILTERS = [
  { key: 'all', label: 'Mind' },
  { key: 'urgent', label: 'Sürgős' },
  { key: 'high', label: 'Magas prioritás' },
  { key: 'new', label: 'Új' },
  { key: 'overdue', label: 'Lejárt határidő' },
];

const SORT_OPTIONS = [
  { value: 'due_date', label: 'Határidő' },
  { value: 'priority', label: 'Prioritás' },
  { value: 'created_at', label: 'Létrehozva' },
  { value: 'type', label: 'Típus' },
];

const PRIORITY_ORDER = { critical: 0, urgent: 0, high: 1, medium: 2, normal: 2, low: 3 };

function MyTasks() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('myTasksViewMode') || 'list'; } catch { return 'list'; }
  });
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [tasksRes, ticketsRes] = await Promise.all([
        tasksAPI.getMyTasks({ limit: 200 }),
        ticketsAPI.getAll({ assigned_to: user.id, limit: 200 }),
      ]);

      setTasks(
        (tasksRes?.data?.tasks || []).map(t => ({
          ...t,
          _type: 'task',
          _title: t.title,
          _status: t.status,
          _statusLabel: TASK_STATUS_MAP[t.status]?.label || t.status,
          _statusColor: TASK_STATUS_MAP[t.status]?.color || 'default',
          _priority: t.priority,
          _priorityLabel: TASK_PRIORITY_MAP[t.priority]?.label || t.priority,
          _priorityColor: TASK_PRIORITY_MAP[t.priority]?.color || 'default',
          _dueDate: t.due_date,
          _createdAt: t.created_at,
          _source: t.project_name ? `${t.project_code} — ${t.project_name}` : 'Projekt',
          _link: `/projects/${t.project_id}`,
        }))
      );

      setTickets(
        (ticketsRes?.data?.tickets || []).map(t => ({
          ...t,
          _type: 'ticket',
          _title: t.title,
          _status: t.status_slug || t.status,
          _statusLabel: t.status_name || t.status,
          _statusColor: TICKET_STATUS_COLORS[t.status_slug || t.status] || 'default',
          _priority: t.priority_slug || t.priority,
          _priorityLabel: t.priority_name || t.priority,
          _priorityColor: TICKET_PRIORITY_COLORS[t.priority_slug || t.priority] || 'default',
          _dueDate: t.due_date || null,
          _createdAt: t.created_at,
          _source: t.category_name || 'Hibajegy',
          _link: `/tickets/${t.id}`,
        }))
      );
    } catch (err) {
      console.error('Saját feladatok betöltési hiba:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Persist view mode
  useEffect(() => {
    try { localStorage.setItem('myTasksViewMode', viewMode); } catch {}
  }, [viewMode]);

  // Combined & filtered list
  const allItems = useMemo(() => {
    let combined = [...tasks, ...tickets];

    // Apply filter
    if (activeFilter === 'urgent') {
      combined = combined.filter(i => ['critical', 'urgent'].includes(i._priority));
    } else if (activeFilter === 'high') {
      combined = combined.filter(i => ['critical', 'urgent', 'high'].includes(i._priority));
    } else if (activeFilter === 'new') {
      combined = combined.filter(i => ['new', 'todo'].includes(i._status));
    } else if (activeFilter === 'overdue') {
      combined = combined.filter(i => isOverdue(i._dueDate));
    }

    // Apply sort
    combined.sort((a, b) => {
      if (sortBy === 'due_date') {
        if (!a._dueDate && !b._dueDate) return 0;
        if (!a._dueDate) return 1;
        if (!b._dueDate) return -1;
        return new Date(a._dueDate) - new Date(b._dueDate);
      }
      if (sortBy === 'priority') {
        return (PRIORITY_ORDER[a._priority] ?? 9) - (PRIORITY_ORDER[b._priority] ?? 9);
      }
      if (sortBy === 'created_at') {
        return new Date(b._createdAt) - new Date(a._createdAt);
      }
      if (sortBy === 'type') {
        return a._type.localeCompare(b._type);
      }
      return 0;
    });

    return combined;
  }, [tasks, tickets, activeFilter, sortBy]);

  // Pagination
  const totalPages = Math.ceil(allItems.length / itemsPerPage);
  const pagedItems = allItems.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [activeFilter, sortBy]);

  // Urgent/overdue counts
  const overdueCount = useMemo(
    () => [...tasks, ...tickets].filter(i => isOverdue(i._dueDate)).length,
    [tasks, tickets]
  );
  const urgentCount = useMemo(
    () => [...tasks, ...tickets].filter(i => ['critical', 'urgent'].includes(i._priority)).length,
    [tasks, tickets]
  );

  // Grouped data
  const groupedByType = useMemo(() => {
    const groups = { ticket: [], task: [] };
    allItems.forEach(item => {
      groups[item._type]?.push(item);
    });
    return groups;
  }, [allItems]);

  // --- Render helpers ---

  const renderItemCard = (item) => (
    <Paper
      key={`${item._type}-${item.id}`}
      sx={{
        p: 2,
        mb: 1.5,
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, transform 0.1s',
        '&:hover': { boxShadow: 4, transform: 'translateY(-1px)' },
        borderLeft: 4,
        borderLeftColor: item._type === 'ticket' ? 'warning.main' : 'primary.main',
      }}
      onClick={() => navigate(item._link)}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            <Chip
              icon={item._type === 'ticket' ? <TicketIcon sx={{ fontSize: 16 }} /> : <TaskIcon sx={{ fontSize: 16 }} />}
              label={item._type === 'ticket' ? 'Hibajegy' : 'Feladat'}
              size="small"
              variant="outlined"
              color={item._type === 'ticket' ? 'warning' : 'primary'}
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
            <Chip
              label={item._statusLabel}
              size="small"
              color={item._statusColor}
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
            <Chip
              label={item._priorityLabel}
              size="small"
              variant="outlined"
              color={item._priorityColor}
              sx={{ height: 24, fontSize: '0.75rem' }}
            />
            {isOverdue(item._dueDate) && (
              <Chip
                icon={<WarningIcon sx={{ fontSize: 14 }} />}
                label="Lejárt"
                size="small"
                color="error"
                sx={{ height: 24, fontSize: '0.75rem' }}
              />
            )}
          </Box>

          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }} noWrap>
            {item._title}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <FolderOpenIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {item._source}
              </Typography>
            </Box>
            {item._dueDate && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon sx={{ fontSize: 14, color: isOverdue(item._dueDate) ? 'error.main' : 'text.secondary' }} />
                <Typography variant="caption" color={isOverdue(item._dueDate) ? 'error.main' : 'text.secondary'}>
                  {formatDate(item._dueDate)}
                </Typography>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">
              {relativeTime(item._createdAt)}
            </Typography>
          </Box>
        </Box>

        <Tooltip title="Megnyitás">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(item._link); }}>
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Feladataim
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Összesen {allItems.length} elem ({tickets.length} hibajegy, {tasks.length} feladat)
          </Typography>
        </Box>

        {/* Urgent alert */}
        {(overdueCount > 0 || urgentCount > 0) && (
          <Alert
            severity={overdueCount > 0 ? 'error' : 'warning'}
            sx={{ mb: 3 }}
            icon={<WarningIcon />}
          >
            <AlertTitle>Figyelmet igénylő elemek</AlertTitle>
            {overdueCount > 0 && (
              <Typography variant="body2">
                {overdueCount} lejárt határidejű elem
              </Typography>
            )}
            {urgentCount > 0 && (
              <Typography variant="body2">
                {urgentCount} sürgős/kritikus prioritású elem
              </Typography>
            )}
          </Alert>
        )}

        {/* Toolbar: Filters + Sort + View toggle */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'center' }, gap: 2 }}>
            {/* Filter chips */}
            <ToggleButtonGroup
              value={activeFilter}
              exclusive
              onChange={(_, val) => val && setActiveFilter(val)}
              size="small"
              sx={{ flexWrap: 'wrap' }}
            >
              {FILTERS.map(f => (
                <ToggleButton key={f.key} value={f.key} sx={{ textTransform: 'none', px: 2 }}>
                  {f.label}
                  {f.key === 'overdue' && overdueCount > 0 && (
                    <Chip label={overdueCount} color="error" size="small" sx={{ ml: 1, height: 20, minWidth: 20, fontSize: '0.7rem' }} />
                  )}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ flex: 1 }} />

            {/* Sort */}
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Rendezés</InputLabel>
              <Select
                value={sortBy}
                label="Rendezés"
                onChange={(e) => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* View toggle */}
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, val) => val && setViewMode(val)}
              size="small"
            >
              <ToggleButton value="list">
                <Tooltip title="Lista nézet"><ViewListIcon /></Tooltip>
              </ToggleButton>
              <ToggleButton value="grouped">
                <Tooltip title="Csoportosított nézet"><ViewModuleIcon /></Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Paper>

        {/* Empty state */}
        {allItems.length === 0 && (
          <Paper sx={{ p: 6, textAlign: 'center' }}>
            <TaskIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              Nincs hozzád rendelt feladat
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {activeFilter !== 'all' ? 'Próbáld meg a „Mind" szűrőt.' : 'Jelenleg nincs aktív feladatod.'}
            </Typography>
          </Paper>
        )}

        {/* List view */}
        {viewMode === 'list' && allItems.length > 0 && (
          <Box>
            {pagedItems.map(renderItemCard)}
          </Box>
        )}

        {/* Grouped view */}
        {viewMode === 'grouped' && allItems.length > 0 && (
          <Box>
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TicketIcon color="warning" />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Hibajegyek
                  </Typography>
                  <Chip label={groupedByType.ticket.length} size="small" />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {groupedByType.ticket.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    Nincs hozzád rendelt hibajegy.
                  </Typography>
                ) : (
                  groupedByType.ticket.map(renderItemCard)
                )}
              </AccordionDetails>
            </Accordion>

            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <TaskIcon color="primary" />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Projekt feladatok
                  </Typography>
                  <Chip label={groupedByType.task.length} size="small" />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {groupedByType.task.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    Nincs hozzád rendelt projekt feladat.
                  </Typography>
                ) : (
                  groupedByType.task.map(renderItemCard)
                )}
              </AccordionDetails>
            </Accordion>
          </Box>
        )}

        {/* Pagination */}
        {viewMode === 'list' && totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={(_, val) => setPage(val)}
              color="primary"
              showFirstButton
              showLastButton
            />
          </Box>
        )}
      </Box>
  );
}

export default MyTasks;
