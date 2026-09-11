import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, CircularProgress, Divider,
  MenuItem, Select, FormControl, InputLabel, Tooltip, IconButton,
} from '@mui/material';
import {
  CloudUpload as UploadIcon, PictureAsPdf as PdfIcon,
  Image as ImageIcon, Delete as DeleteIcon, DocumentScanner as OcrIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import CostCenterSelector from './CostCenterSelector';
import VendorAutocomplete from '../VendorAutocomplete';
import { UPLOADS_BASE_URL } from '../../services/api';

const CURRENCIES = ['HUF', 'EUR', 'USD'];

const PAYMENT_STATUSES = {
  pending: { label: 'Függőben' },
  paid: { label: 'Fizetve' },
  overdue: { label: 'Lejárt' },
  cancelled: { label: 'Sztornó' },
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const INITIAL_FORM = {
  invoice_number: '', vendor_name: '', vendor_tax_number: '', amount: '', vat_amount: '',
  total_amount: '', currency: 'HUF', invoice_date: '', performance_date: '', due_date: '', payment_date: '',
  payment_status: 'pending', cost_center_id: '', category_id: '', description: '', notes: '',
};

export default function InvoiceFormModal({
  open, onClose, onSave, editData,
  costCenters = [], costCenterTree = [], categories = [], accommodations = [],
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  // "" | "general" | "central" | "acc:<uuid>"
  const [singleTarget, setSingleTarget] = useState('');
  const [split, setSplit] = useState(false);
  const [splitRows, setSplitRows] = useState([]);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const updateSplit = (i, patch) =>
    setSplitRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** "acc:<uuid>" | "general" | "central" → a szervernek küldött alak. */
  const toAllocation = (target, amount) => {
    if (!target) return null;
    const base = amount === '' || amount === undefined ? {} : { amount: Number(amount) };
    return target.startsWith('acc:')
      ? { target_type: 'accommodation', accommodation_id: target.slice(4), ...base }
      : { target_type: target, ...base };
  };

  // Mennyi hiányzik még a végösszegből — a felosztás közben végig látszik.
  const invoiceTotal = Number(form.total_amount || form.amount || 0);
  const splitDiff = Math.round(
    (invoiceTotal - splitRows.reduce((a, r) => a + Number(r.amount || 0), 0)) * 100) / 100;
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (editData) {
      setForm({
        invoice_number: editData.invoice_number || '',
        vendor_name: editData.vendor_name || '',
        vendor_tax_number: editData.vendor_tax_number || '',
        amount: editData.amount || '',
        vat_amount: editData.vat_amount || '',
        total_amount: editData.total_amount || '',
        currency: editData.currency || 'HUF',
        invoice_date: editData.invoice_date ? editData.invoice_date.substring(0, 10) : '',
        performance_date: editData.performance_date ? editData.performance_date.substring(0, 10) : '',
        due_date: editData.due_date ? editData.due_date.substring(0, 10) : '',
        payment_date: editData.payment_date ? editData.payment_date.substring(0, 10) : '',
        payment_status: editData.payment_status || 'pending',
        cost_center_id: editData.cost_center_id || '',
        category_id: editData.category_id || '',
        description: editData.description || '',
        notes: editData.notes || '',
      });
    } else {
      setForm(INITIAL_FORM);
    }
    setFile(null);
  }, [editData, open]);

  // Auto-calc total
  useEffect(() => {
    const a = parseFloat(form.amount) || 0;
    const v = parseFloat(form.vat_amount) || 0;
    if (a > 0) setForm((f) => ({ ...f, total_amount: (a + v).toString() }));
  }, [form.amount, form.vat_amount]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const validateAndSetFile = (f) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(f.type)) {
      toast.error('Csak PDF, JPG vagy PNG fájl engedélyezett');
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error('A fájl mérete nem haladhatja meg a 20MB-ot');
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!form.cost_center_id) { toast.error('Költséghely megadása kötelező'); return; }
    if (!form.amount) { toast.error('Összeg megadása kötelező'); return; }
    if (!form.invoice_date) { toast.error('Számla dátum megadása kötelező'); return; }

    // Felosztásnál itt fogjuk meg a különbözetet: a szerver is elutasítaná, de jobb
    // most szólni, mint a mentés után hibaüzenettel.
    if (split && splitRows.length > 0 && splitDiff !== 0) {
      toast.error(splitDiff > 0
        ? `A felosztásból hiányzik ${splitDiff.toLocaleString('hu-HU')} Ft`
        : `A felosztás ${Math.abs(splitDiff).toLocaleString('hu-HU')} Ft-tal több a végösszegnél`);
      return;
    }

    setSaving(true);
    try {
      const allocations = split
        ? splitRows.map((r) => toAllocation(r.target, r.amount)).filter(Boolean)
        : (singleTarget ? [toAllocation(singleTarget)] : []);

      const data = {
        ...form,
        amount: parseFloat(form.amount),
        vat_amount: form.vat_amount ? parseFloat(form.vat_amount) : null,
        total_amount: form.total_amount ? parseFloat(form.total_amount) : parseFloat(form.amount),
        category_id: form.category_id || null,
        payment_date: form.payment_date || null,
        due_date: form.due_date || null,
        allocations,
      };
      await onSave(data, file);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  // File preview for existing file on edit
  const existingFile = editData?.file_path;
  const existingFileUrl = existingFile ? `${UPLOADS_BASE_URL}/${existingFile}` : null;
  const existingExt = existingFile ? existingFile.split('.').pop().toLowerCase() : '';
  const existingIsImage = ['jpg', 'jpeg', 'png'].includes(existingExt);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        {editData ? 'Számla szerkesztése' : 'Új számla rögzítése'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {/* --- Alapadatok --- */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Alapadatok</Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Számlaszám" value={form.invoice_number}
              onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              size="small" sx={{ flex: 1 }} placeholder="pl. INV-2026-001" />
            <TextField label="Számla dátum *" type="date" value={form.invoice_date}
              onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
              size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
            {/* Teljesítés drives the MNB rate for a foreign-currency invoice — a service
                performed in September but invoiced in October converts at September's
                rate. Blank falls back to the invoice date. */}
            <TextField label="Teljesítés dátuma" type="date" value={form.performance_date}
              onChange={(e) => setForm({ ...form, performance_date: e.target.value })}
              size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }}
              helperText={form.currency !== 'HUF' ? 'Ez dönti el az MNB árfolyamot' : ' '} />
            <FormControl size="small" sx={{ width: 100 }}>
              <InputLabel>Pénznem</InputLabel>
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} label="Pénznem">
                {CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          {/* --- Szállító --- */}
          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Szállító</Typography>
          <Stack direction="row" spacing={2}>
            <VendorAutocomplete
              name={form.vendor_name}
              taxNumber={form.vendor_tax_number}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
          </Stack>

          {/* --- Összegek --- */}
          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Összegek</Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Nettó összeg *" type="number" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              size="small" sx={{ flex: 1 }} />
            <TextField label="ÁFA összeg" type="number" value={form.vat_amount}
              onChange={(e) => setForm({ ...form, vat_amount: e.target.value })}
              size="small" sx={{ flex: 1 }} />
            <TextField label="Bruttó összeg" type="number" value={form.total_amount}
              onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
              size="small" sx={{ flex: 1 }} InputProps={{ sx: { fontWeight: 700 } }} />
          </Stack>

          {/* --- Besorolás --- */}
          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Besorolás</Typography>
          <Stack direction="row" spacing={2}>
            <Box sx={{ flex: 1 }}>
              <CostCenterSelector
                value={form.cost_center_id}
                onChange={(val) => setForm({ ...form, cost_center_id: val })}
                costCenters={costCenters}
                costCenterTree={costCenterTree}
                label="Költséghely"
                required
              />
            </Box>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Kategória</InputLabel>
              <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} label="Kategória">
                <MenuItem value="">-- Nincs --</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>{cat.icon} {cat.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {/* --- Hova könyveljük --- */}
          {/* A költséghely azt mondja meg, MILYEN JELLEGŰ a kiadás; ez pedig azt, hogy
              KIRE terheljük. A gyakori eset egy célpont, ezért az alapnézet egyetlen
              legördülő — a felosztás külön kapcsolóval jön elő. */}
          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
            Hova könyveljük
          </Typography>

          {!split ? (
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Szálláshely / általános / központi</InputLabel>
                <Select
                  value={singleTarget}
                  onChange={(e) => setSingleTarget(e.target.value)}
                  label="Szálláshely / általános / központi"
                >
                  <MenuItem value="">-- Nincs hozzárendelve --</MenuItem>
                  <MenuItem value="general">Általános (cég kiadásai)</MenuItem>
                  <MenuItem value="central">Központi (saját rész)</MenuItem>
                  <Divider />
                  {accommodations.map((a) => (
                    <MenuItem key={a.id} value={`acc:${a.id}`}>{a.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button size="small" onClick={() => setSplit(true)} sx={{ mt: 0.5, whiteSpace: 'nowrap' }}>
                Felosztás több helyre
              </Button>
            </Stack>
          ) : (
            <Box>
              {splitRows.map((row, i) => (
                <Stack key={i} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  <FormControl size="small" sx={{ flex: 2 }}>
                    <InputLabel>Célpont</InputLabel>
                    <Select
                      value={row.target}
                      onChange={(e) => updateSplit(i, { target: e.target.value })}
                      label="Célpont"
                    >
                      <MenuItem value="general">Általános (cég kiadásai)</MenuItem>
                      <MenuItem value="central">Központi (saját rész)</MenuItem>
                      <Divider />
                      {accommodations.map((a) => (
                        <MenuItem key={a.id} value={`acc:${a.id}`}>{a.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Összeg" type="number" size="small" sx={{ flex: 1 }}
                    value={row.amount}
                    onChange={(e) => updateSplit(i, { amount: e.target.value })}
                  />
                  <IconButton size="small" onClick={() => setSplitRows(splitRows.filter((_, j) => j !== i))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Stack direction="row" spacing={2} alignItems="center">
                <Button size="small" onClick={() => setSplitRows([...splitRows, { target: '', amount: '' }])}>
                  + Sor
                </Button>
                <Button size="small" onClick={() => { setSplit(false); setSplitRows([]); }}>
                  Mégse, egy helyre
                </Button>
                <Box sx={{ flex: 1 }} />
                {/* A különbözet folyamatosan látszik — mentéskor a szerver is ellenőrzi,
                    de itt derül ki időben, nem a hibaüzenetből. */}
                <Typography variant="caption"
                  color={splitDiff === 0 ? 'success.main' : 'error.main'} sx={{ fontWeight: 600 }}>
                  {splitDiff === 0
                    ? 'Kiadja a végösszeget ✓'
                    : splitDiff > 0
                      ? `Hiányzik ${splitDiff.toLocaleString('hu-HU')} Ft`
                      : `Többlet ${Math.abs(splitDiff).toLocaleString('hu-HU')} Ft`}
                </Typography>
              </Stack>
            </Box>
          )}

          {/* --- Fizetés --- */}
          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Fizetés</Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Fizetési határidő" type="date" value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Státusz</InputLabel>
              <Select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })} label="Státusz">
                {Object.entries(PAYMENT_STATUSES).map(([val, cfg]) => (
                  <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Fizetés dátuma" type="date" value={form.payment_date}
              onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
              size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
          </Stack>

          {/* --- Csatolt fájl --- */}
          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Csatolt fájl</Typography>

          {/* Existing file preview on edit */}
          {existingFile && !file && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, bgcolor: '#f0f9ff', borderRadius: 1, border: '1px solid #bae6fd' }}>
              {existingIsImage ? (
                <Box component="img" src={existingFileUrl} alt="Számla" sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1 }} />
              ) : (
                <PdfIcon sx={{ fontSize: 32, color: '#ef4444' }} />
              )}
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{existingFile.split('/').pop()}</Typography>
                <Typography variant="caption" color="text.secondary">Már feltöltött fájl - új feltöltéssel cserélhető</Typography>
              </Box>
            </Box>
          )}

          {/* Drag & Drop upload area */}
          <Box
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? '#8B6B33' : file ? '#8B6B33' : '#ccc',
              borderRadius: 2, p: 3, textAlign: 'center', cursor: 'pointer',
              bgcolor: dragOver ? 'rgba(139, 107, 51, 0.06)' : file ? 'rgba(139, 107, 51, 0.06)' : 'transparent',
              transition: 'all 0.2s',
              '&:hover': { borderColor: '#8B6B33', bgcolor: 'rgba(139, 107, 51, 0.06)' },
            }}
          >
            <input
              ref={fileInputRef} type="file" hidden
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png"
            />
            <UploadIcon sx={{ fontSize: 36, color: file ? '#8B6B33' : '#999', mb: 0.5 }} />
            {file ? (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{file.name}</Typography>
                <Typography variant="caption" color="text.secondary">{formatFileSize(file.size)}</Typography>
                <Box sx={{ mt: 1 }}>
                  <Button size="small" color="error" startIcon={<DeleteIcon />}
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    Eltávolítás
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Húzza ide a fájlt, vagy kattintson a tallózáshoz
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  PDF, JPG, PNG (max. 20MB)
                </Typography>
              </Box>
            )}
          </Box>

          {/* OCR placeholder button */}
          <Tooltip title="OCR funkció hamarosan elérhető">
            <span>
              <Button size="small" variant="outlined" startIcon={<OcrIcon />} disabled sx={{ alignSelf: 'flex-start' }}>
                OCR futtatás
              </Button>
            </span>
          </Tooltip>

          {/* --- Megjegyzések --- */}
          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Megjegyzések</Typography>
          <TextField label="Leírás" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            size="small" multiline rows={2} fullWidth />
          <TextField label="Belső megjegyzések" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            size="small" fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}
          sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}>
          {saving ? <CircularProgress size={22} /> : editData ? 'Mentés' : 'Rögzítés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
