import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';

const INITIAL_FORM = {
  hours: '',
  work_date: new Date().toISOString().substring(0, 10),
  description: '',
};

export default function TimesheetDialog({ open, onClose, onSave, taskId, taskTitle }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ...INITIAL_FORM,
        work_date: new Date().toISOString().substring(0, 10),
      });
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!form.hours || parseFloat(form.hours) <= 0) {
      toast.error('Érvényes óraszám megadása kötelező');
      return;
    }
    if (!form.work_date) {
      toast.error('Dátum megadása kötelező');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        task_id: taskId,
        hours: parseFloat(form.hours),
        work_date: form.work_date,
        description: form.description || null,
      });
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Munkaidő rögzítése</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {taskTitle && (
            <TextField
              label="Feladat"
              value={taskTitle}
              size="small"
              fullWidth
              disabled
            />
          )}

          <TextField
            label="Óraszám *"
            type="number"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
            size="small"
            fullWidth
            inputProps={{ min: 0.25, max: 24, step: 0.25 }}
          />

          <TextField
            label="Dátum *"
            type="date"
            value={form.work_date}
            onChange={(e) => setForm({ ...form, work_date: e.target.value })}
            size="small"
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label="Megjegyzés"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            size="small"
            fullWidth
            multiline
            rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {saving ? <CircularProgress size={22} /> : 'Rögzítés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
