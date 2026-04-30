import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, IconButton, Stack, Box, Typography, Chip,
  CircularProgress, Divider, TextField, MenuItem, Accordion,
  AccordionSummary, AccordionDetails, Table, TableHead, TableBody,
  TableRow, TableCell, Alert,
} from '@mui/material';
import {
  Download as DownloadIcon, Edit as EditIcon,
  Delete as DeleteIcon, Close as CloseIcon,
  ExpandMore as ExpandMoreIcon, History as HistoryIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { employeesAPI } from '../services/api';
import { classifyExpiry } from './EmployeeDocumentsPanel';

const TYPE_OPTIONS = [
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

const fmtDate = (s) => s ? new Date(s).toLocaleDateString('hu-HU') : '—';
const fmtDateTime = (s) => s ? new Date(s).toLocaleString('hu-HU', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '—';

const ACTION_LABEL = {
  uploaded:         'Feltöltötte',
  viewed_details:   'Megtekintette',
  downloaded:       'Letöltötte',
  metadata_updated: 'Szerkesztette',
  deleted:          'Törölte',
};

/**
 * Document detail / preview modal. Fetches the doc record once and the
 * file as a blob (which counts as a `viewed_details` audit event +
 * a `downloaded` event when the user actually clicks Download — note:
 * inline preview ALSO triggers a `downloaded` audit because the blob
 * fetch is the same endpoint. That's documented behavior; the audit
 * trail surfaces both the open AND the download by design).
 *
 * Preview rules:
 *   - image/* → <img src={blobUrl}>
 *   - application/pdf → <iframe src={blobUrl}>
 *   - everything else → "Open file" CTA only
 *
 * Edit / Delete buttons are gated by canModify (admin only). Backend
 * re-checks every call — UI just hides the controls.
 */
export default function EmployeeDocumentViewModal({
  open, employeeId, docId, canModify, onClose,
}) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [didChange, setDidChange] = useState(false);

  // Fetch metadata + blob on open. Skip when modal not open or no doc id.
  useEffect(() => {
    if (!open || !docId || !employeeId) return;
    let cancelled = false;
    setLoading(true);
    setEditMode(false);
    setDidChange(false);
    (async () => {
      try {
        const [meta, blob] = await Promise.all([
          employeesAPI.docs.getOne(employeeId, docId),
          employeesAPI.docs.downloadBlob(employeeId, docId).catch(() => null),
        ]);
        if (cancelled) return;
        if (meta?.success) {
          const d = meta.data?.document || null;
          setDoc(d);
          setEditForm({
            document_name: d?.document_name || '',
            document_number: d?.document_number || '',
            issued_date: d?.issued_date ? String(d.issued_date).slice(0, 10) : '',
            expiry_date: d?.expiry_date ? String(d.expiry_date).slice(0, 10) : '',
            notes: d?.notes || '',
            document_type: d?.document_type || 'other',
          });
        }
        if (blob) {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      } catch (err) {
        if (!cancelled) toast.error(err?.response?.data?.message || 'Betöltés sikertelen');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, docId, employeeId]);

  // Cleanup blob URL when the modal closes / doc changes.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    if (!open) setBlobUrl(null);
  }, [open]);

  const expiry = useMemo(
    () => classifyExpiry(doc?.expiry_date),
    [doc?.expiry_date]
  );

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = doc?.file_name || `document-${docId}`;
    a.click();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = {};
      for (const k of Object.keys(editForm)) {
        if ((editForm[k] || '') !== ((doc && doc[k]) || '')) {
          patch[k] = editForm[k] || null;
        }
      }
      if (Object.keys(patch).length === 0) {
        toast.info('Nincs változás');
        setEditMode(false);
        return;
      }
      const r = await employeesAPI.docs.patch(employeeId, docId, patch);
      if (r?.success) {
        toast.success('Mentve');
        setDoc(r.data?.document || doc);
        setEditMode(false);
        setDidChange(true);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Mentés sikertelen');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const reason = window.prompt('Törlés oka (audit naplóhoz):');
    if (reason === null) return;
    setDeleting(true);
    try {
      const r = await employeesAPI.docs.softDelete(employeeId, docId, { reason: reason || null });
      if (r?.success) {
        toast.success('Dokumentum törölve');
        onClose?.(true);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Törlés sikertelen');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  const isImage = doc?.mime_type?.startsWith('image/');
  const isPdf   = doc?.mime_type === 'application/pdf';

  return (
    <Dialog open={open} onClose={() => onClose?.(didChange)} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, pr: 6 }}>
        {doc?.document_name || doc?.file_name || 'Dokumentum'}
        <IconButton
          onClick={() => onClose?.(didChange)}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 400 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : !doc ? (
          <Alert severity="error">Nem sikerült betölteni a dokumentumot.</Alert>
        ) : (
          <Stack spacing={2}>
            {/* ── Preview ──────────────────────────────────────── */}
            <Box sx={{
              bgcolor: '#1a1a1a', borderRadius: 1,
              minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {!blobUrl ? (
                <CircularProgress sx={{ color: 'white' }} />
              ) : isImage ? (
                <img
                  src={blobUrl} alt={doc.document_name || 'document'}
                  style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
                />
              ) : isPdf ? (
                <iframe
                  src={blobUrl} title="PDF preview"
                  style={{ width: '100%', height: '60vh', border: 0, background: 'white' }}
                />
              ) : (
                <Box sx={{ textAlign: 'center', color: 'white', p: 4 }}>
                  <Typography variant="h2">📄</Typography>
                  <Typography variant="body2" sx={{ opacity: 0.85 }}>
                    Előnézet nem elérhető ehhez a fájltípushoz.<br />
                    Töltsd le, hogy megnyithasd.
                  </Typography>
                </Box>
              )}
            </Box>

            {/* ── Metadata grid ────────────────────────────────── */}
            {!editMode ? (
              <Box sx={{
                display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5,
              }}>
                <MetaCell label="Típus">
                  {TYPE_OPTIONS.find(o => o.value === doc.document_type)?.label
                   || doc.document_type_label || doc.document_type}
                </MetaCell>
                <MetaCell label="Dokumentum száma">{doc.document_number || '—'}</MetaCell>
                <MetaCell label="Érvényesség">
                  <Chip size="small" label={expiry.label} color={expiry.color} variant="outlined" />
                </MetaCell>
                <MetaCell label="Kiállítás">{fmtDate(doc.issued_date)}</MetaCell>
                <MetaCell label="Lejárat">{fmtDate(doc.expiry_date)}</MetaCell>
                <MetaCell label="Méret">{doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : '—'}</MetaCell>
                <MetaCell label="Feltöltötte">{doc.uploaded_by_name || '—'}</MetaCell>
                <MetaCell label="Feltöltve">{fmtDateTime(doc.uploaded_at)}</MetaCell>
                <MetaCell label="Hozzáférés">{doc.access_level || 'admin_only'}</MetaCell>
                {doc.notes && (
                  <Box sx={{ gridColumn: '1 / -1' }}>
                    <MetaCell label="Megjegyzés">{doc.notes}</MetaCell>
                  </Box>
                )}
              </Box>
            ) : (
              // Edit form
              <Stack spacing={1.5}>
                <TextField
                  select fullWidth size="small" label="Típus"
                  value={editForm.document_type}
                  onChange={e => setEditForm(s => ({ ...s, document_type: e.target.value }))}
                >
                  {TYPE_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </TextField>
                <TextField
                  fullWidth size="small" label="Megnevezés"
                  value={editForm.document_name}
                  onChange={e => setEditForm(s => ({ ...s, document_name: e.target.value }))}
                />
                <TextField
                  fullWidth size="small" label="Dokumentum száma"
                  value={editForm.document_number}
                  onChange={e => setEditForm(s => ({ ...s, document_number: e.target.value }))}
                />
                <Stack direction="row" spacing={2}>
                  <TextField
                    fullWidth size="small" type="date" label="Kiállítás" InputLabelProps={{ shrink: true }}
                    value={editForm.issued_date}
                    onChange={e => setEditForm(s => ({ ...s, issued_date: e.target.value }))}
                  />
                  <TextField
                    fullWidth size="small" type="date" label="Lejárat" InputLabelProps={{ shrink: true }}
                    value={editForm.expiry_date}
                    onChange={e => setEditForm(s => ({ ...s, expiry_date: e.target.value }))}
                  />
                </Stack>
                <TextField
                  fullWidth size="small" multiline rows={2} label="Megjegyzés"
                  value={editForm.notes}
                  onChange={e => setEditForm(s => ({ ...s, notes: e.target.value }))}
                />
              </Stack>
            )}

            <Divider />

            {/* ── Audit log ────────────────────────────────────── */}
            <Accordion variant="outlined" defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <HistoryIcon fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Hozzáférési napló
                  </Typography>
                  <Chip size="small" label={(doc.accessed_log || []).length} />
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {(doc.accessed_log || []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Nincs napló bejegyzés.
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Mikor</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Ki</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Mit</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>IP</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(doc.accessed_log || [])
                        .slice(-20).reverse() // last 20, newest first
                        .map((e, i) => (
                          <TableRow key={i}>
                            <TableCell>{fmtDateTime(e.timestamp)}</TableCell>
                            <TableCell>{e.user_name || '—'}</TableCell>
                            <TableCell>
                              <Chip size="small" label={ACTION_LABEL[e.action] || e.action} variant="outlined" />
                            </TableCell>
                            <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>{e.ip || '—'}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </AccordionDetails>
            </Accordion>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {!editMode ? (
          <>
            {canModify && (
              <Button
                color="error" startIcon={<DeleteIcon />}
                onClick={handleDelete} disabled={deleting || loading}
              >
                Törlés
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            {canModify && (
              <Button
                startIcon={<EditIcon />}
                onClick={() => setEditMode(true)} disabled={loading}
              >
                Szerkesztés
              </Button>
            )}
            <Button
              variant="contained" startIcon={<DownloadIcon />}
              onClick={handleDownload} disabled={!blobUrl}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              Letöltés
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setEditMode(false)} disabled={saving}>Mégse</Button>
            <Button
              variant="contained" onClick={handleSave} disabled={saving}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              {saving ? <CircularProgress size={18} sx={{ color: 'white' }} /> : 'Mentés'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function MetaCell({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.25 }}>
        {children}
      </Typography>
    </Box>
  );
}
