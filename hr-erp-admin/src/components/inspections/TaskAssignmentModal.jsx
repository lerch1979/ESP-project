import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack,
  FormControl, InputLabel, Select, MenuItem, TextField, Typography, Alert,
} from '@mui/material';
import { toast } from 'react-toastify';
import { inspectionsAPI, usersAPI } from '../../services/api';

const PRIORITIES = [
  { value: 'emergency', label: 'Azonnali' },
  { value: 'critical', label: 'Kritikus' },
  { value: 'high', label: 'Magas' },
  { value: 'medium', label: 'Közepes' },
  { value: 'low', label: 'Alacsony' },
];

const STATUSES = [
  { value: 'pending', label: 'Függőben' },
  { value: 'in_progress', label: 'Folyamatban' },
  { value: 'completed', label: 'Kész' },
  { value: 'cancelled', label: 'Törölt' },
];

/**
 * TaskAssignmentModal — assigns/updates an inspection task.
 * Props: open, task, onClose, onAssigned
 */
export default function TaskAssignmentModal({ open, task, onClose, onAssigned }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setAssigneeId(task?.assignee_id || task?.assigneeId || '');
    setDueDate(task?.due_date ? String(task.due_date).slice(0, 10) : (task?.dueDate ? String(task.dueDate).slice(0, 10) : ''));
    setPriority(task?.priority || 'medium');
    setStatus(task?.status || 'pending');
    setNotes(task?.completion_notes || '');
  }, [open, task]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingUsers(true);
      try {
        let list = [];
        // Try to fetch maintenance workers first — fall back to all users.
        try {
          const res = await usersAPI.getAll({ role: 'maintenance_worker' });
          list = res?.data || res || [];
          if (!Array.isArray(list) || list.length === 0) {
            const res2 = await usersAPI.getAll();
            list = res2?.data || res2 || [];
          }
        } catch {
          const res2 = await usersAPI.getAll();
          list = res2?.data || res2 || [];
        }
        if (!cancelled) setUsers(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handleSubmit = async () => {
    if (!task?.id) return;
    setSaving(true);
    try {
      const payload = {
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        priority,
        status,
      };
      if (notes && notes !== task?.completion_notes) {
        payload.completion_notes = notes;
      }
      await inspectionsAPI.updateTask(task.id, payload);
      toast.success('Feladat frissítve');
      if (onAssigned) onAssigned();
      onClose?.();
    } catch (e) {
      toast.error('Sikertelen mentés: ' + (e?.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  const userLabel = (u) => {
    const name = [u.first_name || u.firstName, u.last_name || u.lastName].filter(Boolean).join(' ');
    return name || u.email || u.name || `#${u.id}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Feladat hozzárendelése</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {task && (
            <Alert severity="info" variant="outlined">
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {task.title || 'Névtelen feladat'}
              </Typography>
              {task.accommodation_name && (
                <Typography variant="caption" color="text.secondary">
                  Szálláshely: {task.accommodation_name}
                </Typography>
              )}
            </Alert>
          )}

          <FormControl fullWidth size="small">
            <InputLabel>Felelős</InputLabel>
            <Select
              label="Felelős"
              value={assigneeId || ''}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={loadingUsers}
            >
              <MenuItem value=""><em>— Nincs hozzárendelve —</em></MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>{userLabel(u)}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Határidő"
            type="date"
            size="small"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />

          <FormControl fullWidth size="small">
            <InputLabel>Prioritás</InputLabel>
            <Select label="Prioritás" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel>Státusz</InputLabel>
            <Select label="Státusz" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Megjegyzés"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            size="small"
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Mégse</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={saving}>
          {saving ? 'Mentés…' : 'Mentés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
