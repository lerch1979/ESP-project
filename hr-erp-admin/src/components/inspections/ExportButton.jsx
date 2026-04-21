import React, { useState } from 'react';
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Stack,
  TextField, Typography, Alert, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import { FileDownload as DownloadIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';

/**
 * Reusable "Export to Excel" button. Opens a small dialog with:
 *   - Date-from / date-to (optional)
 *   - Optional pre-selected filter slots (passed via `filters` prop as an
 *     array of { key, label, options? }). If `options` is provided we
 *     render a Select; otherwise a TextField.
 *
 * Props:
 *   - onExport(params) → returns a Blob Promise
 *   - filenameBase     → used for the saved filename
 *   - defaultFilters   → merged into the params payload (e.g. status lock)
 */
export default function ExportButton({
  label = 'Exportálás', onExport, filenameBase = 'export',
  filters = [], defaultFilters = {},
  size = 'small', variant = 'outlined',
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ from: '', to: '', ...defaultFilters });

  const run = async () => {
    setBusy(true);
    try {
      const params = {};
      if (form.from) params.from = form.from;
      if (form.to)   params.to   = form.to;
      for (const f of filters) {
        const v = form[f.key];
        if (v != null && v !== '') params[f.key] = v;
      }
      const blob = await onExport(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success('Letöltve');
      setOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Export sikertelen');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size={size} variant={variant} startIcon={<DownloadIcon />} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Dialog open={open} onClose={() => !busy && setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Excel export</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              Opcionális szűrők — üresen hagyva minden adat exportálódik.
            </Alert>
            <Typography variant="subtitle2">Időszak</Typography>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Kezdés" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }}
                value={form.from} onChange={e => setForm({ ...form, from: e.target.value })}
              />
              <TextField
                label="Vége" type="date" fullWidth size="small" InputLabelProps={{ shrink: true }}
                value={form.to} onChange={e => setForm({ ...form, to: e.target.value })}
              />
            </Stack>
            {filters.length > 0 && <Typography variant="subtitle2">Egyéb szűrők</Typography>}
            {filters.map(f => (
              f.options ? (
                <FormControl fullWidth size="small" key={f.key}>
                  <InputLabel>{f.label}</InputLabel>
                  <Select
                    value={form[f.key] ?? ''}
                    label={f.label}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  >
                    <MenuItem value="">Minden</MenuItem>
                    {f.options.map(o => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <TextField
                  key={f.key} label={f.label} size="small" fullWidth
                  value={form[f.key] ?? ''}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                />
              )
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>Mégsem</Button>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={run} disabled={busy}>
            {busy ? 'Generálás…' : 'Letöltés'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
