import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Switch, Chip, CircularProgress, MenuItem,
  TextField, Autocomplete, FormControl, InputLabel, Select, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { workerSpecializationsAPI, employeesAPI, usersAPI } from '../../services/api';

const emptyForm = {
  user_id: '',
  specialization: '',
  is_primary: false,
  certification_expiry: '',
  notes: '',
};

// Cert is meaningful only for gas (per migration 102 + spec).
const CERT_REQUIRED_SPECS = new Set(['gas']);

function isExpired(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getTime() < Date.now();
}

function isExpiringSoon(dateStr, days = 30) {
  if (!dateStr) return false;
  const d = new Date(dateStr).getTime();
  const cutoff = Date.now() + days * 24 * 3600 * 1000;
  return d >= Date.now() && d <= cutoff;
}

export default function WorkerSpecializations() {
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterSpec, setFilterSpec] = useState('');
  const [filterActive, setFilterActive] = useState('');

  // Editor
  const [editor, setEditor] = useState({ open: false, form: emptyForm, id: null });

  const typesById = useMemo(() => {
    const m = new Map();
    for (const t of types) m.set(t.slug, t);
    return m;
  }, [types]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterSpec)   params.specialization = filterSpec;
      if (filterActive) params.is_active = filterActive;
      const res = await workerSpecializationsAPI.list(params);
      setRows(res?.data?.specializations || []);
    } catch {
      toast.error('Szakértelmek betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [filterSpec, filterActive]);

  useEffect(() => {
    (async () => {
      try {
        const [tRes, uRes] = await Promise.allSettled([
          workerSpecializationsAPI.listTypes(),
          usersAPI.getAll({ limit: 1000 }),
        ]);
        if (tRes.status === 'fulfilled') setTypes(tRes.value?.data?.types || []);
        if (uRes.status === 'fulfilled') {
          const list = uRes.value?.data?.users || uRes.value?.data || [];
          setUsers(Array.isArray(list) ? list : []);
        }
      } catch {
        toast.error('Lookup adatok betöltése sikertelen');
      }
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => setEditor({ open: true, form: emptyForm, id: null });
  const openEdit = (r) => setEditor({
    open: true,
    id: r.id,
    form: {
      user_id: r.user_id,
      specialization: r.specialization,
      is_primary: !!r.is_primary,
      certification_expiry: r.certification_expiry ? r.certification_expiry.slice(0, 10) : '',
      notes: r.notes || '',
    },
  });
  const close = () => setEditor({ open: false, form: emptyForm, id: null });

  const save = async () => {
    const f = editor.form;
    if (!f.user_id)        return toast.warn('Válassz munkavállalót');
    if (!f.specialization) return toast.warn('Válassz szakértelmet');
    try {
      const payload = {
        user_id: f.user_id,
        specialization: f.specialization,
        is_primary: f.is_primary,
        certification_expiry: f.certification_expiry || null,
        notes: f.notes || null,
      };
      if (editor.id) {
        // PATCH only sends what changed in spirit; backend handles partial update
        await workerSpecializationsAPI.update(editor.id, payload);
        toast.success('Szakértelem frissítve');
      } else {
        await workerSpecializationsAPI.create(payload);
        toast.success('Szakértelem létrehozva');
      }
      close();
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Mentés sikertelen');
    }
  };

  const toggleActive = async (row) => {
    try {
      await workerSpecializationsAPI.update(row.id, { is_active: !row.is_active });
      load();
    } catch {
      toast.error('Aktiválás váltása sikertelen');
    }
  };

  const remove = async (row) => {
    if (!confirm(`Biztosan törlöd? ${row.first_name} ${row.last_name} – ${row.specialization}`)) return;
    try {
      await workerSpecializationsAPI.remove(row.id);
      toast.success('Törölve');
      load();
    } catch {
      toast.error('Törlés sikertelen');
    }
  };

  const certNeeded = CERT_REQUIRED_SPECS.has(editor.form.specialization);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Munkavállalók szakértelme</Typography>
          <Typography variant="body2" color="text.secondary">
            Az automatikus hozzárendelés ezeket a szakértelmeket használja.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Új hozzáadás
        </Button>
      </Stack>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Szakértelem</InputLabel>
            <Select
              value={filterSpec}
              label="Szakértelem"
              onChange={e => setFilterSpec(e.target.value)}
            >
              <MenuItem value=""><em>Mindegyik</em></MenuItem>
              {types.map(t => (
                <MenuItem key={t.slug} value={t.slug}>{t.icon} {t.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Állapot</InputLabel>
            <Select
              value={filterActive}
              label="Állapot"
              onChange={e => setFilterActive(e.target.value)}
            >
              <MenuItem value=""><em>Mindegyik</em></MenuItem>
              <MenuItem value="true">Aktív</MenuItem>
              <MenuItem value="false">Inaktív</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Munkavállaló</TableCell>
                  <TableCell>Szakértelem</TableCell>
                  <TableCell>Tanúsítvány lejár</TableCell>
                  <TableCell>Elsődleges</TableCell>
                  <TableCell>Aktív</TableCell>
                  <TableCell align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center"><em>Nincs adat</em></TableCell></TableRow>
                ) : rows.map(r => {
                  const t = typesById.get(r.specialization);
                  const expired = isExpired(r.certification_expiry);
                  const expiring = isExpiringSoon(r.certification_expiry);
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <strong>{[r.first_name, r.last_name].filter(Boolean).join(' ') || r.email}</strong>
                        <Typography variant="caption" display="block" color="text.secondary">
                          {r.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={`${t?.icon || ''} ${t?.name || r.specialization}`}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {r.certification_expiry ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <span>{new Date(r.certification_expiry).toLocaleDateString('hu-HU')}</span>
                            {expired && (
                              <Tooltip title="Lejárt!"><WarningIcon color="error" fontSize="small" /></Tooltip>
                            )}
                            {!expired && expiring && (
                              <Tooltip title="30 napon belül lejár"><WarningIcon color="warning" fontSize="small" /></Tooltip>
                            )}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>{r.is_primary ? '⭐' : ''}</TableCell>
                      <TableCell>
                        <Switch checked={!!r.is_active} onChange={() => toggleActive(r)} />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton size="small" color="error" onClick={() => remove(r)}><DeleteIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Editor */}
      <Dialog open={editor.open} onClose={close} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {editor.id ? 'Szakértelem szerkesztése' : 'Új szakértelem hozzáadása'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Autocomplete
              options={users}
              value={users.find(u => u.id === editor.form.user_id) || null}
              onChange={(_, val) =>
                setEditor(s => ({ ...s, form: { ...s.form, user_id: val?.id || '' } }))
              }
              getOptionLabel={(u) => {
                const name = [u.first_name, u.last_name].filter(Boolean).join(' ');
                return name ? `${name} (${u.email})` : u.email;
              }}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField {...params} label="Munkavállaló *" placeholder="Név vagy email" />
              )}
              disabled={!!editor.id} // can't change user on existing row (unique constraint)
              noOptionsText="Nincs találat"
            />
            <FormControl fullWidth>
              <InputLabel>Szakértelem *</InputLabel>
              <Select
                value={editor.form.specialization}
                label="Szakértelem *"
                onChange={e => setEditor(s => ({ ...s, form: { ...s.form, specialization: e.target.value } }))}
              >
                <MenuItem value=""><em>Válassz...</em></MenuItem>
                {types.map(t => (
                  <MenuItem key={t.slug} value={t.slug}>
                    {t.icon} {t.name} {t.requiresCertification ? '(tanúsítvány szükséges)' : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              type="date"
              label={`Tanúsítvány lejárata${certNeeded ? ' *' : ''}`}
              InputLabelProps={{ shrink: true }}
              value={editor.form.certification_expiry}
              onChange={e => setEditor(s => ({ ...s, form: { ...s.form, certification_expiry: e.target.value } }))}
              helperText={certNeeded ? 'Gáz szakértelemhez kötelező' : 'Opcionális'}
            />

            <TextField
              label="Megjegyzés"
              multiline rows={2}
              value={editor.form.notes}
              onChange={e => setEditor(s => ({ ...s, form: { ...s.form, notes: e.target.value } }))}
            />

            <Box>
              <Switch
                checked={editor.form.is_primary}
                onChange={e => setEditor(s => ({ ...s, form: { ...s.form, is_primary: e.target.checked } }))}
              />
              <span>Elsődleges szakértelem (⭐)</span>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Mégse</Button>
          <Button variant="contained" onClick={save}>Mentés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
