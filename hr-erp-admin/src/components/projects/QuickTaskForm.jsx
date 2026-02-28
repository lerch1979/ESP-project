import React, { useState, useRef, useEffect } from 'react';
import { Box, TextField, Select, MenuItem, IconButton, Stack } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export default function QuickTaskForm({ status, users, onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      status,
      ...(assignedTo && { assigned_to: assignedTo }),
    });
    setTitle('');
    setAssignedTo('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <Box
      sx={{
        p: 1,
        mb: 1,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack spacing={1}>
        <TextField
          inputRef={inputRef}
          placeholder="Feladat neve..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          size="small"
          fullWidth
          autoComplete="off"
        />
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            size="small"
            displayEmpty
            sx={{ flex: 1, fontSize: '0.8rem' }}
          >
            <MenuItem value="">
              <em>Felelős...</em>
            </MenuItem>
            {users.map((u) => (
              <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.8rem' }}>
                {u.last_name} {u.first_name}
              </MenuItem>
            ))}
          </Select>
          <IconButton size="small" onClick={onCancel}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>
    </Box>
  );
}
