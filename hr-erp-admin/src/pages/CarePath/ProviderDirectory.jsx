import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, Alert, CircularProgress, Tooltip, Grid, Rating
} from '@mui/material';
import { Add, Edit, LocalHospital, Star } from '@mui/icons-material';
import { carepathAPI } from '../../services/api';
import { toast } from 'react-toastify';

const PROVIDER_TYPES = [
  { value: 'counselor', label: 'Tanácsadó' },
  { value: 'therapist', label: 'Terapeuta' },
  { value: 'lawyer', label: 'Ügyvéd' },
  { value: 'financial_advisor', label: 'Pénzügyi tanácsadó' },
  { value: 'crisis_specialist', label: 'Krízis specialista' },
  { value: 'mediator', label: 'Mediátor' },
];

const LANGUAGES = [
  { value: 'hu', label: 'Magyar' }, { value: 'en', label: 'Angol' },
  { value: 'de', label: 'Német' }, { value: 'ro', label: 'Román' },
  { value: 'fr', label: 'Francia' },
];

const EMPTY_FORM = {
  provider_type: 'counselor', full_name: '', credentials: '', email: '', phone: '',
  address_city: '', address_zip: '', bio: '', specialties: '',
  languages: 'hu', is_active: true, geo_location: { lat: '', lng: '' },
};

const ProviderDirectory = () => {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [typeFilter]);

  const load = async () => {
    try {
      setLoading(true);
      const response = await carepathAPI.getProviders({ provider_type: typeFilter || undefined });
      setProviders(response.data || []);
    } catch (err) {
      toast.error('Nem sikerült betölteni');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const openEdit = (p) => {
    setEditId(p.id);
    setForm({
      provider_type: p.provider_type, full_name: p.full_name, credentials: p.credentials || '',
      email: p.email || '', phone: p.phone || '', address_city: p.address_city || '',
      address_zip: p.address_zip || '', bio: p.bio || '',
      specialties: (p.specialties || []).join(', '), languages: (p.languages || ['hu']).join(','),
      is_active: p.is_active, geo_location: { lat: p.geo_lat || '', lng: p.geo_lng || '' },
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name || !form.email) { toast.warning('Név és email kötelező'); return; }
    try {
      setSaving(true);
      const payload = {
        ...form,
        specialties: form.specialties.split(',').map(s => s.trim()).filter(Boolean),
        languages: form.languages.split(',').map(s => s.trim()).filter(Boolean),
        geo_location: form.geo_location.lat && form.geo_location.lng
          ? { lat: parseFloat(form.geo_location.lat), lng: parseFloat(form.geo_location.lng) }
          : undefined,
      };
      delete payload.is_active; // Don't send on create

      if (editId) {
        payload.is_active = form.is_active;
        await carepathAPI.updateProvider(editId, payload);
        toast.success('Szolgáltató frissítve');
      } else {
        await carepathAPI.createProvider(payload);
        toast.success('Szolgáltató létrehozva');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = (t) => PROVIDER_TYPES.find(pt => pt.value === t)?.label || t;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          <LocalHospital sx={{ mr: 1, verticalAlign: 'middle' }} />
          Szolgáltatók
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Típus</InputLabel>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} label="Típus">
              <MenuItem value="">Mind</MenuItem>
              {PROVIDER_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </Select>
          </FormControl>
          <Button startIcon={<Add />} variant="contained" onClick={openCreate}>Új szolgáltató</Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Város</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Értékelés</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Munkamenetek</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Szakterületek</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {providers.map((p) => (
                <TableRow key={p.id} hover sx={{ opacity: p.is_active ? 1 : 0.5 }}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.full_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.credentials}</Typography>
                  </TableCell>
                  <TableCell><Chip label={typeLabel(p.provider_type)} size="small" variant="outlined" /></TableCell>
                  <TableCell>{p.address_city || '—'}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Star sx={{ fontSize: 16, color: '#f59e0b' }} />
                      <Typography variant="body2">{parseFloat(p.rating || 0).toFixed(1)}</Typography>
                      <Typography variant="caption" color="text.secondary">({p.total_ratings || 0})</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{p.total_sessions_completed || 0}</TableCell>
                  <TableCell>
                    {(p.specialties || []).slice(0, 2).map((s, i) => (
                      <Chip key={i} label={s} size="small" sx={{ mr: 0.5, mb: 0.5 }} variant="outlined" />
                    ))}
                    {(p.specialties || []).length > 2 && <Chip label={`+${p.specialties.length - 2}`} size="small" />}
                  </TableCell>
                  <TableCell>
                    <Chip label={p.is_active ? 'Aktív' : 'Inaktív'} color={p.is_active ? 'success' : 'default'} size="small" />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Szerkesztés"><IconButton size="small" onClick={() => openEdit(p)}><Edit fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Provider Form Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editId ? 'Szolgáltató szerkesztése' : 'Új szolgáltató'}</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Típus</InputLabel>
                <Select value={form.provider_type} onChange={(e) => setForm(f => ({ ...f, provider_type: e.target.value }))} label="Típus">
                  {PROVIDER_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Teljes név" value={form.full_name} onChange={(e) => setForm(f => ({ ...f, full_name: e.target.value }))} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Képesítés" value={form.credentials} onChange={(e) => setForm(f => ({ ...f, credentials: e.target.value }))} placeholder="PhD, klinikai szakpszichológus" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Email" type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Telefon" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+36-20-XXX-XXXX" />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth label="Város" value={form.address_city} onChange={(e) => setForm(f => ({ ...f, address_city: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={2}>
              <TextField fullWidth label="Ir.szám" value={form.address_zip} onChange={(e) => setForm(f => ({ ...f, address_zip: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Szakterületek (vesszővel elválasztva)" value={form.specialties}
                onChange={(e) => setForm(f => ({ ...f, specialties: e.target.value }))}
                placeholder="szorongás, depresszió, kiégés, munkahelyi stressz" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Nyelvek (kódok, vesszővel)" value={form.languages}
                onChange={(e) => setForm(f => ({ ...f, languages: e.target.value }))}
                placeholder="hu,en,de" helperText="ISO kódok: hu, en, de, ro, fr" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth label="Szélesség (lat)" type="number" value={form.geo_location.lat}
                onChange={(e) => setForm(f => ({ ...f, geo_location: { ...f.geo_location, lat: e.target.value } }))}
                placeholder="47.4979" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth label="Hosszúság (lng)" type="number" value={form.geo_location.lng}
                onChange={(e) => setForm(f => ({ ...f, geo_location: { ...f.geo_location, lng: e.target.value } }))}
                placeholder="19.0402" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Bemutatkozás" value={form.bio} onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))} multiline rows={3} />
            </Grid>
            {editId && (
              <Grid item xs={12}>
                <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} />} label="Aktív" />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Mégse</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProviderDirectory;
