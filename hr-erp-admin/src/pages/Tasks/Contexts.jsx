import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, Chip,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { gtdAPI } from '../../services/api';

const emptyForm = { name: '', icon: '', color: '#2563eb' };

export default function Contexts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState({ open: false, form: emptyForm, id: null, isSystem: false });
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await gtdAPI.listContexts();
      setRows(res?.data || []);
    } catch {
      toast.error('Contextek betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => setEditor({ open: true, form: emptyForm, id: null, isSystem: false });
  const openEdit = (r) => setEditor({
    open: true,
    id: r.id,
    isSystem: !!r.is_system,
    form: {
      name: r.name || '',
      icon: r.icon || '',
      color: r.color || '#2563eb',
    },
  });

  const save = async () => {
    const f = editor.form;
    if (!f.name.trim()) return toast.warn('A név kötelező');
    try {
      if (editor.id) {
        await gtdAPI.updateContext(editor.id, f);
        toast.success('Context frissítve');
      } else {
        await gtdAPI.createContext(f);
        toast.success('Context létrehozva');
      }
      setEditor({ open: false, form: emptyForm, id: null, isSystem: false });
      load();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Mentés sikertelen';
      toast.error(msg);
    }
  };

  const confirmRemove = async () => {
    if (!deleting) return;
    try {
      await gtdAPI.deleteContext(deleting.id);
      toast.success('Context törölve');
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Törlés sikertelen');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>GTD contextek</Typography>
          <Typography variant="caption" color="text.secondary">
            Hely / eszköz / helyzet címkék (pl. @office, @phone) — a feladat kártyákon megjelennek
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreate}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          Új context
        </Button>
      </Stack>

      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, width: 40 }}></TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      Még nincs context. Kattints az „Új context” gombra.
                    </TableCell>
                  </TableRow>
                ) : rows.map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Box sx={{
                        width: 14, height: 14, borderRadius: '50%',
                        bgcolor: r.color || '#e5e7eb',
                        border: '1px solid rgba(0,0,0,0.08)',
                      }} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                    <TableCell>
                      <Chip size="small"
                        label={r.is_system ? 'Rendszer' : 'Egyéni'}
                        color={r.is_system ? 'default' : 'primary'}
                        variant={r.is_system ? 'outlined' : 'filled'}
                        sx={{ height: 22 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={r.is_system ? 'Rendszer context csak olvasható' : 'Szerkesztés'}>
                        <span>
                          <IconButton size="small" onClick={() => openEdit(r)} disabled={r.is_system}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={r.is_system ? 'Rendszer context nem törölhető' : 'Törlés'}>
                        <span>
                          <IconButton size="small" onClick={() => setDeleting(r)} disabled={r.is_system} sx={{ color: '#d32f2f' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={editor.open} onClose={() => setEditor(s => ({ ...s, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle>{editor.id ? 'Context szerkesztése' : 'Új context'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Név (pl. @home)"
              fullWidth autoFocus
              value={editor.form.name}
              onChange={e => setEditor(s => ({ ...s, form: { ...s.form, name: e.target.value } }))}
            />
            <TextField
              label="Ikon (Material Symbols név, opcionális pl. home, phone)"
              fullWidth
              value={editor.form.icon}
              onChange={e => setEditor(s => ({ ...s, form: { ...s.form, icon: e.target.value } }))}
            />
            <TextField
              label="Szín"
              fullWidth type="color"
              value={editor.form.color}
              onChange={e => setEditor(s => ({ ...s, form: { ...s.form, color: e.target.value } }))}
              sx={{ '& input[type=color]': { height: 40 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditor(s => ({ ...s, open: false }))}>Mégse</Button>
          <Button variant="contained" onClick={save}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>Mentés</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleting} onClose={() => setDeleting(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Context törlése</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan törlöd a(z) <b>{deleting?.name}</b> contextet? A hozzárendelt
            feladatok megmaradnak, csak a context hivatkozásuk törlődik.
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
