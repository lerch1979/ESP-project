import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Switch, Chip,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';

const CATEGORIES = [
  { value: 'house_rules', label: 'Házirend' },
  { value: 'cleaning',    label: 'Takarítás' },
  { value: 'behavior',    label: 'Viselkedés' },
  { value: 'other',       label: 'Egyéb' },
];

const emptyForm = { code: '', name: '', amount_per_person: '', category: 'house_rules', description: '', is_active: true };

export default function FineTypesManagement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState({ open: false, form: emptyForm, id: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inspectionsAPI.listFineTypes({ active: 'false' });
      setRows(res?.data || []);
    } catch {
      toast.error('Bírság típusok betöltése sikertelen');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => setEditor({ open: true, form: emptyForm, id: null });
  const openEdit   = (r) => setEditor({
    open: true,
    form: {
      code: r.code, name: r.name,
      amount_per_person: String(r.amount_per_person),
      category: r.category || 'other',
      description: r.description || '',
      is_active: !!r.is_active,
    },
    id: r.id,
  });

  const save = async () => {
    const f = editor.form;
    if (!f.name.trim()) return toast.warn('Név kötelező');
    if (!f.amount_per_person || Number(f.amount_per_person) < 0) return toast.warn('Összeg kötelező');
    const payload = {
      ...f,
      amount_per_person: Number(f.amount_per_person),
    };
    try {
      if (editor.id) {
        await inspectionsAPI.updateFineType(editor.id, payload);
      } else {
        if (!f.code.trim()) return toast.warn('Kód kötelező');
        await inspectionsAPI.createFineType(payload);
      }
      toast.success('Mentve');
      setEditor({ open: false, form: emptyForm, id: null });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Mentés sikertelen');
    }
  };

  const deactivate = async (r) => {
    if (!window.confirm(`Inaktívvá teszed: ${r.name}?`)) return;
    try {
      await inspectionsAPI.deleteFineType(r.id);
      toast.success('Inaktiválva');
      load();
    } catch {
      toast.error('Művelet sikertelen');
    }
  };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Bírság típusok</Typography>
            <Typography variant="body2" color="text.secondary">
              Fix összegű bírságok katalógusa (személyenként kiszabva)
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Új típus</Button>
        </Stack>
      </Paper>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Kód</TableCell>
                <TableCell>Név</TableCell>
                <TableCell>Kategória</TableCell>
                <TableCell align="right">Összeg/fő</TableCell>
                <TableCell>Állapot</TableCell>
                <TableCell align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={6}>Betöltés…</TableCell></TableRow>}
              {rows.map(r => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{r.code}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                  <TableCell>{CATEGORIES.find(c => c.value === r.category)?.label || r.category || '—'}</TableCell>
                  <TableCell align="right">{Number(r.amount_per_person).toLocaleString('hu-HU')} HUF</TableCell>
                  <TableCell>
                    <Chip size="small"
                      label={r.is_active ? 'Aktív' : 'Inaktív'}
                      color={r.is_active ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton>
                    {r.is_active && (
                      <IconButton size="small" color="error" onClick={() => deactivate(r)}><DeleteIcon fontSize="small" /></IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>Nincs bírság típus.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={editor.open} onClose={() => setEditor({ ...editor, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>{editor.id ? 'Szerkesztés' : 'Új bírság típus'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Kód *" required disabled={!!editor.id}
              value={editor.form.code}
              onChange={e => setEditor({ ...editor, form: { ...editor.form, code: e.target.value.toUpperCase() } })}
              placeholder="NOISE_COMPLAINT"
            />
            <TextField label="Név *" required
              value={editor.form.name}
              onChange={e => setEditor({ ...editor, form: { ...editor.form, name: e.target.value } })}
            />
            <TextField label="Összeg / fő *" type="number" required
              value={editor.form.amount_per_person}
              onChange={e => setEditor({ ...editor, form: { ...editor.form, amount_per_person: e.target.value } })}
            />
            <FormControl fullWidth>
              <InputLabel>Kategória</InputLabel>
              <Select value={editor.form.category} label="Kategória"
                onChange={e => setEditor({ ...editor, form: { ...editor.form, category: e.target.value } })}
              >
                {CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Leírás" multiline rows={2}
              value={editor.form.description}
              onChange={e => setEditor({ ...editor, form: { ...editor.form, description: e.target.value } })}
            />
            {editor.id && (
              <Stack direction="row" alignItems="center" spacing={1}>
                <Switch checked={editor.form.is_active}
                  onChange={e => setEditor({ ...editor, form: { ...editor.form, is_active: e.target.checked } })}
                />
                <Typography>Aktív</Typography>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditor({ ...editor, open: false })}>Mégsem</Button>
          <Button variant="contained" onClick={save}>Mentés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
