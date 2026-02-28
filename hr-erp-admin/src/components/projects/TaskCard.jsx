import React, { forwardRef } from 'react';
import { Card, CardContent, Typography, Box, Stack, Chip } from '@mui/material';
import { ChatBubbleOutline as CommentIcon } from '@mui/icons-material';
import UserAvatar from '../common/UserAvatar';

const PRIORITY_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#94a3b8',
};

const getDueDateColor = (dueDate) => {
  if (!dueDate) return 'text.secondary';
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return '#ef4444';
  if (diffDays < 3) return '#f59e0b';
  return 'text.secondary';
};

const formatShortDate = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
};

const TaskCard = forwardRef(function TaskCard(
  { task, onClick, draggableProps, dragHandleProps, isDragging },
  ref
) {
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.low;
  const dueDateColor = getDueDateColor(task.due_date);
  const assigneeName = task.assigned_first_name
    ? `${task.assigned_last_name} ${task.assigned_first_name}`
    : null;

  return (
    <Card
      ref={ref}
      {...draggableProps}
      {...dragHandleProps}
      onClick={() => onClick?.(task)}
      sx={{
        mb: 1,
        cursor: 'pointer',
        borderLeft: `3px solid ${priorityColor}`,
        transition: 'box-shadow 0.2s',
        boxShadow: isDragging ? 6 : 1,
        '&:hover': { boxShadow: 3 },
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, lineHeight: 1.3 }}>
          {task.title}
        </Typography>

        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {/* Priority dot */}
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: priorityColor,
              flexShrink: 0,
            }}
          />

          {/* Due date */}
          {task.due_date && (
            <Typography variant="caption" sx={{ color: dueDateColor, fontWeight: 500 }}>
              {formatShortDate(task.due_date)}
            </Typography>
          )}

          {/* Subtask count */}
          {(task.subtask_count > 0 || task.completed_subtask_count > 0) && (
            <Typography variant="caption" color="text.secondary">
              {task.completed_subtask_count || 0}/{task.subtask_count || 0}
            </Typography>
          )}

          {/* Comment count */}
          {task.comment_count > 0 && (
            <Stack direction="row" spacing={0.25} alignItems="center">
              <CommentIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {task.comment_count}
              </Typography>
            </Stack>
          )}

          <Box sx={{ flex: 1 }} />

          {/* Assignee avatar */}
          {assigneeName && (
            <UserAvatar
              firstName={task.assigned_first_name}
              lastName={task.assigned_last_name}
              size="xs"
            />
          )}
        </Stack>
      </CardContent>
    </Card>
  );
});

export default TaskCard;
