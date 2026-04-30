import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Stack, Box, Typography,
  CircularProgress, Alert,
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { employeesAPI } from '../services/api';

// Match the controller's DOCUMENT_TYPES whitelist exactly. Any other value
// is silently coerced to 'other' server-side, but better to constrain here.
const TYPES = [
  { value: 'id_card',             label: '🪪 Személyi igazolvány' },
  { value: 'passport',            label: '🛂 Útlevél' },
  { value: 'work_permit',         label: '📜 Munkavállalási engedély' },
  { value: 'address_card',        label: '🏠 Lakcímkártya' },
  { value: 'health_insurance',    label: '🏥 TAJ / Egészségbiztosítás' },
  { value: 'tax_card',            label: '📋 Adóigazolvány' },
  { value: 'employment_contract', label: '📑 Munkaszerződés' },
  { value: 'bank_card',           label: '💳 Bankkártya' },
  { value: 'other',               label: '📄 Egyéb' },
];

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

export default function EmployeeDocumentUploadModal({
  open, employeeId, onClose, onUploaded,
}) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [docType, setDocType] = useState('id_card');
  const [docName, setDocName] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [issuedDate, setIssuedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Reset on open / cleanup on close — preview URLs revoked.
  useEffect(() => {
    if (!open) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(null); setPreviewUrl(null);
      setDocType('id_card');
      setDocName(''); setDocNumber('');
      setIssuedDate(''); setExpiryDate('');
      setNotes('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error(`A fájl túl nagy (max ${MAX_BYTES / 1024 / 1024} MB)`);
      e.target.value = '';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    if (f.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null); // PDF: no inline preview at upload step
    }
    if (!docName) setDocName(f.name.replace(/\.[^.]+$/, '').slice(0, 100));
  };

  const submit = async () => {
    if (!file) return toast.warn('Válassz fájlt');
    setUploading(true);
    try {
      const r = await employeesAPI.docs.upload(employeeId, file, {
        document_type: docType,
        document_name: docName || null,
        document_number: docNumber || null,
        issued_date: issuedDate || null,
        expiry_date: expiryDate || null,
        notes: notes || null,
      });
      if (r?.success) {
        toast.success('Dokumentum feltöltve');
        onUploaded?.(r.data?.document);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Feltöltés sikertelen');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={uploading ? null : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Új dokumentum feltöltése</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
            ⚠️ Bizalmas dokumentumok!
          </Typography>
          <Typography variant="body2">
            Ezek csak admin / HR vagy a saját munkavállaló számára érhetők el.
            Minden hozzáférés (megtekintés, letöltés) naplózva van.
          </Typography>
        </Alert>

        <Stack spacing={2}>
          {/* File picker + preview */}
          <Box
            sx={{
              p: 2, border: '1px dashed #d1d5db', borderRadius: 1,
              textAlign: 'center', bgcolor: '#fafafa',
            }}
          >
            <input
              ref={fileInputRef} type="file" accept={ACCEPT}
              hidden onChange={handleFile}
            />
            {!file ? (
              <Button
                variant="outlined" startIcon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                Fájl választása (PDF / JPG / PNG / WEBP, max 10 MB)
              </Button>
            ) : (
              <Stack spacing={1} alignItems="center">
                {previewUrl ? (
                  <img
                    src={previewUrl} alt="preview"
                    style={{ maxWidth: 240, maxHeight: 180, borderRadius: 4 }}
                  />
                ) : (
                  <Typography variant="body2">📄 {file.name}</Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </Typography>
                <Button size="small" onClick={() => fileInputRef.current?.click()}>
                  Másik fájl
                </Button>
              </Stack>
            )}
          </Box>

          <TextField
            select fullWidth size="small" label="Típus"
            value={docType} onChange={e => setDocType(e.target.value)}
          >
            {TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>

          <TextField
            fullWidth size="small" label="Megnevezés"
            placeholder="Pl. „2024-es útlevél"
            value={docName} onChange={e => setDocName(e.target.value)}
            inputProps={{ maxLength: 255 }}
          />

          <TextField
            fullWidth size="small" label="Dokumentum száma"
            placeholder="Pl. AB1234567"
            value={docNumber} onChange={e => setDocNumber(e.target.value)}
            inputProps={{ maxLength: 100 }}
          />

          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth size="small" type="date" label="Kiállítás dátuma"
              InputLabelProps={{ shrink: true }}
              value={issuedDate} onChange={e => setIssuedDate(e.target.value)}
            />
            <TextField
              fullWidth size="small" type="date" label="Lejárat dátuma"
              InputLabelProps={{ shrink: true }}
              value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
            />
          </Stack>

          <TextField
            fullWidth size="small" multiline rows={2} label="Megjegyzés"
            value={notes} onChange={e => setNotes(e.target.value)}
            inputProps={{ maxLength: 4000 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>Mégse</Button>
        <Button
          variant="contained" onClick={submit} disabled={!file || uploading}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          {uploading
            ? <CircularProgress size={18} sx={{ color: 'white' }} />
            : 'Feltöltés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
