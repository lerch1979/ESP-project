import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Grid, FormControl, InputLabel, Select, MenuItem,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { tasksAPI, usersAPI } from '../services/api';

const PRIORITY_OPTIONS = [
  { value: 'low',      label: 'Alacsony' },
  { value: 'medium',   label: 'Közepes' },
  { value: 'high',     label: 'Magas' },
  { value: 'critical', label: 'Kritikus' },
];

// Free-text category — stored into tasks.tags[] for now so we don't need
// a schema change; the filter pages read tags for grouping.
const CATEGORY_OPTIONS = [
  { value: 'general',       label: 'Általános' },
  { value: 'hr',            label: 'HR' },
  { value: 'accommodation', label: 'Szállás' },
  { value: 'maintenance',   label: 'Karbantartás' },
  { value: 'documents',     label: 'Dokumentumok' },
  { value: 'other',         label: 'Egyéb' },
];

const emptyForm = {
  assigned_to: '',
  title: '',
  description: '',
  due_date: '',
  due_time: '',
  priority: 'medium',
  category: 'general',
};

export default function TaskCreationModal({
  open,
  onClose,
  onSuccess,
  relatedEmployeeId,
  prefillTitle,
}) {
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm, title: prefillTitle || '' });
    loadUsers();
  }, [open, prefillTitle]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await usersAPI.getAll({ limit: 500 });
      // usersAPI response shape varies — support both {data: {users}} and {data: []}
      const list = res?.data?.users || res?.data || [];
      setUsers(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Felhasználók betöltése sikertelen');
    } finally {
      setLoadingUsers(false);
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) return toast.warn('A cím kötelező');
    if (!form.assigned_to) return toast.warn('Válassz felelőst');

    // Combine date + time into a due_date the backend can store; column is
    // `date`, so we only send the date portion — the time lives in the
    // description when provided, keeping the wire format simple.
    let dueDate = form.due_date || null;
    let descSuffix = '';
    if (form.due_time) descSuffix = `\n\n⏰ Időpont: ${form.due_time}`;

    setSaving(true);
    try {
      const res = await tasksAPI.createStandalone({
        title: form.title.trim(),
        description: (form.description || '') + descSuffix,
        priority: form.priority,
        assigned_to: form.assigned_to,
        due_date: dueDate,
        tags: [form.category],
        related_employee_id: relatedEmployeeId || null,
      });
      if (res.success) {
        toast.success('Feladat létrehozva');
        if (onSuccess) onSuccess(res.data?.task);
        close();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Feladat létrehozása sikertelen');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (saving) return;
    setForm(emptyForm);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Új feladat</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12}>
            <FormControl fullWidth size="small" disabled={loadingUsers}>
              <InputLabel>Felelős *</InputLabel>
              <Select
                value={form.assigned_to}
                onChange={e => setField('assigned_to', e.target.value)}
                label="Felelős *"
              >
                {loadingUsers ? (
                  <MenuItem value=""><em>Betöltés…</em></MenuItem>
                ) : (
                  users.map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth size="small" label="Cím *"
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              autoFocus
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth size="small" multiline rows={3} label="Leírás / jegyzet"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
            />
          </Grid>

          <Grid item xs={7}>
            <TextField
              fullWidth size="small" type="date" label="Határidő"
              InputLabelProps={{ shrink: true }}
              value={form.due_date}
              onChange={e => setField('due_date', e.target.value)}
            />
          </Grid>
          <Grid item xs={5}>
            <TextField
              fullWidth size="small" type="time" label="Időpont"
              InputLabelProps={{ shrink: true }}
              value={form.due_time}
              onChange={e => setField('due_time', e.target.value)}
            />
          </Grid>

          <Grid item xs={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Prioritás</InputLabel>
              <Select
                value={form.priority}
                onChange={e => setField('priority', e.target.value)}
                label="Prioritás"
              >
                {PRIORITY_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth size="small">
              <InputLabel>Kategória</InputLabel>
              <Select
                value={form.category}
                onChange={e => setField('category', e.target.value)}
                label="Kategória"
              >
                {CATEGORY_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} disabled={saving}>Mégse</Button>
        <Button
          onClick={submit}
          variant="contained"
          disabled={saving}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          {saving ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
