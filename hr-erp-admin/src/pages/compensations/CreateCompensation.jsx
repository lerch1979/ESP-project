import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Stack, Button, TextField, MenuItem, Select, FormControl, InputLabel,
  Grid, Alert, Divider, FormControlLabel, Switch, Autocomplete,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI, accommodationsAPI, employeesAPI } from '../../services/api';

const TYPES = [
  { value: 'damage',             label: 'Kár' },
  { value: 'cleaning',           label: 'Takarítás' },
  { value: 'late_payment',       label: 'Késedelem' },
  { value: 'contract_violation', label: 'Szerződésszegés' },
  { value: 'other',              label: 'Egyéb' },
];

export default function CreateCompensation() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [accommodations, setAccommodations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [inspection, setInspection] = useState(null);
  const [issueNow, setIssueNow] = useState(true);
  const [saving, setSaving] = useState(false);

  const inspectionId = params.get('inspectionId') || '';

  const [form, setForm] = useState({
    inspection_id: inspectionId || '',
    damage_id: '',
    accommodation_id: '',
    room_id: '',
    responsible_user_id: '',
    responsible_name: '',
    responsible_email: '',
    responsible_phone: '',
    compensation_type: 'damage',
    amount_gross: '',
    currency: 'HUF',
    description: '',
    calculation_notes: '',
    remediation_period_days: 14,
    due_date: '',
  });

  const patch = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      try {
        const [accRes, empRes] = await Promise.all([
          accommodationsAPI.getAll(),
          employeesAPI.getAll().catch(() => ({ data: [] })),
        ]);
        setAccommodations(accRes?.data || []);
        setEmployees(empRes?.data || []);
      } catch {
        toast.error('Adatok betöltése sikertelen');
      }
    })();
  }, []);

  useEffect(() => {
    if (!inspectionId) return;
    (async () => {
      try {
        const res = await inspectionsAPI.getById(inspectionId);
        const insp = res?.data || res;
        setInspection(insp);
        setForm(f => ({
          ...f,
          inspection_id: insp.id,
          accommodation_id: insp.accommodationId || '',
          description: f.description || `Az alábbi kártérítési igény a ${insp.inspectionNumber || insp.id} számú ellenőrzésből származik.`,
        }));
      } catch {
        toast.error('Ellenőrzés betöltése sikertelen');
      }
    })();
  }, [inspectionId]);

  const submit = async () => {
    if (!form.description.trim()) return toast.warn('Indoklás kötelező');
    if (!form.amount_gross || Number(form.amount_gross) <= 0) return toast.warn('Összeg kötelező');
    if (!form.responsible_name && !form.responsible_user_id) {
      return toast.warn('Felelős személy megadása kötelező');
    }

    setSaving(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach(k => { if (payload[k] === '' || payload[k] == null) delete payload[k]; });
      if (payload.amount_gross) payload.amount_gross = Number(payload.amount_gross);
      if (payload.remediation_period_days) payload.remediation_period_days = Number(payload.remediation_period_days);

      const res = await inspectionsAPI.createCompensation(payload, { issue: issueNow });
      toast.success(`Létrehozva: ${res?.data?.compensationNumber}`);
      navigate(`/compensations/${res.data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Létrehozás sikertelen');
    } finally {
      setSaving(false);
    }
  };

  const employeeOptions = employees.map(e => ({
    id: e.id,
    label: `${e.first_name || e.firstName || ''} ${e.last_name || e.lastName || ''}`.trim() || e.email || e.id,
    email: e.email,
    phone: e.phone_number || e.phone,
  }));

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>Vissza</Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Új kártérítés</Typography>
      </Stack>

      {inspection && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Kapcsolódó ellenőrzés: <b>{inspection.inspectionNumber || inspection.id}</b>
          {inspection.accommodationName ? ` — ${inspection.accommodationName}` : ''}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12}><Typography variant="subtitle2">Kárigény adatai</Typography><Divider /></Grid>

          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Típus *</InputLabel>
              <Select value={form.compensation_type} label="Típus *" onChange={e => patch('compensation_type', e.target.value)}>
                {TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Bruttó összeg *" type="number" fullWidth
              value={form.amount_gross} onChange={e => patch('amount_gross', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField label="Deviza" fullWidth value={form.currency} onChange={e => patch('currency', e.target.value.toUpperCase())} />
          </Grid>
          <Grid item xs={12} md={2}>
            <TextField
              label="Határidő (napok)" type="number" fullWidth
              value={form.remediation_period_days} onChange={e => patch('remediation_period_days', e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Indoklás / leírás *" fullWidth multiline rows={3}
              value={form.description} onChange={e => patch('description', e.target.value)}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Számítási jegyzet" fullWidth multiline rows={2}
              value={form.calculation_notes} onChange={e => patch('calculation_notes', e.target.value)}
              placeholder="Pl. 2 ágykeret × 35 000 HUF + 10% munkadíj"
            />
          </Grid>

          <Grid item xs={12}><Typography variant="subtitle2" sx={{ mt: 2 }}>Felelős fél</Typography><Divider /></Grid>

          <Grid item xs={12} md={6}>
            <Autocomplete
              options={employeeOptions}
              value={employeeOptions.find(o => o.id === form.responsible_user_id) || null}
              onChange={(_, v) => {
                patch('responsible_user_id', v?.id || '');
                patch('responsible_name', v?.label || form.responsible_name);
                patch('responsible_email', v?.email || form.responsible_email);
                patch('responsible_phone', v?.phone || form.responsible_phone);
              }}
              renderInput={(p) => <TextField {...p} label="Alkalmazott választása" />}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Név *" fullWidth
              value={form.responsible_name} onChange={e => patch('responsible_name', e.target.value)}
              helperText="Külsős fél esetén is kötelező"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField label="E-mail" fullWidth type="email"
              value={form.responsible_email} onChange={e => patch('responsible_email', e.target.value)} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField label="Telefon" fullWidth
              value={form.responsible_phone} onChange={e => patch('responsible_phone', e.target.value)} />
          </Grid>

          <Grid item xs={12}><Typography variant="subtitle2" sx={{ mt: 2 }}>Ingatlan</Typography><Divider /></Grid>

          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Szálláshely</InputLabel>
              <Select value={form.accommodation_id} label="Szálláshely" onChange={e => patch('accommodation_id', e.target.value)}>
                <MenuItem value="">—</MenuItem>
                {accommodations.map(a => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <FormControlLabel
              control={<Switch checked={issueNow} onChange={e => setIssueNow(e.target.checked)} />}
              label="Azonnali kiállítás (állapot: issued, értesítő generálása)"
            />
          </Grid>

          <Grid item xs={12}>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={submit} disabled={saving}>
              {saving ? 'Mentés…' : issueNow ? 'Mentés és kiállítás' : 'Piszkozat mentése'}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
