import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Grid, CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { damageReportsAPI } from '../services/api';

/**
 * Damage report edit form. Updates the subset of fields that admins
 * commonly need to fix after the report is created (description,
 * dates, witness, notes). The backend whitelists what it accepts —
 * see damageReport.service.updateReport.
 *
 * Locked when status is acknowledged/in_payment/paid/cancelled — the
 * caller is responsible for not opening this modal in those cases,
 * but we also disable Save defensively.
 */
export default function DamageReportEditModal({ open, report, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: '', incident_date: '', discovery_date: '',
    witness_name: '', notes: '',
  });

  useEffect(() => {
    if (!open || !report) return;
    setForm({
      description:    report.description || '',
      incident_date:  report.incident_date  ? String(report.incident_date).slice(0, 10) : '',
      discovery_date: report.discovery_date ? String(report.discovery_date).slice(0, 10) : '',
      witness_name:   report.witness_name || '',
      notes:          report.notes || '',
    });
  }, [open, report]);

  const setField = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      // Only send fields that actually changed, to keep the backend's
      // implicit history (updated_at) clean.
      const patch = {};
      const src = {
        description:    report.description || '',
        incident_date:  report.incident_date  ? String(report.incident_date).slice(0, 10) : '',
        discovery_date: report.discovery_date ? String(report.discovery_date).slice(0, 10) : '',
        witness_name:   report.witness_name || '',
        notes:          report.notes || '',
      };
      for (const k of Object.keys(form)) {
        if ((form[k] || '') !== (src[k] || '')) patch[k] = form[k] || null;
      }
      if (Object.keys(patch).length === 0) {
        toast.info('Nincs változás');
        return onClose();
      }
      const res = await damageReportsAPI.update(report.id, patch);
      if (res?.success) {
        toast.success('Kárigény frissítve');
        if (onSaved) onSaved(res.data);
        onClose();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Mentés sikertelen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? null : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1.5rem' }}>Kárigény szerkesztése</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth multiline rows={4} label="Leírás"
              value={form.description}
              onChange={e => setField('description', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth type="date" label="Esemény napja"
              InputLabelProps={{ shrink: true }}
              value={form.incident_date}
              onChange={e => setField('incident_date', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth type="date" label="Felfedezés napja"
              InputLabelProps={{ shrink: true }}
              value={form.discovery_date}
              onChange={e => setField('discovery_date', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth label="Tanú neve"
              value={form.witness_name}
              onChange={e => setField('witness_name', e.target.value)}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth multiline rows={3} label="Megjegyzések"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Mégse</Button>
        <Button
          onClick={submit}
          variant="contained"
          disabled={saving}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          {saving ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Mentés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
