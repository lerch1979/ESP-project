import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, Tooltip, Chip,
  CircularProgress, Table, TableHead, TableBody, TableRow, TableCell,
  TableContainer, Paper, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Visibility as ViewIcon, Lock as LockIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { employeesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import EmployeeDocumentUploadModal from './EmployeeDocumentUploadModal';
import EmployeeDocumentViewModal from './EmployeeDocumentViewModal';

const TYPE_LABEL = {
  id_card:             'Személyi igazolvány',
  passport:            'Útlevél',
  work_permit:         'Munkavállalási engedély',
  health_insurance:    'TAJ / Egészségbiztosítás',
  bank_card:           'Bankkártya',
  address_card:        'Lakcímkártya',
  tax_card:            'Adóigazolvány',
  employment_contract: 'Munkaszerződés',
  other:               'Egyéb',
};

const TYPE_ICON = {
  id_card: '🪪', passport: '🛂', work_permit: '📜',
  health_insurance: '🏥', bank_card: '💳', address_card: '🏠',
  tax_card: '📋', employment_contract: '📑', other: '📄',
};

const TYPE_SORT_ORDER = {
  id_card: 0, passport: 1, work_permit: 2, address_card: 3,
  health_insurance: 4, tax_card: 5, employment_contract: 6,
  bank_card: 7, other: 99,
};

const fmtDate = (s) => s ? new Date(s).toLocaleDateString('hu-HU') : '—';

// Map an expiry_date to a display chip. 'expired' / 'soon' (<30 days) /
// 'valid' / 'no_expiry'. Used by both the list row and the view modal.
export function classifyExpiry(expiryDate) {
  if (!expiryDate) return { kind: 'no_expiry', label: 'Határozatlan', color: 'default' };
  const d = new Date(expiryDate);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (24 * 3600 * 1000));
  if (diffDays < 0)   return { kind: 'expired', label: `Lejárt (${-diffDays} napja)`, color: 'error' };
  if (diffDays <= 30) return { kind: 'soon',    label: `Lejár ${diffDays} nap múlva`, color: 'warning' };
  return { kind: 'valid', label: 'Érvényes', color: 'success' };
}

/**
 * Documents panel for a single employee. Renders inside the Documents
 * tab of EmployeeDetailModal. Self-contained: own load, own upload
 * dialog, own view dialog. Permission-aware:
 *   - admin / superadmin → full controls (upload, edit, delete)
 *   - the linked user (employees.user_id === auth.id) → own only,
 *     can upload, can't edit/delete (UI hides the buttons; backend
 *     enforces too)
 *   - others → backend returns 403, panel shows an explanation
 */
export default function EmployeeDocumentsPanel({ employeeId, employeeUserId }) {
  const { user } = useAuth();
  const slugs = user?.roleSlugs || user?.roles || [];
  const isAdmin = slugs.includes('admin') || slugs.includes('superadmin');
  const isSelf = !!employeeUserId && user?.id === employeeUserId;
  const canSee = isAdmin || isSelf;
  const canModify = isAdmin; // patch + delete

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewDocId, setViewDocId] = useState(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    if (!canSee) {
      setForbidden(true);
      setDocs([]);
      return;
    }
    setForbidden(false);
    setLoading(true);
    try {
      const r = await employeesAPI.docs.list(employeeId);
      if (r?.success) setDocs(r.data?.documents || []);
    } catch (err) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        toast.error('Dokumentumok betöltése sikertelen');
      }
    } finally {
      setLoading(false);
    }
  }, [employeeId, canSee]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    return [...docs].sort((a, b) => {
      const ta = TYPE_SORT_ORDER[a.document_type] ?? 99;
      const tb = TYPE_SORT_ORDER[b.document_type] ?? 99;
      if (ta !== tb) return ta - tb;
      // Then by expiry: expired first, then soon, then far. NULL last.
      const ea = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const eb = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;
      return ea - eb;
    });
  }, [docs]);

  const onUploaded = () => {
    setUploadOpen(false);
    load();
  };

  const onClosedView = (didChange) => {
    setViewDocId(null);
    if (didChange) load();
  };

  if (forbidden) {
    return (
      <Alert severity="warning" sx={{ mt: 2 }} icon={<LockIcon />}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Ezek a dokumentumok bizalmasak.
        </Typography>
        <Typography variant="body2">
          Csak admin / HR vagy a saját munkavállaló férhet hozzá. Ha hozzáférés
          kell, kérd az adminisztrátortól.
        </Typography>
      </Alert>
    );
  }

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          🔒 Bizalmas dokumentumok — minden megtekintés és letöltés naplózva van.
          Az itt tárolt fájlok csak admin/HR és a saját munkavállaló számára érhetők el.
        </Typography>
      </Alert>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            📂 Dokumentumok
          </Typography>
          {docs.length > 0 && <Chip size="small" label={docs.length} />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Frissítés">
            <IconButton size="small" onClick={load} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            size="small" variant="contained" startIcon={<AddIcon />}
            onClick={() => setUploadOpen(true)}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            Új dokumentum
          </Button>
        </Stack>
      </Stack>

      {loading && docs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={24} /></Box>
      ) : sorted.length === 0 ? (
        <Box sx={{
          textAlign: 'center', py: 4, color: 'text.secondary',
          border: '1px dashed #d1d5db', borderRadius: 1,
        }}>
          <Typography variant="h2" sx={{ mb: 0.5 }}>📂</Typography>
          <Typography variant="body2">Még nincs feltöltött dokumentum</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Típus</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Név / Szám</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Érvényesség</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Feltöltötte</TableCell>
                <TableCell align="right"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map(d => {
                const ex = classifyExpiry(d.expiry_date);
                return (
                  <TableRow
                    key={d.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setViewDocId(d.id)}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography component="span">{TYPE_ICON[d.document_type] || '📄'}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {d.document_type_label || TYPE_LABEL[d.document_type] || d.document_type}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{d.document_name || d.file_name || '—'}</Typography>
                      {d.document_number && (
                        <Typography variant="caption" color="text.secondary">
                          {d.document_number}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip size="small" label={ex.label} color={ex.color} variant="outlined" />
                        {d.expiry_date && (
                          <Typography variant="caption" color="text.secondary">
                            {fmtDate(d.issued_date)} → {fmtDate(d.expiry_date)}
                          </Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{d.uploaded_by_name || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtDate(d.uploaded_at)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Megtekintés">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setViewDocId(d.id); }}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <EmployeeDocumentUploadModal
        open={uploadOpen}
        employeeId={employeeId}
        onClose={() => setUploadOpen(false)}
        onUploaded={onUploaded}
      />

      <EmployeeDocumentViewModal
        open={!!viewDocId}
        employeeId={employeeId}
        docId={viewDocId}
        canModify={canModify}
        onClose={onClosedView}
      />
    </Box>
  );
}
