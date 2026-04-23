import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Switch, Chip, CircularProgress,
  FormControlLabel,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { workplacesAPI } from '../../services/api';

const emptyForm = { name: '', is_active: true };

export default function Workplaces() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState({ open: false, form: emptyForm, id: null });
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workplacesAPI.list();
      setRows(res?.data || []);
    } catch {
      toast.error('Munkahelyek betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => setEditor({ open: true, form: emptyForm, id: null });
  const openEdit = (r) => setEditor({ open: true, form: { name: r.name, is_active: !!r.is_active }, id: r.id });
  const close = () => setEditor({ open: false, form: emptyForm, id: null });

  const save = async () => {
    const f = editor.form;
    if (!f.name.trim()) return toast.warn('A név kötelező');
    try {
      if (editor.id) {
        await workplacesAPI.update(editor.id, f);
        toast.success('Munkahely frissítve');
      } else {
        await workplacesAPI.create(f);
        toast.success('Munkahely létrehozva');
      }
      close();
      load();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Mentés sikertelen';
      toast.error(msg);
    }
  };

  const toggleActive = async (row) => {
    try {
      await workplacesAPI.update(row.id, { is_active: !row.is_active });
      load();
    } catch {
      toast.error('Állapot módosítás sikertelen');
    }
  };

  const confirmRemove = async () => {
    if (!deleting) return;
    try {
      await workplacesAPI.remove(deleting.id);
      toast.success('Munkahely törölve');
      setDeleting(null);
      load();
    } catch {
      toast.error('Törlés sikertelen');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Munkahelyek</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
          Új munkahely
        </Button>
      </Stack>

      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Állapot</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      Nincs munkahely rögzítve. Kattints az „Új munkahely” gombra.
                    </TableCell>
                  </TableRow>
                ) : rows.map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Switch size="small" checked={!!r.is_active} onChange={() => toggleActive(r)} />
                        <Chip size="small" label={r.is_active ? 'Aktív' : 'Inaktív'}
                          color={r.is_active ? 'success' : 'default'} />
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => setDeleting(r)} sx={{ color: '#d32f2f' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={editor.open} onClose={close} maxWidth="sm" fullWidth>
        <DialogTitle>{editor.id ? 'Munkahely szerkesztése' : 'Új munkahely'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Név"
              fullWidth
              value={editor.form.name}
              onChange={e => setEditor(s => ({ ...s, form: { ...s.form, name: e.target.value } }))}
              autoFocus
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editor.form.is_active}
                  onChange={e => setEditor(s => ({ ...s, form: { ...s.form, is_active: e.target.checked } }))}
                />
              }
              label="Aktív (megjelenik a szűrőkben és a kiválasztóban)"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Mégse</Button>
          <Button onClick={save} variant="contained"
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>Mentés</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Munkahely törlése</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan törlöd a(z) <b>{deleting?.name}</b> munkahelyet? A munkavállalók workplace
            mezői ettől függetlenül megmaradnak, csak a szűrő választékból tűnik el.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Mégse</Button>
          <Button onClick={confirmRemove} color="error" variant="contained">Törlés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
