import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Button, Stack, Chip, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, FormControlLabel, Checkbox,
  CircularProgress, Alert,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import VerifiedIcon from '@mui/icons-material/Verified';
import api from '../../services/api';
import { toast } from 'react-toastify';

/**
 * Iratok egy partnerhez, szerződéshez vagy ingatlanhoz.
 *
 * MIÉRT EGY KOMPONENS
 * A szerződés és a partner adatlapja ugyanazt csinálja — feltölt, listáz, letölt, töröl —,
 * csak más "party"-hoz. Két másolat két helyen romlana el külön-külön.
 *
 * AZ ALÁÍRT PÉLDÁNY külön jelölés, nem típus: egy módosítás is lehet aláírt, egy
 * szerződés-tervezet pedig nem az. A Szerződések tábla ezt a jelölést mutatja, mert a
 * kérdés nem az, hogy van-e fájl, hanem hogy megvan-e az aláírt szerződés.
 */

const TIPUSOK = [
  { value: 'szerzodes', label: 'Szerződés' },
  { value: 'modositas', label: 'Módosítás' },
  { value: 'melleklet', label: 'Melléklet' },
  { value: 'egyeb',     label: 'Egyéb' },
];
const TIPUS_LABEL = Object.fromEntries(TIPUSOK.map((t) => [t.value, t.label]));

const meret = (b) => {
  if (!b) return '—';
  const kb = b / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};
const datum = (d) => (d ? String(d).substring(0, 10) : '—');

export default function DocumentPanel({
  partyType,          // 'contract' | 'contractor' | 'accommodation'
  partyId,
  cim = 'Iratok',
  canUpload = true,
  canDelete = true,
  onChanged,          // a hívó frissítheti a saját számlálóit
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({
    title: '', document_type: 'szerzodes', document_date: '', is_signed_copy: false, description: '',
  });

  const param = { contract: 'contract_id', contractor: 'contractor_id', accommodation: 'accommodation_id' }[partyType];

  const load = useCallback(async () => {
    if (!partyId) return;
    setLoading(true);
    try {
      const res = await api.get('/documents', { params: { [param]: partyId, limit: 100 } });
      setRows(res.data?.data?.documents || res.data?.data || []);
    } catch {
      toast.error('Hiba az iratok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [partyId, param]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!file) { toast.error('Válassz fájlt'); return; }
    if (!form.title.trim()) { toast.error('A megnevezés kötelező'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', form.title.trim());
      fd.append('document_type', form.document_type);
      fd.append(param, partyId);
      if (form.document_date) fd.append('document_date', form.document_date);
      if (form.description.trim()) fd.append('description', form.description.trim());
      fd.append('is_signed_copy', form.is_signed_copy ? 'true' : 'false');

      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Irat feltöltve');
      setOpen(false);
      setFile(null);
      setForm({ title: '', document_type: 'szerzodes', document_date: '', is_signed_copy: false, description: '' });
      load();
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Hiba a feltöltéskor');
    } finally {
      setSaving(false);
    }
  };

  const letolt = async (d) => {
    try {
      const res = await api.get(`/documents/${d.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = d.file_name || d.title;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Hiba a letöltéskor');
    }
  };

  const torol = async (d) => {
    if (!window.confirm(`Biztosan törlöd? „${d.title}"`)) return;
    try {
      await api.delete(`/documents/${d.id}`);
      toast.success('Irat törölve');
      load();
      onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Hiba a törléskor');
    }
  };

  const vanAlairt = rows.some((r) => r.is_signed_copy);

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{cim}</Typography>
        {partyType === 'contract' && (
          vanAlairt
            ? <Chip size="small" color="success" icon={<VerifiedIcon fontSize="small" />} label="aláírt példány megvan" />
            : <Chip size="small" color="warning" variant="outlined" label="aláírt példány hiányzik" />
        )}
        <Box sx={{ flex: 1 }} />
        {canUpload && (
          <Button size="small" variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setOpen(true)}>
            Irat feltöltése
          </Button>
        )}
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={24} /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Megnevezés</TableCell>
                <TableCell>Típus</TableCell>
                <TableCell>Irat kelte</TableCell>
                <TableCell>Fájl</TableCell>
                <TableCell>Feltöltötte</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    Nincs csatolt irat.
                  </Typography>
                </TableCell></TableRow>
              )}
              {rows.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>
                    {d.title}
                    {d.is_signed_copy && (
                      <Tooltip title="Ez az aláírt példány">
                        <VerifiedIcon color="success" fontSize="small" sx={{ ml: 0.5, verticalAlign: 'middle' }} />
                      </Tooltip>
                    )}
                    {d.description && (
                      <Typography variant="caption" display="block" color="text.secondary">{d.description}</Typography>
                    )}
                  </TableCell>
                  <TableCell>{TIPUS_LABEL[d.document_type] || d.document_type || '—'}</TableCell>
                  <TableCell>{datum(d.document_date)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{d.file_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{meret(d.file_size)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {[d.uploader_last_name, d.uploader_first_name].filter(Boolean).join(' ') || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{datum(d.created_at)}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Letöltés">
                      <IconButton size="small" onClick={() => letolt(d)}><DownloadIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    {canDelete && (
                      <Tooltip title="Törlés">
                        <IconButton size="small" color="error" onClick={() => torol(d)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={open} onClose={saving ? undefined : () => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Irat feltöltése</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
              {file ? file.name : 'Fájl kiválasztása (PDF vagy kép)'}
              <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && !form.title) setForm((x) => ({ ...x, title: f.name.replace(/\.[^.]+$/, '') }));
                  setFile(f || null);
                }} />
            </Button>
            <TextField size="small" label="Megnevezés" required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Stack direction="row" spacing={2}>
              <TextField size="small" select label="Típus" sx={{ flex: 1 }} value={form.document_type}
                onChange={(e) => setForm({ ...form, document_type: e.target.value })}>
                {TIPUSOK.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>
              <TextField size="small" type="date" label="Irat kelte" sx={{ flex: 1 }}
                InputLabelProps={{ shrink: true }} value={form.document_date}
                onChange={(e) => setForm({ ...form, document_date: e.target.value })} />
            </Stack>
            <TextField size="small" label="Megjegyzés (opcionális)" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <FormControlLabel
              control={<Checkbox checked={form.is_signed_copy}
                onChange={(e) => setForm({ ...form, is_signed_copy: e.target.checked })} />}
              label="Ez az ALÁÍRT példány"
            />
            {form.is_signed_copy && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                A Szerződések táblán ez alapján látszik, hogy megvan-e az aláírt szerződés.
                Egy melléklet vagy tervezet ne kapja meg ezt a jelölést.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} disabled={saving}>Mégse</Button>
          <Button variant="contained" onClick={submit} disabled={saving || !file}>Feltöltés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
