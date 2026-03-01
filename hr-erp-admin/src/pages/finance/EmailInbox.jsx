import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, IconButton, Tooltip, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  Alert, LinearProgress,
} from '@mui/material';
import {
  Search as SearchIcon, Email as EmailIcon, Refresh as RefreshIcon,
  CloudUpload as UploadIcon, Visibility as ViewIcon,
  CheckCircle as ApprovedIcon, Cancel as RejectedIcon,
  AccessTime as PendingIcon, ErrorOutline as FailedIcon,
  Receipt as ReceiptIcon, Psychology as AiIcon,
  FilterList as FilterIcon, Clear as ClearIcon,
  Delete as DeleteIcon, Replay as ReOcrIcon,
} from '@mui/icons-material';
import { invoiceDraftsAPI, costCentersAPI } from '../../services/api';
import { toast } from 'react-toastify';
import DraftReviewModal from '../../components/finance/DraftReviewModal';

// ============================================
// CONSTANTS
// ============================================

const DRAFT_STATUSES = {
  pending: { label: 'Jóváhagyásra vár', color: 'warning', icon: <PendingIcon fontSize="small" /> },
  approved: { label: 'Jóváhagyva', color: 'success', icon: <ApprovedIcon fontSize="small" /> },
  rejected: { label: 'Elutasítva', color: 'error', icon: <RejectedIcon fontSize="small" /> },
  ocr_failed: { label: 'OCR sikertelen', color: 'default', icon: <FailedIcon fontSize="small" /> },
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
    <Card variant="outlined" sx={{ flex: 1, minWidth: 160 }}>
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
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);

  // Lookups
  const [costCenters, setCostCenters] = useState([]);
  const [costCenterTree, setCostCenterTree] = useState([]);

  // Review modal
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  // Upload
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // Polling
  const [polling, setPolling] = useState(false);

  // ============================================
  // DATA LOADING
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
    setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;

      const res = await invoiceDraftsAPI.getAll(params);
      if (res.success) {
        setDrafts(res.data);
        setTotal(res.pagination.total);
      }
    } catch (error) {
      toast.error('Hiba a piszkozatok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, filterStatus]);

  const loadStats = useCallback(async () => {
    try {
      const res = await invoiceDraftsAPI.getStats();
      if (res.success) setStats(res.data);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { loadLookups(); loadStats(); }, [loadLookups, loadStats]);
  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const clearFilters = () => {
    setFilterStatus('');
    setSearch('');
    setPage(0);
  };

  const handleView = (draft) => {
    setReviewDraft(draft);
    setReviewOpen(true);
  };

  const handlePollEmails = async () => {
    setPolling(true);
    try {
      const res = await invoiceDraftsAPI.pollEmails();
      toast.success(res.message || 'Email lekérdezés elindítva');
      // Reload after a delay to pick up new drafts
      setTimeout(() => { loadDrafts(); loadStats(); }, 3000);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba az email lekérdezéskor');
    } finally {
      setPolling(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
      toast.error('Csak PDF, PNG vagy JPG fájl engedélyezett');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await invoiceDraftsAPI.uploadPDF(formData);
      if (res.success) {
        toast.success(res.message || 'PDF feldolgozva');
        loadDrafts();
        loadStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a fájl feltöltésekor');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApprove = async (id, data) => {
    setReviewLoading(true);
    try {
      const res = await invoiceDraftsAPI.approve(id, data);
      if (res.success) {
        toast.success('Számla jóváhagyva');
        setReviewOpen(false);
        loadDrafts();
        loadStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a jóváhagyás során');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReject = async (id) => {
    setReviewLoading(true);
    try {
      const res = await invoiceDraftsAPI.reject(id);
      if (res.success) {
        toast.success('Piszkozat elutasítva');
        setReviewOpen(false);
        loadDrafts();
        loadStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba az elutasítás során');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleReOCR = async (id) => {
    setReviewLoading(true);
    try {
      const res = await invoiceDraftsAPI.reRunOCR(id);
      if (res.success) {
        toast.success('OCR újrafuttatás sikeres');
        setReviewDraft(res.data);
        loadDrafts();
        loadStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba az OCR újrafuttatásakor');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const res = await invoiceDraftsAPI.update(id, data);
      if (res.success) {
        toast.success('Piszkozat frissítve');
        setReviewDraft(res.data);
        loadDrafts();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a frissítés során');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Biztosan törölni szeretnéd ezt a piszkozatot?')) return;
    try {
      const res = await invoiceDraftsAPI.delete(id);
      if (res.success) {
        toast.success('Piszkozat törölve');
        loadDrafts();
        loadStats();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a törlés során');
    }
  };

  const hasActiveFilters = filterStatus || search;

  // ============================================
  // RENDER
  // ============================================

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Email számlák</Typography>
          <Typography variant="body2" color="text.secondary">
            Automatikus számla feldolgozás emailből - AI OCR és költséghely javaslat
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined" startIcon={polling ? <CircularProgress size={18} /> : <RefreshIcon />}
            onClick={handlePollEmails} disabled={polling}
          >
            Email lekérdezés
          </Button>
          <input
            ref={fileInputRef} type="file" hidden
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileUpload}
          />
          <Button
            variant="contained" startIcon={uploading ? <CircularProgress size={18} color="inherit" /> : <UploadIcon />}
            onClick={() => fileInputRef.current?.click()} disabled={uploading}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            PDF feltöltés
          </Button>
        </Stack>
      </Box>

      {/* Stats cards */}
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <StatCard
          title="Jóváhagyásra vár" value={stats?.pending ?? '-'}
          subtitle={stats ? formatCurrency(stats.pendingTotal) : ''}
          icon={<PendingIcon />} color="#f59e0b"
        />
        <StatCard
          title="Jóváhagyva" value={stats?.approved ?? '-'}
          subtitle={stats ? formatCurrency(stats.approvedTotal) : ''}
          icon={<ApprovedIcon />} color="#10b981"
        />
        <StatCard
          title="Elutasítva" value={stats?.rejected ?? '-'}
          icon={<RejectedIcon />} color="#ef4444"
        />
        <StatCard
          title="OCR sikertelen" value={stats?.failed ?? '-'}
          icon={<FailedIcon />} color="#6b7280"
        />
        <StatCard
          title="Összesen" value={stats?.total ?? '-'}
          icon={<EmailIcon />} color="#3b82f6"
        />
      </Stack>

      {/* Search and filter bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            fullWidth size="small" placeholder="Keresés szállító, számlaszám, email tárgy..."
            value={search} onChange={handleSearchChange}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Státusz</InputLabel>
            <Select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }} label="Státusz">
              <MenuItem value="">Mind</MenuItem>
              {Object.entries(DRAFT_STATUSES).map(([val, cfg]) => (
                <MenuItem key={val} value={val}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {cfg.icon}
                    <span>{cfg.label}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {hasActiveFilters && (
            <Button variant="text" startIcon={<ClearIcon />} onClick={clearFilters} color="error" size="small">
              Törlés
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : drafts.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <EmailIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {hasActiveFilters ? 'Nincs a szűrésnek megfelelő piszkozat' : 'Még nincsenek email számlák'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Töltsön fel PDF számlát, vagy konfigurálja a Gmail integrációt az automatikus feldolgozáshoz.
            </Typography>
            {!hasActiveFilters && (
              <Button variant="contained" startIcon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ mt: 2, bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
                Első számla feltöltése
              </Button>
            )}
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
                    const confidenceColor = confidence >= 70 ? '#10b981' : confidence >= 40 ? '#f59e0b' : '#ef4444';

                    return (
                      <TableRow key={draft.id} hover
                        sx={{
                          cursor: 'pointer',
                          bgcolor: draft.status === 'ocr_failed' ? 'rgba(239,68,68,0.04)' : 'transparent',
                        }}
                        onClick={() => handleView(draft)}
                      >
                        <TableCell>{formatDate(draft.createdAt)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{
                            fontWeight: 500, maxWidth: 200, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {draft.emailSubject || '-'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{
                            maxWidth: 200, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
                          }}>
                            {draft.emailFrom || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {draft.vendorName || '-'}
                          </Typography>
                          {draft.vendorTaxNumber && (
                            <Typography variant="caption" color="text.secondary">{draft.vendorTaxNumber}</Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{draft.invoiceNumber || '-'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatCurrency(draft.grossAmount)}
                        </TableCell>
                        <TableCell>{formatDate(draft.dueDate)}</TableCell>
                        <TableCell>
                          {draft.suggestedCostCenter ? (
                            <Tooltip title={`${confidence}% - ${draft.suggestionReasoning || ''}`}>
                              <Box>
                                <Chip
                                  icon={<AiIcon sx={{ fontSize: 14 }} />}
                                  label={draft.suggestedCostCenter.code}
                                  size="small" variant="outlined"
                                  sx={{ borderColor: confidenceColor, color: confidenceColor }}
                                />
                              </Box>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={statusCfg.icon}
                            label={statusCfg.label}
                            size="small"
                            color={statusCfg.color}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                            <Tooltip title="Áttekintés">
                              <IconButton size="small" onClick={() => handleView(draft)}>
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {draft.status === 'ocr_failed' && (
                              <Tooltip title="OCR újra">
                                <IconButton size="small" onClick={() => handleReOCR(draft.id)}>
                                  <ReOcrIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {draft.status !== 'approved' && (
                              <Tooltip title="Törlés">
                                <IconButton size="small" color="error" onClick={() => handleDelete(draft.id)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div" count={total} page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]}
              labelRowsPerPage="Sorok száma:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Review Modal */}
      <DraftReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        draft={reviewDraft}
        onApprove={handleApprove}
        onReject={handleReject}
        onReOCR={handleReOCR}
        onUpdate={handleUpdate}
        costCenters={costCenters}
        costCenterTree={costCenterTree}
        loading={reviewLoading}
      />
    </Box>
  );
}
