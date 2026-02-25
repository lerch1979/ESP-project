import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, CircularProgress, Divider,
  MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { toast } from 'react-toastify';

const PROJECT_STATUSES = [
  { value: 'planning', label: 'Tervezés' },
  { value: 'active', label: 'Aktív' },
  { value: 'on_hold', label: 'Szünetel' },
  { value: 'completed', label: 'Befejezett' },
  { value: 'cancelled', label: 'Törölve' },
];

const PROJECT_PRIORITIES = [
  { value: 'low', label: 'Alacsony' },
  { value: 'medium', label: 'Közepes' },
  { value: 'high', label: 'Magas' },
  { value: 'critical', label: 'Kritikus' },
];

const INITIAL_FORM = {
  name: '', code: '', description: '', start_date: '', end_date: '',
  status: 'planning', priority: 'medium', budget: '',
  cost_center_id: '', project_manager_id: '',
};

export default function ProjectFormModal({
  open, onClose, onSave, editData,
  users = [], costCenters = [],
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        name: editData.name || '',
        code: editData.code || '',
        description: editData.description || '',
        start_date: editData.start_date ? editData.start_date.substring(0, 10) : '',
        end_date: editData.end_date ? editData.end_date.substring(0, 10) : '',
        status: editData.status || 'planning',
        priority: editData.priority || 'medium',
        budget: editData.budget || '',
        cost_center_id: editData.cost_center_id || '',
        project_manager_id: editData.project_manager_id || '',
      });
    } else {
      setForm(INITIAL_FORM);
    }
  }, [editData, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Projekt név megadása kötelező');
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...form,
        budget: form.budget ? parseFloat(form.budget) : null,
        cost_center_id: form.cost_center_id || null,
        project_manager_id: form.project_manager_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      };
      await onSave(data);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{editData ? 'Projekt szerkesztése' : 'Új projekt létrehozása'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Alapadatok</Typography>

          <TextField
            label="Projekt neve *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            size="small"
            fullWidth
          />

          <Stack direction="row" spacing={2}>
            <TextField
              label="Projektkód"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              size="small"
              sx={{ flex: 1 }}
              placeholder="pl. PROJ-001"
            />
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Státusz</InputLabel>
              <Select
                value={form.status}
                label="Státusz"
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {PROJECT_STATUSES.map(s => (
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
                {PROJECT_PRIORITIES.map(p => (
                  <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <TextField
            label="Leírás"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            size="small"
            fullWidth
            multiline
            rows={3}
          />

          <Divider />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Időzítés és költségvetés</Typography>

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
              label="Befejező dátum"
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              size="small"
              sx={{ flex: 1 }}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          <TextField
            label="Költségvetés (HUF)"
            type="number"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
            size="small"
            fullWidth
          />

          <Divider />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Hozzárendelés</Typography>

          <Stack direction="row" spacing={2}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Projektvezető</InputLabel>
              <Select
                value={form.project_manager_id}
                label="Projektvezető"
                onChange={(e) => setForm({ ...form, project_manager_id: e.target.value })}
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
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Költségközpont</InputLabel>
              <Select
                value={form.cost_center_id}
                label="Költségközpont"
                onChange={(e) => setForm({ ...form, cost_center_id: e.target.value })}
              >
                <MenuItem value="">
                  <em>Nincs kiválasztva</em>
                </MenuItem>
                {costCenters.map(cc => (
                  <MenuItem key={cc.id} value={cc.id}>
                    {cc.code ? `${cc.code} - ` : ''}{cc.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
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
