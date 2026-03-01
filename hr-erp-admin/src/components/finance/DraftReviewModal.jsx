import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Chip, Link, TextField, Stack, Divider, Alert,
  CircularProgress, LinearProgress, Tooltip, IconButton,
} from '@mui/material';
import {
  Receipt as ReceiptIcon, Download as DownloadIcon,
  PictureAsPdf as PdfIcon, CheckCircle as ApproveIcon,
  Cancel as RejectIcon, Refresh as ReOcrIcon,
  Edit as EditIcon, Psychology as AiIcon,
  Email as EmailIcon, CalendarMonth as DateIcon,
} from '@mui/icons-material';
import { UPLOADS_BASE_URL } from '../../services/api';
import CostCenterSelector from '../invoices/CostCenterSelector';

const formatCurrency = (val, currency = 'HUF') => {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU');
};

function Field({ label, value, fullWidth }) {
  return (
    <Box sx={{ mb: 1.5, gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }} component="div">{value || '-'}</Typography>
    </Box>
  );
}

function FilePreview({ filePath }) {
  if (!filePath) return null;
  const fileUrl = `${UPLOADS_BASE_URL}/${filePath}`;
  const ext = filePath.split('.').pop().toLowerCase();
  const isPdf = ext === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png'].includes(ext);

  return (
    <Box sx={{ mt: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Csatolt fájl</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {isImage ? (
          <Box component="img" src={fileUrl} alt="Számla"
            sx={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 1, border: '1px solid #e5e7eb' }}
          />
        ) : (
          <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#e5e7eb', borderRadius: 1 }}>
            {isPdf ? <PdfIcon color="error" /> : <ReceiptIcon color="action" />}
          </Box>
        )}
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{filePath.split('/').pop()}</Typography>
          <Link href={fileUrl} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <DownloadIcon fontSize="small" /> Megnyitás / Letöltés
          </Link>
        </Box>
      </Box>
    </Box>
  );
}

export default function DraftReviewModal({
  open, onClose, draft, onApprove, onReject, onReOCR, onUpdate,
  costCenters = [], costCenterTree = [], loading = false,
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [costCenterId, setCostCenterId] = useState('');

  useEffect(() => {
    if (draft) {
      setForm({
        invoiceNumber: draft.invoiceNumber || '',
        vendorName: draft.vendorName || '',
        vendorTaxNumber: draft.vendorTaxNumber || '',
        netAmount: draft.netAmount ?? '',
        vatAmount: draft.vatAmount ?? '',
        grossAmount: draft.grossAmount ?? '',
        invoiceDate: draft.invoiceDate ? draft.invoiceDate.substring(0, 10) : '',
        dueDate: draft.dueDate ? draft.dueDate.substring(0, 10) : '',
        beneficiaryIban: draft.beneficiaryIban || '',
        description: draft.description || '',
      });
      setCostCenterId(draft.suggestedCostCenter?.id || '');
      setEditing(false);
    }
  }, [draft, open]);

  if (!draft) return null;

  const isPending = draft.status === 'pending';
  const isFailed = draft.status === 'ocr_failed';
  const canEdit = isPending || isFailed;
  const confidence = draft.costCenterConfidence;

  const handleSaveEdits = async () => {
    setSaving(true);
    try {
      await onUpdate(draft.id, {
        invoiceNumber: form.invoiceNumber || null,
        vendorName: form.vendorName || null,
        vendorTaxNumber: form.vendorTaxNumber || null,
        netAmount: form.netAmount ? parseFloat(form.netAmount) : null,
        vatAmount: form.vatAmount ? parseFloat(form.vatAmount) : null,
        grossAmount: form.grossAmount ? parseFloat(form.grossAmount) : null,
        invoiceDate: form.invoiceDate || null,
        dueDate: form.dueDate || null,
        beneficiaryIban: form.beneficiaryIban || null,
        description: form.description || null,
        suggestedCostCenterId: costCenterId || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = () => {
    onApprove(draft.id, { costCenterId: costCenterId || undefined });
  };

  const confidenceColor = confidence >= 70 ? '#10b981' : confidence >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptIcon color="primary" />
          Számla piszkozat áttekintése
          <Box sx={{ flex: 1 }} />
          <Chip
            label={draft.status === 'pending' ? 'Jóváhagyásra vár' :
              draft.status === 'approved' ? 'Jóváhagyva' :
              draft.status === 'rejected' ? 'Elutasítva' : 'OCR sikertelen'}
            size="small"
            color={draft.status === 'pending' ? 'warning' :
              draft.status === 'approved' ? 'success' :
              draft.status === 'rejected' ? 'error' : 'default'}
          />
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {/* Email info */}
        <Box sx={{ p: 2, bgcolor: '#f0f9ff', borderRadius: 2, mb: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <EmailIcon color="primary" sx={{ fontSize: 20 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary">Email</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{draft.emailSubject || '-'}</Typography>
              <Typography variant="caption" color="text.secondary">{draft.emailFrom}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Beérkezett</Typography>
              <Typography variant="body2">{formatDate(draft.createdAt)}</Typography>
            </Box>
          </Stack>
        </Box>

        {isFailed && (
          <Alert severity="warning" sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" startIcon={<ReOcrIcon />} onClick={() => onReOCR(draft.id)}>
                Újra OCR
              </Button>
            }
          >
            Az OCR feldolgozás sikertelen volt. Próbálja újra, vagy töltse ki kézzel az adatokat.
          </Alert>
        )}

        <Divider sx={{ mb: 2 }} />

        {/* Extracted data - View or Edit mode */}
        {editing ? (
          <Stack spacing={2}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Számla adatok szerkesztése</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField size="small" label="Számlaszám" value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
              <TextField size="small" label="Szállító neve" value={form.vendorName}
                onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
              <TextField size="small" label="Adószám" value={form.vendorTaxNumber}
                onChange={(e) => setForm({ ...form, vendorTaxNumber: e.target.value })} />
              <TextField size="small" label="IBAN" value={form.beneficiaryIban}
                onChange={(e) => setForm({ ...form, beneficiaryIban: e.target.value })} />
              <TextField size="small" label="Nettó összeg" type="number" value={form.netAmount}
                onChange={(e) => setForm({ ...form, netAmount: e.target.value })} />
              <TextField size="small" label="ÁFA összeg" type="number" value={form.vatAmount}
                onChange={(e) => setForm({ ...form, vatAmount: e.target.value })} />
              <TextField size="small" label="Bruttó összeg" type="number" value={form.grossAmount}
                onChange={(e) => setForm({ ...form, grossAmount: e.target.value })} />
              <TextField size="small" label="Számla dátum" type="date" value={form.invoiceDate}
                onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Fizetési határidő" type="date" value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                InputLabelProps={{ shrink: true }} />
            </Box>
            <TextField size="small" label="Leírás" value={form.description} multiline rows={2}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <CostCenterSelector
              value={costCenterId} onChange={setCostCenterId}
              costCenters={costCenters} costCenterTree={costCenterTree}
              label="Költséghely" />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={() => setEditing(false)}>Mégse</Button>
              <Button variant="contained" onClick={handleSaveEdits} disabled={saving}
                sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
                {saving ? <CircularProgress size={20} /> : 'Mentés'}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Kinyert adatok</Typography>
              {canEdit && (
                <Button size="small" startIcon={<EditIcon />} onClick={() => setEditing(true)}>
                  Szerkesztés
                </Button>
              )}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Field label="Számlaszám" value={draft.invoiceNumber} />
              <Field label="Számla dátum" value={formatDate(draft.invoiceDate)} />
              <Field label="Szállító neve" value={draft.vendorName} />
              <Field label="Adószám" value={draft.vendorTaxNumber} />
              <Field label="Nettó összeg" value={formatCurrency(draft.netAmount)} />
              <Field label="ÁFA összeg" value={formatCurrency(draft.vatAmount)} />
              <Field label="Bruttó összeg" value={
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#2563eb' }}>
                  {formatCurrency(draft.grossAmount)}
                </Typography>
              } />
              <Field label="Fizetési határidő" value={formatDate(draft.dueDate)} />
              <Field label="IBAN" value={draft.beneficiaryIban} fullWidth />
              {draft.description && <Field label="Leírás" value={draft.description} fullWidth />}
            </Box>

            {/* AI Cost Center Prediction */}
            <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f3ff', borderRadius: 2, border: '1px solid #e9e5ff' }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <AiIcon sx={{ color: '#7c3aed', fontSize: 20 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#7c3aed' }}>
                  AI költséghely javaslat
                </Typography>
              </Stack>

              {draft.suggestedCostCenter ? (
                <>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                    <Chip
                      label={`${draft.suggestedCostCenter.code} - ${draft.suggestedCostCenter.name}`}
                      sx={{ fontWeight: 600 }}
                    />
                    <Box sx={{ flex: 1, maxWidth: 200 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption">Magabiztosság</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: confidenceColor }}>
                          {confidence}%
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate" value={confidence || 0}
                        sx={{
                          height: 6, borderRadius: 3,
                          bgcolor: '#e5e7eb',
                          '& .MuiLinearProgress-bar': { bgcolor: confidenceColor },
                        }}
                      />
                    </Box>
                  </Stack>
                  {draft.suggestionReasoning && (
                    <Typography variant="caption" color="text.secondary">
                      {draft.suggestionReasoning}
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Nincs javaslat - kézi beállítás szükséges
                </Typography>
              )}

              {canEdit && (
                <Box sx={{ mt: 1.5 }}>
                  <CostCenterSelector
                    value={costCenterId} onChange={setCostCenterId}
                    costCenters={costCenters} costCenterTree={costCenterTree}
                    label="Költséghely (módosítás)"
                  />
                </Box>
              )}
            </Box>
          </>
        )}

        <FilePreview filePath={draft.pdfFilePath} />

        {/* Reviewer info */}
        {draft.reviewedBy && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f0fdf4', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Elbírálta: {draft.reviewerName || draft.reviewedBy} | {formatDate(draft.reviewedAt)}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {isFailed && (
          <Button startIcon={<ReOcrIcon />} onClick={() => onReOCR(draft.id)}
            sx={{ mr: 'auto' }}>
            OCR újrafuttatás
          </Button>
        )}
        <Button onClick={onClose}>Bezárás</Button>
        {isPending && (
          <>
            <Button variant="outlined" color="error" startIcon={<RejectIcon />}
              onClick={() => onReject(draft.id)}>
              Elutasítás
            </Button>
            <Button variant="contained" color="success" startIcon={<ApproveIcon />}
              onClick={handleApprove}
              disabled={!costCenterId}>
              Jóváhagyás
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
