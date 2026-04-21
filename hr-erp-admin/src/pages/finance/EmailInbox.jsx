import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, IconButton, Tooltip, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  Tabs, Tab, LinearProgress, Checkbox, FormControlLabel,
} from '@mui/material';
import {
  Search as SearchIcon, Email as EmailIcon, Refresh as RefreshIcon,
  CloudUpload as UploadIcon, Visibility as ViewIcon,
  CheckCircle as ApprovedIcon, Cancel as RejectedIcon,
  AccessTime as PendingIcon, ErrorOutline as FailedIcon,
  Receipt as ReceiptIcon, Psychology as AiIcon,
  Clear as ClearIcon, Delete as DeleteIcon, Replay as ReOcrIcon,
  Description as DescIcon, ReportProblem as DamageIcon,
  Assignment as ContractIcon, AccountBalance as TaxIcon,
  Warning as WarningIcon, Send as SendIcon,
  Inbox as InboxIcon,
} from '@mui/icons-material';
import { invoiceDraftsAPI, costCentersAPI, emailInboxAPI } from '../../services/api';
import { toast } from 'react-toastify';
import DraftReviewModal from '../../components/finance/DraftReviewModal';
import DocumentReviewModal from '../../components/finance/DocumentReviewModal';

// ============================================
// CONSTANTS
// ============================================

const DRAFT_STATUSES = {
  pending: { label: 'Jóváhagyásra vár', color: 'warning', icon: <PendingIcon fontSize="small" /> },
  approved: { label: 'Jóváhagyva', color: 'success', icon: <ApprovedIcon fontSize="small" /> },
  rejected: { label: 'Elutasítva', color: 'error', icon: <RejectedIcon fontSize="small" /> },
  ocr_failed: { label: 'OCR sikertelen', color: 'default', icon: <FailedIcon fontSize="small" /> },
};

const DOC_TYPES = {
  invoice: { label: 'Számla', icon: <ReceiptIcon fontSize="small" />, color: '#1976d2' },
  damage_report: { label: 'Kárbejelentés', icon: <DamageIcon fontSize="small" />, color: '#d32f2f' },
  employee_contract: { label: 'Munkaszerződés', icon: <ContractIcon fontSize="small" />, color: '#388e3c' },
  service_contract: { label: 'Szolg. szerződés', icon: <ContractIcon fontSize="small" />, color: '#7b1fa2' },
  rental_contract: { label: 'Bérleti szerz.', icon: <ContractIcon fontSize="small" />, color: '#f57c00' },
  tax_document: { label: 'Adó dok.', icon: <TaxIcon fontSize="small" />, color: '#455a64' },
  payment_reminder: { label: 'Fizetési felsz.', icon: <WarningIcon fontSize="small" />, color: '#e64a19' },
  other: { label: 'Egyéb', icon: <DescIcon fontSize="small" />, color: '#757575' },
};

const INBOX_STATUSES = {
  pending: { label: 'Feldolgozásra vár', color: '#f57c00' },
  processed: { label: 'Feldolgozva', color: '#388e3c' },
  failed: { label: 'Sikertelen', color: '#d32f2f' },
  needs_review: { label: 'Felülvizsgálat', color: '#1976d2' },
};

const formatCurrency = (val, currency = 'HUF') => {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU');
};

// ============================================
// STAT CARD
// ============================================

function StatCard({ title, value, subtitle, color, icon }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 140 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="caption" color="text.secondary">{title}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: color || 'text.primary' }}>{value}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
          {icon && <Box sx={{ color: color || '#94a3b8', mt: 0.5 }}>{icon}</Box>}
        </Box>
      </CardContent>
    </Card>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function EmailInbox() {
  // Initial tab: honor ?tab=1 query param (used by /finance/email-inbox redirect
  // so admins landing there go straight to "Dokumentum besorolás" where the new
  // invoice-classification features live). Default tab 0 (Számla piszkozatok)
  // for the bare /email-inbox URL preserves legacy behavior.
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === '1' ? 1 : 0;
  });

  // ---- Invoice Drafts state ----
  const [drafts, setDrafts] = useState([]);
  const [draftLoading, setDraftLoading] = useState(true);
  const [draftPage, setDraftPage] = useState(0);
  const [draftRows, setDraftRows] = useState(25);
  const [draftTotal, setDraftTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftFilter, setDraftFilter] = useState('');
  const [draftStats, setDraftStats] = useState(null);
  const [costCenters, setCostCenters] = useState([]);
  const [costCenterTree, setCostCenterTree] = useState([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const draftFileRef = useRef(null);
  const [draftUploading, setDraftUploading] = useState(false);
  const [polling, setPolling] = useState(false);

  // ---- Email Inbox (all docs) state ----
  const [inboxItems, setInboxItems] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [inboxPage, setInboxPage] = useState(0);
  const [inboxRows, setInboxRows] = useState(25);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxDocType, setInboxDocType] = useState('');
  const [inboxStatus, setInboxStatus] = useState('');
  const [inboxOnlyOverdue, setInboxOnlyOverdue] = useState(false);
  const [inboxShowRejected, setInboxShowRejected] = useState(false);
  const [inboxStats, setInboxStats] = useState(null);
  const [docReviewOpen, setDocReviewOpen] = useState(false);
  const [docReviewItem, setDocReviewItem] = useState(null);
  const inboxFileRef = useRef(null);
  const [inboxUploading, setInboxUploading] = useState(false);
  const [inboxPolling, setInboxPolling] = useState(false);
  const [gmailStatus, setGmailStatus] = useState(null);

  // ============================================
  // DATA LOADING - Invoice Drafts
  // ============================================

  const loadLookups = useCallback(async () => {
    try {
      const [ccRes, treeRes] = await Promise.all([
        costCentersAPI.getAll({ limit: 500 }),
        costCentersAPI.getTree({ is_active: 'true' }),
      ]);
      if (ccRes.success) setCostCenters(ccRes.data);
      if (treeRes.success) setCostCenterTree(treeRes.data);
    } catch (e) { /* silent */ }
  }, []);

  const loadDrafts = useCallback(async () => {
    setDraftLoading(true);
    try {
      const params = { page: draftPage + 1, limit: draftRows };
      if (draftSearch) params.search = draftSearch;
      if (draftFilter) params.status = draftFilter;
      const res = await invoiceDraftsAPI.getAll(params);
      if (res.success) { setDrafts(res.data); setDraftTotal(res.pagination.total); }
    } catch (e) { toast.error('Hiba a piszkozatok betöltésekor'); }
    finally { setDraftLoading(false); }
  }, [draftPage, draftRows, draftSearch, draftFilter]);

  const loadDraftStats = useCallback(async () => {
    try {
      const res = await invoiceDraftsAPI.getStats();
      if (res.success) setDraftStats(res.data);
    } catch (e) { /* silent */ }
  }, []);

  // ============================================
  // DATA LOADING - Email Inbox
  // ============================================

  const loadInboxItems = useCallback(async () => {
    setInboxLoading(true);
    try {
      const params = { page: inboxPage + 1, limit: inboxRows };
      if (inboxSearch) params.search = inboxSearch;
      if (inboxDocType) params.document_type = inboxDocType;
      if (inboxStatus) params.status = inboxStatus;
      const res = await emailInboxAPI.getAll(params);
      if (res.success) { setInboxItems(res.data); setInboxTotal(res.pagination.total); }
    } catch (e) { toast.error('Hiba a dokumentumok betöltésekor'); }
    finally { setInboxLoading(false); }
  }, [inboxPage, inboxRows, inboxSearch, inboxDocType, inboxStatus]);

  const loadInboxStats = useCallback(async () => {
    try {
      const res = await emailInboxAPI.getStats();
      if (res.success) setInboxStats(res.data);
    } catch (e) { /* silent */ }
  }, []);

  const loadGmailStatus = useCallback(async () => {
    try {
      const res = await emailInboxAPI.getGmailStatus();
      if (res.success) setGmailStatus(res.data);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);
  useEffect(() => { if (tab === 0) { loadDrafts(); loadDraftStats(); } }, [tab, loadDrafts, loadDraftStats]);
  useEffect(() => { if (tab === 1) { loadInboxItems(); loadInboxStats(); loadGmailStatus(); } }, [tab, loadInboxItems, loadInboxStats, loadGmailStatus]);

  // ============================================
  // DERIVED DATA - Email Inbox (duplicates / overdue / sort / summary)
  // ============================================

  // Set of invoice numbers appearing more than once in the current page's items
  const duplicateInvoiceNumbers = useMemo(() => {
    const counts = new Map();
    inboxItems.forEach((it) => {
      if (it.invoiceNumber) counts.set(it.invoiceNumber, (counts.get(it.invoiceNumber) || 0) + 1);
    });
    const dup = new Set();
    counts.forEach((n, k) => { if (n > 1) dup.add(k); });
    return dup;
  }, [inboxItems]);

  // Filtered + sorted items used by the table
  const inboxItemsView = useMemo(() => {
    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    let list = inboxItems;
    // Hide 'rejected' rows by default — they're low-confidence non-financial docs
    // that the OCR validator filtered out. Toggle to audit.
    if (!inboxShowRejected) {
      list = list.filter((it) => it.status !== 'rejected');
    }
    if (inboxOnlyOverdue) {
      list = list.filter((it) =>
        it.dueDate &&
        new Date(it.dueDate).getTime() < now &&
        it.documentType === 'invoice' &&
        !['paid', 'archived'].includes(it.status)
      );
    }
    const classify = (it) => {
      if (!it.dueDate) return 2;
      const t = new Date(it.dueDate).getTime();
      const overdue = t < now && !['paid', 'archived'].includes(it.status);
      if (overdue) return 0;
      if (t - now < threeDays) return 1;
      return 2;
    };
    return [...list].sort((a, b) => {
      const ca = classify(a);
      const cb = classify(b);
      if (ca !== cb) return ca - cb;
      if (ca === 0 || ca === 1) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [inboxItems, inboxOnlyOverdue, inboxShowRejected]);

  // Summary metrics for the bar above the table
  const inboxInvoiceSummary = useMemo(() => {
    const now = Date.now();
    let pendingCount = 0;
    let pendingGross = 0;
    let overdueCount = 0;
    inboxItems.forEach((it) => {
      if (it.documentType === 'invoice' && it.status !== 'paid') {
        pendingCount += 1;
        if (typeof it.grossAmount === 'number') pendingGross += it.grossAmount;
      }
      if (it.dueDate && new Date(it.dueDate).getTime() < now && it.status !== 'paid') {
        overdueCount += 1;
      }
    });
    return { pendingCount, pendingGross, overdueCount };
  }, [inboxItems]);

  // ============================================
  // HANDLERS - Invoice Drafts
  // ============================================

  const handlePollEmails = async () => {
    setPolling(true);
    try {
      const res = await invoiceDraftsAPI.pollEmails();
      toast.success(res.message || 'Email lekérdezés elindítva');
      setTimeout(() => { loadDrafts(); loadDraftStats(); }, 3000);
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba az email lekérdezéskor'); }
    finally { setPolling(false); }
  };

  const handleDraftUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDraftUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await invoiceDraftsAPI.uploadPDF(formData);
      if (res.success) { toast.success(res.message); loadDrafts(); loadDraftStats(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba a feltöltésekor'); }
    finally { setDraftUploading(false); if (draftFileRef.current) draftFileRef.current.value = ''; }
  };

  const handleApprove = async (id, data) => {
    setReviewLoading(true);
    try {
      const res = await invoiceDraftsAPI.approve(id, data);
      if (res.success) { toast.success('Számla jóváhagyva'); setReviewOpen(false); loadDrafts(); loadDraftStats(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba a jóváhagyás során'); }
    finally { setReviewLoading(false); }
  };

  const handleReject = async (id) => {
    setReviewLoading(true);
    try {
      const res = await invoiceDraftsAPI.reject(id);
      if (res.success) { toast.success('Elutasítva'); setReviewOpen(false); loadDrafts(); loadDraftStats(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba'); }
    finally { setReviewLoading(false); }
  };

  const handleReOCR = async (id) => {
    setReviewLoading(true);
    try {
      const res = await invoiceDraftsAPI.reRunOCR(id);
      if (res.success) { toast.success('OCR újrafuttatás sikeres'); setReviewDraft(res.data); loadDrafts(); loadDraftStats(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba'); }
    finally { setReviewLoading(false); }
  };

  const handleDraftUpdate = async (id, data) => {
    try {
      const res = await invoiceDraftsAPI.update(id, data);
      if (res.success) { toast.success('Frissítve'); setReviewDraft(res.data); loadDrafts(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba'); }
  };

  const handleDraftDelete = async (id) => {
    if (!window.confirm('Biztosan törli?')) return;
    try {
      const res = await invoiceDraftsAPI.delete(id);
      if (res.success) { toast.success('Törölve'); loadDrafts(); loadDraftStats(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba'); }
  };

  // ============================================
  // HANDLERS - Email Inbox
  // ============================================

  const handleInboxPollEmails = async () => {
    setInboxPolling(true);
    try {
      const res = await emailInboxAPI.pollEmails();
      const data = res.data || {};
      toast.success(`Email lekérdezés kész: ${data.processed || 0} feldolgozva, ${data.skipped || 0} kihagyva`);
      loadInboxItems();
      loadInboxStats();
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba az email lekérdezéskor'); }
    finally { setInboxPolling(false); }
  };

  const handleInboxUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInboxUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subject', file.name);
      const res = await emailInboxAPI.upload(formData);
      if (res.success) {
        toast.success(res.message);
        loadInboxItems();
        loadInboxStats();
      }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba a feltöltésekor'); }
    finally { setInboxUploading(false); if (inboxFileRef.current) inboxFileRef.current.value = ''; }
  };

  const handleInboxRoute = async (id) => {
    try {
      const res = await emailInboxAPI.route(id);
      if (res.success) { toast.success('Dokumentum továbbítva'); loadInboxItems(); loadInboxStats(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba a továbbításnál'); }
  };

  const handleInboxDelete = async (id) => {
    if (!window.confirm('Biztosan törli?')) return;
    try {
      const res = await emailInboxAPI.delete(id);
      if (res.success) { toast.success('Törölve'); loadInboxItems(); loadInboxStats(); }
    } catch (e) { toast.error(e.response?.data?.message || 'Hiba'); }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Email feldolgozás</Typography>
          <Typography variant="body2" color="text.secondary">
            Automatikus dokumentum besorolás, OCR feldolgozás és továbbítás
          </Typography>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab icon={<ReceiptIcon />} iconPosition="start" label="Számla piszkozatok" />
          <Tab icon={<InboxIcon />} iconPosition="start" label="Dokumentum besorolás" />
        </Tabs>
      </Paper>

      {/* ============= TAB 0: Invoice Drafts ============= */}
      {tab === 0 && (
        <>
          {/* Actions */}
          <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} justifyContent="flex-end">
            <Button variant="outlined" startIcon={polling ? <CircularProgress size={18} /> : <RefreshIcon />}
              onClick={handlePollEmails} disabled={polling}>Email lekérdezés</Button>
            <input ref={draftFileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg" onChange={handleDraftUpload} />
            <Button variant="contained" startIcon={draftUploading ? <CircularProgress size={18} color="inherit" /> : <UploadIcon />}
              onClick={() => draftFileRef.current?.click()} disabled={draftUploading}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
              Számla feltöltés
            </Button>
          </Stack>

          {/* Stats */}
          <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
            <StatCard title="Jóváhagyásra vár" value={draftStats?.pending ?? '-'} subtitle={draftStats ? formatCurrency(draftStats.pendingTotal) : ''} icon={<PendingIcon />} color="#f59e0b" />
            <StatCard title="Jóváhagyva" value={draftStats?.approved ?? '-'} subtitle={draftStats ? formatCurrency(draftStats.approvedTotal) : ''} icon={<ApprovedIcon />} color="#10b981" />
            <StatCard title="Elutasítva" value={draftStats?.rejected ?? '-'} icon={<RejectedIcon />} color="#ef4444" />
            <StatCard title="OCR sikertelen" value={draftStats?.failed ?? '-'} icon={<FailedIcon />} color="#6b7280" />
            <StatCard title="Összesen" value={draftStats?.total ?? '-'} icon={<EmailIcon />} color="#3b82f6" />
          </Stack>

          {/* Filters */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField fullWidth size="small" placeholder="Keresés szállító, számlaszám, email tárgy..."
                value={draftSearch} onChange={(e) => { setDraftSearch(e.target.value); setDraftPage(0); }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Státusz</InputLabel>
                <Select value={draftFilter} onChange={(e) => { setDraftFilter(e.target.value); setDraftPage(0); }} label="Státusz">
                  <MenuItem value="">Mind</MenuItem>
                  {Object.entries(DRAFT_STATUSES).map(([val, cfg]) => (
                    <MenuItem key={val} value={val}><Stack direction="row" spacing={1} alignItems="center">{cfg.icon}<span>{cfg.label}</span></Stack></MenuItem>
                  ))}
                </Select>
              </FormControl>
              {(draftFilter || draftSearch) && (
                <Button variant="text" startIcon={<ClearIcon />} onClick={() => { setDraftFilter(''); setDraftSearch(''); setDraftPage(0); }} color="error" size="small">Törlés</Button>
              )}
            </Stack>
          </Paper>

          {/* Table */}
          <Paper>
            {draftLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
            ) : drafts.length === 0 ? (
              <Box sx={{ p: 5, textAlign: 'center' }}>
                <EmailIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">Nincs számla piszkozat</Typography>
              </Box>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Beérkezés</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Email / Forrás</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Szállító</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Számlaszám</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">Bruttó</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Határidő</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>AI költséghely</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 100 }}>Műveletek</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {drafts.map((draft) => {
                        const statusCfg = DRAFT_STATUSES[draft.status] || DRAFT_STATUSES.pending;
                        const confidence = draft.costCenterConfidence;
                        const cColor = confidence >= 70 ? '#10b981' : confidence >= 40 ? '#f59e0b' : '#ef4444';
                        return (
                          <TableRow key={draft.id} hover sx={{ cursor: 'pointer' }} onClick={() => { setReviewDraft(draft); setReviewOpen(true); }}>
                            <TableCell>{formatDate(draft.createdAt)}</TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft.emailSubject || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{draft.emailFrom || '-'}</Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>{draft.vendorName || '-'}</Typography>
                              {draft.vendorTaxNumber && <Typography variant="caption" color="text.secondary">{draft.vendorTaxNumber}</Typography>}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{draft.invoiceNumber || '-'}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCurrency(draft.grossAmount)}</TableCell>
                            <TableCell>{formatDate(draft.dueDate)}</TableCell>
                            <TableCell>
                              {draft.suggestedCostCenter ? (
                                <Tooltip title={`${confidence}% - ${draft.suggestionReasoning || ''}`}>
                                  <Box><Chip icon={<AiIcon sx={{ fontSize: 14 }} />} label={draft.suggestedCostCenter.code} size="small" variant="outlined" sx={{ borderColor: cColor, color: cColor }} /></Box>
                                </Tooltip>
                              ) : <Typography variant="caption" color="text.secondary">-</Typography>}
                            </TableCell>
                            <TableCell><Chip icon={statusCfg.icon} label={statusCfg.label} size="small" color={statusCfg.color} /></TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                                <Tooltip title="Áttekintés"><IconButton size="small" onClick={() => { setReviewDraft(draft); setReviewOpen(true); }}><ViewIcon fontSize="small" /></IconButton></Tooltip>
                                {draft.status === 'ocr_failed' && <Tooltip title="OCR újra"><IconButton size="small" onClick={() => handleReOCR(draft.id)}><ReOcrIcon fontSize="small" /></IconButton></Tooltip>}
                                {draft.status !== 'approved' && <Tooltip title="Törlés"><IconButton size="small" color="error" onClick={() => handleDraftDelete(draft.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination component="div" count={draftTotal} page={draftPage}
                  onPageChange={(_, p) => setDraftPage(p)} rowsPerPage={draftRows}
                  onRowsPerPageChange={(e) => { setDraftRows(parseInt(e.target.value)); setDraftPage(0); }}
                  rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Sorok:" labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`} />
              </>
            )}
          </Paper>

          <DraftReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} draft={reviewDraft}
            onApprove={handleApprove} onReject={handleReject} onReOCR={handleReOCR} onUpdate={handleDraftUpdate}
            costCenters={costCenters} costCenterTree={costCenterTree} loading={reviewLoading} />
        </>
      )}

      {/* ============= TAB 1: Document Classification ============= */}
      {tab === 1 && (
        <>
          {/* Actions */}
          <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center" justifyContent="flex-end">
            {gmailStatus && (
              <Chip
                size="small"
                label={gmailStatus.connected ? 'Gmail csatlakozva' : gmailStatus.configured ? 'Gmail konfigurálva' : 'Gmail nincs beállítva'}
                color={gmailStatus.connected ? 'success' : gmailStatus.configured ? 'warning' : 'default'}
                variant="outlined"
                sx={{ mr: 'auto' }}
              />
            )}
            <Button variant="outlined" startIcon={inboxPolling ? <CircularProgress size={18} /> : <EmailIcon />}
              onClick={handleInboxPollEmails} disabled={inboxPolling || (gmailStatus && !gmailStatus.configured)}>
              Email lekérdezés
            </Button>
            <input ref={inboxFileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" onChange={handleInboxUpload} />
            <Button variant="contained" startIcon={inboxUploading ? <CircularProgress size={18} color="inherit" /> : <UploadIcon />}
              onClick={() => inboxFileRef.current?.click()} disabled={inboxUploading}
              sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
              Dokumentum feltöltés
            </Button>
          </Stack>

          {/* Stats */}
          <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
            <StatCard title="Feldolgozásra vár" value={inboxStats?.pending ?? '-'} icon={<PendingIcon />} color="#f59e0b" />
            <StatCard title="Feldolgozva" value={inboxStats?.processed ?? '-'} icon={<ApprovedIcon />} color="#10b981" />
            <StatCard title="Felülvizsgálat" value={inboxStats?.needs_review ?? '-'} icon={<WarningIcon />} color="#1976d2" />
            <StatCard title="Sikertelen" value={inboxStats?.failed ?? '-'} icon={<FailedIcon />} color="#ef4444" />
            <StatCard title="Összesen" value={inboxStats?.total ?? '-'} icon={<InboxIcon />} color="#7c3aed" />
          </Stack>

          {/* Invoice summary bar */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={4} alignItems="center" flexWrap="wrap">
                <Box>
                  <Typography variant="caption" color="text.secondary">Függő számlák</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{inboxInvoiceSummary.pendingCount} db</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Összes bruttó</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {new Intl.NumberFormat('hu-HU').format(inboxInvoiceSummary.pendingGross)} Ft
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Lejárt</Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 700 }}
                    color={inboxInvoiceSummary.overdueCount > 0 ? 'error' : 'text.primary'}
                  >
                    {inboxInvoiceSummary.overdueCount} db
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* Type breakdown cards */}
          {inboxStats && (
            <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap' }}>
              {Object.entries(DOC_TYPES).map(([type, cfg]) => {
                const count = inboxStats[type === 'other' ? 'other' : type + 's'] || inboxStats[type] || 0;
                if (!count && count !== 0) return null;
                return (
                  <Chip key={type} icon={cfg.icon} label={`${cfg.label}: ${count}`} size="small"
                    onClick={() => { setInboxDocType(type); setInboxPage(0); }}
                    variant={inboxDocType === type ? 'filled' : 'outlined'}
                    sx={{ borderColor: cfg.color, color: inboxDocType === type ? '#fff' : cfg.color, bgcolor: inboxDocType === type ? cfg.color : 'transparent',
                      '& .MuiChip-icon': { color: inboxDocType === type ? '#fff' : cfg.color } }} />
                );
              })}
              {inboxDocType && (
                <Chip label="Szűrő törlése" size="small" onDelete={() => setInboxDocType('')} color="default" />
              )}
            </Stack>
          )}

          {/* Filters */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField fullWidth size="small" placeholder="Keresés email, fájlnév, besorolás..."
                value={inboxSearch} onChange={(e) => { setInboxSearch(e.target.value); setInboxPage(0); }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Státusz</InputLabel>
                <Select value={inboxStatus} onChange={(e) => { setInboxStatus(e.target.value); setInboxPage(0); }} label="Státusz">
                  <MenuItem value="">Mind</MenuItem>
                  {Object.entries(INBOX_STATUSES).map(([val, cfg]) => (
                    <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={inboxOnlyOverdue}
                    onChange={(e) => { setInboxOnlyOverdue(e.target.checked); setInboxPage(0); }}
                  />
                }
                label="Csak lejárt"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={inboxShowRejected}
                    onChange={(e) => { setInboxShowRejected(e.target.checked); setInboxPage(0); }}
                  />
                }
                label="Elutasított emailek megjelenítése"
              />
              {(inboxSearch || inboxStatus || inboxDocType || inboxOnlyOverdue || inboxShowRejected) && (
                <Button variant="text" startIcon={<ClearIcon />} onClick={() => { setInboxSearch(''); setInboxStatus(''); setInboxDocType(''); setInboxOnlyOverdue(false); setInboxShowRejected(false); setInboxPage(0); }} color="error" size="small">Törlés</Button>
              )}
            </Stack>
          </Paper>

          {/* Table */}
          <Paper>
            {inboxLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
            ) : inboxItems.length === 0 ? (
              <Box sx={{ p: 5, textAlign: 'center' }}>
                <InboxIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">Nincs dokumentum</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Töltsön fel egy dokumentumot az automatikus besoroláshoz és továbbításhoz.
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Beérkezés</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Forrás</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Tárgy / Fájlnév</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Szállító</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Számlaszám</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">Bruttó</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Fiz. határidő</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Dokumentum típus</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>AI bizonyosság</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Továbbítva</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Költséghely</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 120 }}>Műveletek</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {inboxItemsView.map((item) => {
                        const typeCfg = DOC_TYPES[item.documentType] || DOC_TYPES.other;
                        const statusCfg = INBOX_STATUSES[item.status] || INBOX_STATUSES.pending;
                        const conf = item.confidenceScore || 0;
                        const isDuplicate = item.invoiceNumber && duplicateInvoiceNumbers.has(item.invoiceNumber);
                        const now = Date.now();
                        const threeDays = 3 * 24 * 60 * 60 * 1000;
                        const dueTs = item.dueDate ? new Date(item.dueDate).getTime() : null;
                        const isOverdue = dueTs !== null && dueTs < now && !['paid', 'archived'].includes(item.status);
                        const isSoon = dueTs !== null && !isOverdue && dueTs - now < threeDays;
                        const vendorShort = item.vendorName
                          ? (item.vendorName.length > 30 ? item.vendorName.slice(0, 30) + '…' : item.vendorName)
                          : '';
                        const grossText = (item.grossAmount !== null && item.grossAmount !== undefined)
                          ? `${new Intl.NumberFormat('hu-HU').format(item.grossAmount)} ${item.currency || 'Ft'}`
                          : '';
                        const dueShort = item.dueDate ? String(item.dueDate).slice(0, 10) : '';
                        const rowBg = isOverdue
                          ? 'rgba(220,0,0,0.06)'
                          : (isDuplicate ? 'rgba(255, 193, 7, 0.08)' : undefined);
                        return (
                          <TableRow
                            key={item.id}
                            hover
                            sx={{ cursor: 'pointer', backgroundColor: rowBg }}
                            onClick={() => { setDocReviewItem(item); setDocReviewOpen(true); }}
                          >
                            <TableCell>{formatDate(item.createdAt)}</TableCell>
                            <TableCell>
                              {item.source === 'gmail' ? (
                                <Chip label="Gmail" size="small" sx={{ bgcolor: '#ea4335', color: '#fff', fontSize: '0.7rem', height: 22 }} />
                              ) : (
                                <Typography variant="caption" color="text.secondary">Kézi</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.emailSubject || '-'}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{item.attachmentFilename || item.emailFrom || '-'}</Typography>
                            </TableCell>
                            <TableCell>
                              {item.vendorName ? (
                                <Typography variant="body2" title={item.vendorName}>{vendorShort}</Typography>
                              ) : (
                                <Typography variant="caption" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                  {item.invoiceNumber || ''}
                                </Typography>
                                {isDuplicate && (
                                  <Tooltip title="Ez a számlaszám már szerepel a rendszerben">
                                    <Chip label="⚠️ Duplikált" color="warning" size="small" />
                                  </Tooltip>
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{grossText}</TableCell>
                            <TableCell>
                              {dueShort ? (
                                isOverdue ? (
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Typography variant="body2">{dueShort}</Typography>
                                    <Chip label="Lejárt!" color="error" size="small" />
                                  </Stack>
                                ) : isSoon ? (
                                  <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Typography variant="body2">{dueShort}</Typography>
                                    <Chip label="Hamarosan lejár" color="warning" size="small" />
                                  </Stack>
                                ) : (
                                  <Typography variant="body2">{dueShort}</Typography>
                                )
                              ) : (
                                <Typography variant="caption" color="text.secondary">-</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip icon={typeCfg.icon} label={typeCfg.label} size="small"
                                sx={{ bgcolor: typeCfg.color, color: '#fff', '& .MuiChip-icon': { color: '#fff' } }} />
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <LinearProgress variant="determinate" value={conf} sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: '#e0e0e0',
                                  '& .MuiLinearProgress-bar': { bgcolor: conf >= 70 ? '#4caf50' : conf >= 40 ? '#ff9800' : '#f44336' } }} />
                                <Typography variant="caption" fontWeight="bold">{conf}%</Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              {item.routedTo ? (
                                <Chip label={item.routedTo} size="small" color="success" variant="outlined" />
                              ) : <Typography variant="caption" color="text.secondary">-</Typography>}
                            </TableCell>
                            <TableCell>
                              <Chip label={statusCfg.label} size="small" sx={{ bgcolor: statusCfg.color, color: '#fff' }} />
                            </TableCell>
                            <TableCell>
                              {item.costCenterCode ? (
                                <Tooltip title={item.classificationReason || ''}>
                                  <Chip
                                    label={item.costCenterCode}
                                    size="small"
                                    color={item.autoClassified ? 'default' : 'warning'}
                                    sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                                  />
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                                <Tooltip title="Áttekintés"><IconButton size="small" onClick={() => { setDocReviewItem(item); setDocReviewOpen(true); }}><ViewIcon fontSize="small" /></IconButton></Tooltip>
                                {item.status !== 'processed' && (
                                  <Tooltip title="Továbbítás"><IconButton size="small" color="primary" onClick={() => handleInboxRoute(item.id)}><SendIcon fontSize="small" /></IconButton></Tooltip>
                                )}
                                {item.status !== 'processed' && (
                                  <Tooltip title="Törlés"><IconButton size="small" color="error" onClick={() => handleInboxDelete(item.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination component="div" count={inboxTotal} page={inboxPage}
                  onPageChange={(_, p) => setInboxPage(p)} rowsPerPage={inboxRows}
                  onRowsPerPageChange={(e) => { setInboxRows(parseInt(e.target.value)); setInboxPage(0); }}
                  rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Sorok:" labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`} />
              </>
            )}
          </Paper>

          <DocumentReviewModal open={docReviewOpen} onClose={() => setDocReviewOpen(false)} document={docReviewItem}
            onUpdate={() => { loadInboxItems(); loadInboxStats(); }} />
        </>
      )}
    </Box>
  );
}
