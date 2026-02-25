import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, CircularProgress, Divider, Typography,
  MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { toast } from 'react-toastify';

const TASK_STATUSES = [
  { value: 'todo', label: 'Teendő' },
  { value: 'in_progress', label: 'Folyamatban' },
  { value: 'review', label: 'Ellenőrzés' },
  { value: 'done', label: 'Kész' },
  { value: 'blocked', label: 'Blokkolva' },
];

const TASK_PRIORITIES = [
  { value: 'low', label: 'Alacsony' },
  { value: 'medium', label: 'Közepes' },
  { value: 'high', label: 'Magas' },
  { value: 'critical', label: 'Kritikus' },
];

const INITIAL_FORM = {
  title: '', description: '', status: 'todo', priority: 'medium',
  assigned_to: '', start_date: '', due_date: '', estimated_hours: '',
  tags: '', parent_task_id: '',
};

export default function TaskFormModal({
  open, onClose, onSave, editData,
  users = [], tasks = [], projectId,
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        title: editData.title || '',
        description: editData.description || '',
        status: editData.status || 'todo',
        priority: editData.priority || 'medium',
        assigned_to: editData.assigned_to || '',
        start_date: editData.start_date ? editData.start_date.substring(0, 10) : '',
        due_date: editData.due_date ? editData.due_date.substring(0, 10) : '',
        estimated_hours: editData.estimated_hours || '',
        tags: editData.tags || '',
        parent_task_id: editData.parent_task_id || '',
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [editData, open]);

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Feladat cím megadása kötelező');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...form,
        assigned_to: form.assigned_to || null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
        tags: form.tags || null,
        parent_task_id: form.parent_task_id || null,
      };
      await onSave(data);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  // Only show parent tasks that are not the task being edited
  const parentTaskOptions = tasks.filter(t => !editData || t.id !== editData.id);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editData ? 'Feladat szerkesztése' : 'Új feladat létrehozása'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="Feladat címe *"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            size="small"
            fullWidth
          />

          <TextField
            label="Leírás"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            size="small"
            fullWidth
            multiline
            rows={3}
          />

          <Stack direction="row" spacing={2}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Státusz</InputLabel>
              <Select
                value={form.status}
                label="Státusz"
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {TASK_STATUSES.map(s => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Prioritás</InputLabel>
              <Select
                value={form.priority}
                label="Prioritás"
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              >
                {TASK_PRIORITIES.map(p => (
                  <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <FormControl size="small" fullWidth>
            <InputLabel>Felelős</InputLabel>
            <Select
              value={form.assigned_to}
              label="Felelős"
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            >
              <MenuItem value="">
                <em>Nincs kiválasztva</em>
              </MenuItem>
              {users.map(u => (
                <MenuItem key={u.id} value={u.id}>
                  {u.last_name} {u.first_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Időzítés</Typography>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Kezdő dátum"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              size="small"
              sx={{ flex: 1 }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Határidő"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              size="small"
              sx={{ flex: 1 }}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          <TextField
            label="Becsült óraszám"
            type="number"
            value={form.estimated_hours}
            onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
            size="small"
            fullWidth
          />

          <TextField
            label="Címkék (vesszővel elválasztva)"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            size="small"
            fullWidth
            placeholder="pl. frontend, urgent, bug"
          />

          {parentTaskOptions.length > 0 && (
            <FormControl size="small" fullWidth>
              <InputLabel>Szülő feladat</InputLabel>
              <Select
                value={form.parent_task_id}
                label="Szülő feladat"
                onChange={(e) => setForm({ ...form, parent_task_id: e.target.value })}
              >
                <MenuItem value="">
                  <em>Nincs (fő feladat)</em>
                </MenuItem>
                {parentTaskOptions.map(t => (
                  <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? <CircularProgress size={22} /> : editData ? 'Mentés' : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
