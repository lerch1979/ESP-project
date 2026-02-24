import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, CircularProgress, Divider,
  MenuItem, Select, FormControl, InputLabel, Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon, PictureAsPdf as PdfIcon,
  Image as ImageIcon, Delete as DeleteIcon, DocumentScanner as OcrIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import CostCenterSelector from './CostCenterSelector';
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
  total_amount: '', currency: 'HUF', invoice_date: '', due_date: '', payment_date: '',
  payment_status: 'pending', cost_center_id: '', category_id: '', description: '', notes: '',
};

export default function InvoiceFormModal({
  open, onClose, onSave, editData,
  costCenters = [], costCenterTree = [], categories = [],
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
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

    setSaving(true);
    try {
      const data = {
        ...form,
        amount: parseFloat(form.amount),
        vat_amount: form.vat_amount ? parseFloat(form.vat_amount) : null,
        total_amount: form.total_amount ? parseFloat(form.total_amount) : parseFloat(form.amount),
        category_id: form.category_id || null,
        payment_date: form.payment_date || null,
        due_date: form.due_date || null,
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
            <TextField label="Szállító neve" value={form.vendor_name}
              onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
              size="small" sx={{ flex: 2 }} />
            <TextField label="Adószám" value={form.vendor_tax_number}
              onChange={(e) => setForm({ ...form, vendor_tax_number: e.target.value })}
              size="small" sx={{ flex: 1 }} placeholder="12345678-2-42" />
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
              borderColor: dragOver ? '#2563eb' : file ? '#2563eb' : '#ccc',
              borderRadius: 2, p: 3, textAlign: 'center', cursor: 'pointer',
              bgcolor: dragOver ? 'rgba(37, 99, 235, 0.04)' : file ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
              transition: 'all 0.2s',
              '&:hover': { borderColor: '#2563eb', bgcolor: 'rgba(37, 99, 235, 0.04)' },
            }}
          >
            <input
              ref={fileInputRef} type="file" hidden
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png"
            />
            <UploadIcon sx={{ fontSize: 36, color: file ? '#2563eb' : '#999', mb: 0.5 }} />
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
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
          {saving ? <CircularProgress size={22} /> : editData ? 'Mentés' : 'Rögzítés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
