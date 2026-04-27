import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Grid, CircularProgress, Tabs, Tab, Box,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Autocomplete, Chip, InputAdornment,
} from '@mui/material';
import { toast } from 'react-toastify';
import { damageReportsAPI, accommodationsAPI } from '../services/api';

// Status set mirrors STATUS_COLORS in DamageReportDetail. Only statuses
// that are pre-finalization are allowed as edit targets — we cannot
// move a paid/disputed/cancelled report back into a working state.
const STATUS_OPTIONS = [
  { value: 'draft',                  label: 'Vázlat' },
  { value: 'pending_review',         label: 'Felülvizsgálatra vár' },
  { value: 'pending_acknowledgment', label: 'Elismerésre vár' },
];

// Liability types — must match the damage_reports.liability_type CHECK
// constraint. Any other value will be rejected by Postgres at INSERT time.
const LIABILITY_OPTIONS = [
  { value: 'intentional',   label: 'Szándékos' },
  { value: 'negligence',    label: 'Gondatlanság' },
  { value: 'normal_wear',   label: 'Természetes elhasználódás' },
  { value: 'force_majeure', label: 'Vis maior' },
];

// Local helpers
const dateOnly = (s) => s ? String(s).slice(0, 10) : '';
const numOrNull = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);
const eq = (a, b) => (a == null ? '' : String(a)) === (b == null ? '' : String(b));

function buildInitialForm(r) {
  if (!r) return null;
  return {
    description:           r.description || '',
    incident_date:         dateOnly(r.incident_date),
    discovery_date:        dateOnly(r.discovery_date),
    status:                r.status || 'draft',
    accommodation_id:      r.accommodation_id || '',
    room_id:               r.room_id || '',
    liability_type:        r.liability_type || '',
    fault_percentage:      r.fault_percentage ?? '',
    total_cost:            r.total_cost ?? '',
    employee_salary:       r.employee_salary ?? '',
    employee_acknowledged: !!r.employee_acknowledged,
    witness_name:          r.witness_name || '',
    notes:                 r.notes || '',
  };
}

/**
 * Damage report edit form, grouped into tabs to keep the UI scannable.
 * Highlights changed fields against the original report and validates
 * required + numeric ranges next to each input.
 */
export default function DamageReportEditModal({ open, report, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);
  const [accommodations, setAccommodations] = useState([]);
  const [form, setForm] = useState(() => buildInitialForm(report));

  const original = useMemo(() => buildInitialForm(report), [report]);

  // Reset form whenever the modal opens (or the underlying report changes).
  useEffect(() => {
    if (!open) return;
    setForm(buildInitialForm(report));
    setTab(0);
  }, [open, report]);

  // Lazy-load accommodations the first time the modal opens.
  useEffect(() => {
    if (!open || accommodations.length) return;
    (async () => {
      try {
        const res = await accommodationsAPI.getAll({ limit: 500 });
        const list = res?.data?.accommodations || res?.data || [];
        setAccommodations(Array.isArray(list) ? list : []);
      } catch { /* non-fatal */ }
    })();
  }, [open, accommodations.length]);

  const setField = (k, v) => setForm(s => ({ ...s, [k]: v }));

  // Per-field "is dirty" map drives the highlight chip + amber outline.
  const dirty = useMemo(() => {
    if (!form || !original) return {};
    const d = {};
    for (const k of Object.keys(form)) {
      d[k] = !eq(form[k], original[k]);
    }
    return d;
  }, [form, original]);

  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  // ── Validation ────────────────────────────────────────────────────────
  const errors = useMemo(() => {
    if (!form) return {};
    const e = {};
    if (!form.description?.trim()) e.description = 'Kötelező';
    if (!form.incident_date)       e.incident_date = 'Kötelező';
    if (form.fault_percentage !== '' && form.fault_percentage !== null) {
      const n = Number(form.fault_percentage);
      if (Number.isNaN(n) || n < 0 || n > 100) e.fault_percentage = '0–100 között';
    }
    if (form.total_cost !== '' && form.total_cost !== null) {
      const n = Number(form.total_cost);
      if (Number.isNaN(n) || n < 0) e.total_cost = 'Nem lehet negatív';
    }
    if (form.employee_salary !== '' && form.employee_salary !== null) {
      const n = Number(form.employee_salary);
      if (Number.isNaN(n) || n < 0) e.employee_salary = 'Nem lehet negatív';
    }
    return e;
  }, [form]);

  const hasErrors = Object.keys(errors).length > 0;

  // Highlight wrapper — amber underline + small "módosítva" chip.
  const highlightSx = (changed) => changed ? {
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b !important' },
    '& .MuiOutlinedInput-notchedOutline:hover': { borderColor: '#d97706 !important' },
  } : {};

  const submit = async () => {
    if (hasErrors) {
      toast.warn('Javítsd a hibákat mentés előtt');
      return;
    }
    if (!form || !original) return;
    setSaving(true);
    try {
      // Only send changed fields. Convert empty strings to null for
      // optional columns; coerce numeric strings to numbers.
      const numericKeys = new Set(['fault_percentage', 'total_cost', 'employee_salary']);
      const patch = {};
      for (const k of Object.keys(form)) {
        if (!dirty[k]) continue;
        let v = form[k];
        if (numericKeys.has(k)) v = numOrNull(v);
        else if (typeof v === 'string') v = v === '' ? null : v;
        patch[k] = v;
      }
      if (Object.keys(patch).length === 0) {
        toast.info('Nincs változás');
        return onClose();
      }
      const res = await damageReportsAPI.update(report.id, patch);
      if (res?.success) {
        toast.success(`Kárigény frissítve (${Object.keys(patch).length} mező)`);
        if (onSaved) onSaved(res.data);
        onClose();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Mentés sikertelen');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return null;

  // ── Render helpers ────────────────────────────────────────────────────
  const TabPanel = ({ value, children }) => (
    <Box hidden={tab !== value} sx={{ pt: 2 }}>{children}</Box>
  );

  const ChangedChip = ({ field }) =>
    dirty[field] ? (
      <Chip size="small" label="módosítva" color="warning" sx={{ ml: 1, height: 18, fontSize: 10 }} />
    ) : null;

  return (
    <Dialog open={open} onClose={saving ? null : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1.5rem' }}>
        Kárigény szerkesztése
        {dirtyCount > 0 && (
          <Chip
            size="small"
            label={`${dirtyCount} változás`}
            color="warning"
            sx={{ ml: 2, verticalAlign: 'middle' }}
          />
        )}
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label="Alapadatok" />
          <Tab label="Helyszín" />
          <Tab label="Kár & költség" />
          <Tab label="Megjegyzés" />
        </Tabs>

        {/* ── Alapadatok ──────────────────────────────────────────── */}
        <TabPanel value={0}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth multiline rows={4} required
                label={<>Leírás <ChangedChip field="description" /></>}
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                error={!!errors.description}
                helperText={errors.description || ' '}
                sx={highlightSx(dirty.description)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="date" required
                label={<>Esemény napja <ChangedChip field="incident_date" /></>}
                InputLabelProps={{ shrink: true }}
                value={form.incident_date}
                onChange={e => setField('incident_date', e.target.value)}
                error={!!errors.incident_date}
                helperText={errors.incident_date || ' '}
                sx={highlightSx(dirty.incident_date)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="date"
                label={<>Felfedezés napja <ChangedChip field="discovery_date" /></>}
                InputLabelProps={{ shrink: true }}
                value={form.discovery_date}
                onChange={e => setField('discovery_date', e.target.value)}
                sx={highlightSx(dirty.discovery_date)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth sx={highlightSx(dirty.status)}>
                <InputLabel>Állapot</InputLabel>
                <Select
                  value={form.status}
                  label="Állapot"
                  onChange={e => setField('status', e.target.value)}
                >
                  {STATUS_OPTIONS.map(o => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={<>Tanú neve <ChangedChip field="witness_name" /></>}
                value={form.witness_name}
                onChange={e => setField('witness_name', e.target.value)}
                sx={highlightSx(dirty.witness_name)}
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* ── Helyszín ────────────────────────────────────────────── */}
        <TabPanel value={1}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={8}>
              <Autocomplete
                options={accommodations}
                value={accommodations.find(a => a.id === form.accommodation_id) || null}
                onChange={(_, val) => setField('accommodation_id', val?.id || '')}
                getOptionLabel={(a) => a?.name || ''}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={<>Szálláshely <ChangedChip field="accommodation_id" /></>}
                    sx={highlightSx(dirty.accommodation_id)}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label={<>Szoba <ChangedChip field="room_id" /></>}
                value={form.room_id}
                onChange={e => setField('room_id', e.target.value)}
                sx={highlightSx(dirty.room_id)}
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* ── Kár & költség ───────────────────────────────────────── */}
        <TabPanel value={2}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth sx={highlightSx(dirty.liability_type)}>
                <InputLabel>Felelősség típusa</InputLabel>
                <Select
                  value={form.liability_type}
                  label="Felelősség típusa"
                  onChange={e => setField('liability_type', e.target.value)}
                >
                  <MenuItem value=""><em>—</em></MenuItem>
                  {LIABILITY_OPTIONS.map(o => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="number"
                label={<>Felróhatóság % <ChangedChip field="fault_percentage" /></>}
                value={form.fault_percentage}
                onChange={e => setField('fault_percentage', e.target.value)}
                error={!!errors.fault_percentage}
                helperText={errors.fault_percentage || '0–100'}
                inputProps={{ min: 0, max: 100, step: 1 }}
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                sx={highlightSx(dirty.fault_percentage)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="number"
                label={<>Teljes költség <ChangedChip field="total_cost" /></>}
                value={form.total_cost}
                onChange={e => setField('total_cost', e.target.value)}
                error={!!errors.total_cost}
                helperText={errors.total_cost || ' '}
                inputProps={{ min: 0, step: 1 }}
                InputProps={{ endAdornment: <InputAdornment position="end">Ft</InputAdornment> }}
                sx={highlightSx(dirty.total_cost)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth type="number"
                label={<>Havi munkabér <ChangedChip field="employee_salary" /></>}
                value={form.employee_salary}
                onChange={e => setField('employee_salary', e.target.value)}
                error={!!errors.employee_salary}
                helperText={errors.employee_salary || 'Részletfizetési terv számításához'}
                inputProps={{ min: 0, step: 1 }}
                InputProps={{ endAdornment: <InputAdornment position="end">Ft</InputAdornment> }}
                sx={highlightSx(dirty.employee_salary)}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!form.employee_acknowledged}
                    onChange={e => setField('employee_acknowledged', e.target.checked)}
                  />
                }
                label={<>A lakó elismeri a felelősséget <ChangedChip field="employee_acknowledged" /></>}
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* ── Megjegyzés ──────────────────────────────────────────── */}
        <TabPanel value={3}>
          <TextField
            fullWidth multiline rows={6}
            label={<>Megjegyzések <ChangedChip field="notes" /></>}
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            sx={highlightSx(dirty.notes)}
          />
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Mégse</Button>
        <Button
          onClick={submit}
          variant="contained"
          disabled={saving || hasErrors || dirtyCount === 0}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          {saving
            ? <CircularProgress size={22} sx={{ color: 'white' }} />
            : `Mentés${dirtyCount > 0 ? ` (${dirtyCount})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
