import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Chip, Button, IconButton, TextField,
  CircularProgress, Stack, FormControl, InputLabel, Select, MenuItem,
  Tooltip, Divider, useMediaQuery, useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Bolt as EnergyIcon,
  AccessTime as TimeIcon,
  Label as ContextIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners,
  useDroppable, useDraggable,
} from '@dnd-kit/core';
import { toast } from 'react-toastify';
import { tasksAPI, gtdAPI } from '../../services/api';
import TaskCreationModal from '../../components/TaskCreationModal';
import TaskDetailModal from '../../components/TaskDetailModal';

const BUCKETS = [
  { key: 'inbox',       label: 'Inbox',           color: '#94a3b8', hint: 'Új, még nem rendezett' },
  { key: 'next_action', label: 'Következő akciók', color: '#2563eb', hint: 'Kész cselekvésre' },
  { key: 'waiting',     label: 'Várakozás',         color: '#eab308', hint: 'Másra vár' },
  { key: 'someday',     label: 'Valamikor',         color: '#8b5cf6', hint: 'Talán egyszer' },
  { key: 'done',        label: 'Befejezett',        color: '#16a34a', hint: 'Archív' },
];

const PRIORITY_DOT = { critical: '#dc2626', high: '#ea580c', medium: '#2563eb', low: '#64748b' };
const ENERGY = {
  high:   { icon: '🔴', label: 'Magas' },
  medium: { icon: '🟡', label: 'Közepes' },
  low:    { icon: '🟢', label: 'Alacsony' },
};

function fmtMinutes(m) {
  if (!m) return null;
  if (m < 60) return `${m} perc`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}p` : `${h}h`;
}

// ─── Draggable card ──────────────────────────────────────────────────
function TaskCard({ task, onClick, contextMap }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
  };
  const ctx = task.gtd_context_id ? contextMap[task.gtd_context_id] : null;

  return (
    <Paper
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      elevation={1}
      onClick={(e) => {
        // Only open detail if this wasn't a drag start
        if (!isDragging) onClick?.(task.id);
      }}
      sx={{
        p: 1.5, mb: 1,
        borderLeft: `4px solid ${PRIORITY_DOT[task.priority] || '#64748b'}`,
        cursor: isDragging ? 'grabbing' : 'grab',
        '&:hover': { boxShadow: 3 },
        userSelect: 'none',
        ...style,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }} noWrap>
        {task.title}
      </Typography>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ rowGap: 0.5 }}>
        {ctx && (
          <Chip size="small" label={ctx.name} sx={{
            height: 20, fontSize: '0.65rem',
            bgcolor: ctx.color ? `${ctx.color}22` : '#e0e7ff',
            color: ctx.color || '#2563eb', fontWeight: 600,
          }} />
        )}
        {task.energy_level && (
          <Tooltip title={`Energia: ${ENERGY[task.energy_level]?.label}`}>
            <Chip size="small" label={ENERGY[task.energy_level]?.icon}
              sx={{ height: 20, fontSize: '0.75rem', bgcolor: '#f1f5f9' }} />
          </Tooltip>
        )}
        {task.time_estimate_minutes && (
          <Chip size="small" icon={<TimeIcon sx={{ fontSize: 12 }} />}
            label={fmtMinutes(task.time_estimate_minutes)}
            sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#f1f5f9' }} />
        )}
        {task.due_date && (
          <Chip size="small" label={new Date(task.due_date).toLocaleDateString('hu-HU')}
            sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#fef3c7', color: '#92400e' }} />
        )}
        {task.waiting_for && task.gtd_status === 'waiting' && (
          <Chip size="small" label={`Vár: ${task.waiting_for}`}
            sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#fef9c3', color: '#92400e' }} />
        )}
      </Stack>
      {task.assignee_name && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {task.assignee_name}
        </Typography>
      )}
    </Paper>
  );
}

// ─── Drop column ─────────────────────────────────────────────────────
function Column({ bucket, tasks, onCardClick, contextMap, onQuickAdd }) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket.key });
  const [quick, setQuick] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!quick.trim()) return;
    onQuickAdd(bucket.key, quick.trim());
    setQuick('');
  };

  return (
    <Box
      ref={setNodeRef}
      sx={{
        minWidth: 260, width: 260, flexShrink: 0,
        bgcolor: isOver ? `${bucket.color}18` : '#f8fafc',
        borderRadius: 2, p: 1.25,
        transition: 'background-color 0.15s',
        display: 'flex', flexDirection: 'column',
        maxHeight: '75vh',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: bucket.color }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {bucket.label}
        </Typography>
        <Chip label={tasks.length} size="small" sx={{
          height: 20, fontSize: '0.65rem', fontWeight: 700,
          bgcolor: bucket.color, color: 'white',
        }} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
        {bucket.hint}
      </Typography>

      <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
        {tasks.map(t => (
          <TaskCard key={t.id} task={t} onClick={onCardClick} contextMap={contextMap} />
        ))}
        {tasks.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', py: 2, fontStyle: 'italic' }}>
            üres
          </Typography>
        )}
      </Box>

      {bucket.key !== 'done' && (
        <Box component="form" onSubmit={submit} sx={{ mt: 1, display: 'flex', gap: 0.5 }}>
          <TextField
            size="small" fullWidth placeholder="+ gyors hozzáadás"
            value={quick}
            onChange={e => setQuick(e.target.value)}
            InputProps={{ sx: { fontSize: '0.8rem' } }}
          />
        </Box>
      )}
    </Box>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export default function UnifiedTasks() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState({ inbox: [], next_action: [], project: [], waiting: [], someday: [], done: [] });
  const [counts, setCounts] = useState({});
  const [contexts, setContexts] = useState([]);
  const [activeMobileKey, setActiveMobileKey] = useState('next_action');
  const [dragged, setDragged] = useState(null);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState(null);

  // Filters
  const [contextFilter, setContextFilter] = useState('all');
  const [energyFilter, setEnergyFilter] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | '15' | '30' | '60'

  const contextMap = useMemo(() =>
    Object.fromEntries(contexts.map(c => [c.id, c])), [contexts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (contextFilter !== 'all') params.context_id = contextFilter;
      if (energyFilter !== 'all') params.energy = energyFilter;
      if (timeFilter !== 'all') params.max_minutes = timeFilter;

      const [viewRes, ctxRes] = await Promise.all([
        tasksAPI.getGtdView(params),
        gtdAPI.listContexts().catch(() => ({ data: [] })),
      ]);
      if (viewRes.success) {
        setBuckets(viewRes.data.buckets);
        setCounts(viewRes.data.counts);
      }
      setContexts(ctxRes?.data || []);
    } catch {
      toast.error('Feladatok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [contextFilter, energyFilter, timeFilter]);

  useEffect(() => { load(); }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const onDragStart = (e) => setDragged(e.active.data.current?.task || null);

  const onDragEnd = async (e) => {
    setDragged(null);
    const { active, over } = e;
    if (!over) return;
    const bucketKey = over.id;
    const task = active.data.current?.task;
    if (!task || task.gtd_status === bucketKey) return;

    // Optimistic update
    setBuckets(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = next[k].filter(t => t.id !== task.id);
      }
      next[bucketKey] = [{ ...task, gtd_status: bucketKey }, ...next[bucketKey]];
      return next;
    });

    try {
      await tasksAPI.updateGtdStatus(task.id, bucketKey);
    } catch {
      toast.error('Áthelyezés sikertelen — visszaállítás');
      load();
    }
  };

  const handleQuickAdd = async (bucketKey, title) => {
    try {
      await tasksAPI.createStandalone({
        title,
        gtd_status: bucketKey,
        priority: 'medium',
      });
      await load();
    } catch {
      toast.error('Hozzáadás sikertelen');
    }
  };

  const visibleBuckets = BUCKETS; // project bucket omitted from top-level tabs for now

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} mb={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Teendők</Typography>
          <Typography variant="caption" color="text.secondary">
            Unified tasks + GTD view
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <IconButton onClick={load} size="small"><RefreshIcon /></IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setNewModalOpen(true)}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            Új feladat
          </Button>
        </Stack>
      </Stack>

      {/* Filter bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterIcon sx={{ color: 'text.secondary' }} />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Context</InputLabel>
          <Select value={contextFilter} label="Context" onChange={e => setContextFilter(e.target.value)}>
            <MenuItem value="all">Mind</MenuItem>
            {contexts.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Energia</InputLabel>
          <Select value={energyFilter} label="Energia" onChange={e => setEnergyFilter(e.target.value)}>
            <MenuItem value="all">Mind</MenuItem>
            <MenuItem value="high">🔴 Magas</MenuItem>
            <MenuItem value="medium">🟡 Közepes</MenuItem>
            <MenuItem value="low">🟢 Alacsony</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Idő (max)</InputLabel>
          <Select value={timeFilter} label="Idő (max)" onChange={e => setTimeFilter(e.target.value)}>
            <MenuItem value="all">Mind</MenuItem>
            <MenuItem value="15">≤ 15 perc</MenuItem>
            <MenuItem value="30">≤ 30 perc</MenuItem>
            <MenuItem value="60">≤ 1 óra</MenuItem>
          </Select>
        </FormControl>
        {(contextFilter !== 'all' || energyFilter !== 'all' || timeFilter !== 'all') && (
          <Button size="small" onClick={() => { setContextFilter('all'); setEnergyFilter('all'); setTimeFilter('all'); }}>
            Szűrők törlése
          </Button>
        )}
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : isMobile ? (
        // Mobile: single column at a time, chip bar to switch
        <>
          <Stack direction="row" spacing={0.5} sx={{ mb: 2, overflowX: 'auto', pb: 1 }}>
            {visibleBuckets.map(b => (
              <Chip key={b.key}
                label={`${b.label} (${counts[b.key] ?? 0})`}
                onClick={() => setActiveMobileKey(b.key)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: activeMobileKey === b.key ? b.color : '#f1f5f9',
                  color: activeMobileKey === b.key ? 'white' : 'text.primary',
                  fontWeight: 700,
                }}
              />
            ))}
          </Stack>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            {visibleBuckets.filter(b => b.key === activeMobileKey).map(b => (
              <Column key={b.key} bucket={b} tasks={buckets[b.key] || []}
                onCardClick={setDetailTaskId} contextMap={contextMap}
                onQuickAdd={handleQuickAdd} />
            ))}
            <DragOverlay>
              {dragged ? <TaskCard task={dragged} contextMap={contextMap} /> : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : (
        // Desktop: full kanban
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
            {visibleBuckets.map(b => (
              <Column key={b.key} bucket={b} tasks={buckets[b.key] || []}
                onCardClick={setDetailTaskId} contextMap={contextMap}
                onQuickAdd={handleQuickAdd} />
            ))}
          </Box>
          <DragOverlay>
            {dragged ? <TaskCard task={dragged} contextMap={contextMap} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskCreationModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onSuccess={() => load()}
      />
      <TaskDetailModal
        open={!!detailTaskId}
        taskId={detailTaskId}
        onClose={() => setDetailTaskId(null)}
        onChange={load}
      />
    </Box>
  );
}
