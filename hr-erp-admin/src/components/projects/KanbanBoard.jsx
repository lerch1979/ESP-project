import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Stack, IconButton, Chip,
  FormControl, Select, MenuItem, InputLabel,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import TaskCard from './TaskCard';
import QuickTaskForm from './QuickTaskForm';

const COLUMNS = [
  { id: 'todo', label: 'Teendő', color: '#94a3b8' },
  { id: 'in_progress', label: 'Folyamatban', color: '#3b82f6' },
  { id: 'review', label: 'Ellenőrzés', color: '#f59e0b' },
  { id: 'done', label: 'Kész', color: '#22c55e' },
  { id: 'blocked', label: 'Blokkolva', color: '#ef4444' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Összes prioritás' },
  { value: 'critical', label: 'Kritikus' },
  { value: 'high', label: 'Magas' },
  { value: 'medium', label: 'Közepes' },
  { value: 'low', label: 'Alacsony' },
];

export default function KanbanBoard({ tasks, onStatusChange, onTaskClick, onQuickAdd, users }) {
  const [quickAddColumn, setQuickAddColumn] = useState(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssignee && t.assigned_to != filterAssignee) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterAssignee, filterPriority]);

  const columnTasks = useMemo(() => {
    const grouped = {};
    COLUMNS.forEach((col) => {
      grouped[col.id] = filteredTasks.filter((t) => t.status === col.id);
    });
    return grouped;
  }, [filteredTasks]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    const taskId = parseInt(draggableId.replace('task-', ''), 10);
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) {
      onStatusChange(taskId, newStatus);
    }
  };

  const handleQuickAdd = (data) => {
    onQuickAdd(data);
    setQuickAddColumn(null);
  };

  return (
    <Box>
      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Felelős</InputLabel>
          <Select
            value={filterAssignee}
            label="Felelős"
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <MenuItem value="">Összes felelős</MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.last_name} {u.first_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Prioritás</InputLabel>
          <Select
            value={filterPriority}
            label="Prioritás"
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            {PRIORITY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {/* Kanban columns */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            overflowX: 'auto',
            pb: 2,
            minHeight: 400,
          }}
        >
          {COLUMNS.map((col) => (
            <Box
              key={col.id}
              sx={{
                minWidth: 260,
                maxWidth: 300,
                flex: '1 0 260px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Column header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                  px: 1,
                  py: 0.75,
                  borderRadius: 1,
                  bgcolor: `${col.color}18`,
                  borderTop: `3px solid ${col.color}`,
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {col.label}
                  </Typography>
                  <Chip
                    label={columnTasks[col.id]?.length || 0}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      bgcolor: col.color,
                      color: 'white',
                    }}
                  />
                </Stack>
                <IconButton
                  size="small"
                  onClick={() => setQuickAddColumn(quickAddColumn === col.id ? null : col.id)}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Box>

              {/* Quick add form */}
              {quickAddColumn === col.id && (
                <QuickTaskForm
                  status={col.id}
                  users={users}
                  onSubmit={handleQuickAdd}
                  onCancel={() => setQuickAddColumn(null)}
                />
              )}

              {/* Droppable area */}
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <Box
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    sx={{
                      flex: 1,
                      p: 0.5,
                      borderRadius: 1,
                      bgcolor: snapshot.isDraggingOver ? `${col.color}10` : 'grey.50',
                      minHeight: 100,
                      transition: 'background-color 0.2s',
                    }}
                  >
                    {columnTasks[col.id]?.map((task, index) => (
                      <Draggable
                        key={task.id}
                        draggableId={`task-${task.id}`}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <TaskCard
                            ref={provided.innerRef}
                            task={task}
                            onClick={onTaskClick}
                            draggableProps={provided.draggableProps}
                            dragHandleProps={provided.dragHandleProps}
                            isDragging={snapshot.isDragging}
                          />
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </Box>
          ))}
        </Box>
      </DragDropContext>
    </Box>
  );
}
