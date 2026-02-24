import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, IconButton, Tooltip, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  Alert, Checkbox, Toolbar,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Delete as DeleteIcon, Receipt as ReceiptIcon,
  FilterList as FilterIcon, Clear as ClearIcon,
  AccessTime as PendingIcon, CheckCircle as PaidIcon,
  Warning as OverdueIcon, Visibility as ViewIcon,
  CalendarMonth as MonthlyIcon, FileDownload as ExportIcon,
  CheckBox as BulkPaidIcon, FolderZip as FolderExportIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { costCentersAPI, UPLOADS_BASE_URL } from '../services/api';
import { toast } from 'react-toastify';
import CostCenterSelector from '../components/invoices/CostCenterSelector';
import InvoiceDetailDialog from '../components/invoices/InvoiceDetailDialog';
import InvoiceFormModal from '../components/invoices/InvoiceFormModal';
import ExportToFolderModal from '../components/invoices/ExportToFolderModal';

// ============================================
// CONSTANTS
// ============================================

const PAYMENT_STATUSES = {
  pending: { label: 'Függőben', color: 'warning', icon: <PendingIcon fontSize="small" /> },
  paid: { label: 'Fizetve', color: 'success', icon: <PaidIcon fontSize="small" /> },
  overdue: { label: 'Lejárt', color: 'error', icon: <OverdueIcon fontSize="small" /> },
  cancelled: { label: 'Sztornó', color: 'default', icon: null },
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
    <Card variant="outlined" sx={{ flex: 1, minWidth: 180 }}>
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
// CSV EXPORT HELPER
// ============================================

function exportToCsv(invoices) {
  const headers = ['Számlaszám', 'Szállító', 'Nettó', 'ÁFA', 'Bruttó', 'Pénznem', 'Dátum', 'Határidő', 'Státusz', 'Költséghely', 'Kategória'];
  const rows = invoices.map((inv) => [
    inv.invoice_number || '', inv.vendor_name || '',
    inv.amount || 0, inv.vat_amount || 0, inv.total_amount || 0, inv.currency || 'HUF',
    inv.invoice_date ? inv.invoice_date.substring(0, 10) : '', inv.due_date ? inv.due_date.substring(0, 10) : '',
    PAYMENT_STATUSES[inv.payment_status]?.label || inv.payment_status,
    inv.cost_center_name || '', inv.category_name || '',
  ]);

  const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `szamlak_export_${new Date().toISOString().substring(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================
// MAIN PAGE
// ============================================

function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCostCenter, setFilterCostCenter] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Lookups
  const [costCenters, setCostCenters] = useState([]);
  const [costCenterTree, setCostCenterTree] = useState([]);
  const [categories, setCategories] = useState([]);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Stats
  const [stats, setStats] = useState(null);

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ============================================
  // DATA LOADING
  // ============================================

  const loadLookups = useCallback(async () => {
    try {
      const [ccRes, treeRes, catRes] = await Promise.all([
        costCentersAPI.getAll({ limit: 500 }),
        costCentersAPI.getTree({ is_active: 'true' }),
        costCentersAPI.getInvoiceCategories(),
      ]);
      if (ccRes.success) setCostCenters(ccRes.data);
      if (treeRes.success) setCostCenterTree(treeRes.data);
      if (catRes.success) setCategories(catRes.data);
    } catch (e) { /* silent */ }
  }, []);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage };
      if (search) params.search = search;
      if (filterStatus) params.payment_status = filterStatus;
      if (filterCostCenter) params.cost_center_id = filterCostCenter;
      if (filterCategory) params.category_id = filterCategory;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      if (filterVendor) params.search = filterVendor; // vendor uses same search

      const res = await costCentersAPI.getInvoices(params);
      if (res.success) {
        setInvoices(res.data);
        setTotal(res.pagination.total);
      }
    } catch (error) {
      toast.error('Hiba a számlák betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, filterStatus, filterCostCenter, filterCategory, filterDateFrom, filterDateTo, filterVendor]);

  const loadStats = useCallback(async () => {
    try {
      const res = await costCentersAPI.getInvoiceStats();
      if (res.success) setStats(res.data);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => { loadLookups(); loadStats(); }, [loadLookups, loadStats]);
  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(0);
  };

  const clearFilters = () => {
    setFilterStatus('');
    setFilterCostCenter('');
    setFilterCategory('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterVendor('');
    setSearch('');
    setPage(0);
  };

  const hasActiveFilters = filterStatus || filterCostCenter || filterCategory || filterDateFrom || filterDateTo || filterVendor;

  const handleCreate = () => { setEditData(null); setFormOpen(true); };
  const handleEdit = (invoice) => { setEditData(invoice); setFormOpen(true); };
  const handleView = (invoice) => { setDetailInvoice(invoice); setDetailOpen(true); };

  const handleSave = async (data, file) => {
    let savedInvoice;
    if (editData) {
      const res = await costCentersAPI.updateInvoice(editData.id, data);
      if (res.success) {
        toast.success(res.message);
        savedInvoice = res.data;
      }
    } else {
      const res = await costCentersAPI.createInvoice(data);
      if (res.success) {
        toast.success(res.message);
        savedInvoice = res.data;
      }
    }

    // Upload file if provided
    if (file && savedInvoice) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        await costCentersAPI.uploadInvoiceFile(savedInvoice.id, formData);
        toast.success('Fájl sikeresen feltöltve');
      } catch (err) {
        toast.error('A számla mentve, de a fájl feltöltés sikertelen');
      }
    }

    loadInvoices();
    loadStats();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await costCentersAPI.deleteInvoice(deleteConfirm.id);
      if (res.success) { toast.success(res.message); loadInvoices(); loadStats(); }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a törlés során');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleStatusChange = async (invoice, newStatus) => {
    try {
      const data = { payment_status: newStatus };
      if (newStatus === 'paid') data.payment_date = new Date().toISOString().substring(0, 10);
      const res = await costCentersAPI.updateInvoice(invoice.id, data);
      if (res.success) { toast.success('Státusz frissítve'); loadInvoices(); loadStats(); }
    } catch (error) {
      toast.error('Hiba a státusz frissítése során');
    }
  };

  // Bulk actions
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)));
    }
  };

  const handleBulkMarkPaid = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await costCentersAPI.bulkInvoiceAction('mark_paid', Array.from(selectedIds));
      if (res.success) {
        toast.success(res.message);
        setSelectedIds(new Set());
        loadInvoices();
        loadStats();
      }
    } catch (error) {
      toast.error('Hiba a tömeges műveletnél');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Biztosan törölni szeretnéd a kijelölt ${selectedIds.size} számlát?`)) return;
    try {
      const res = await costCentersAPI.bulkInvoiceAction('delete', Array.from(selectedIds));
      if (res.success) {
        toast.success(res.message);
        setSelectedIds(new Set());
        loadInvoices();
        loadStats();
      }
    } catch (error) {
      toast.error('Hiba a tömeges törlésnél');
    }
  };

  const handleBulkExportCsv = () => {
    const selected = invoices.filter((inv) => selectedIds.has(inv.id));
    if (selected.length === 0) return;
    exportToCsv(selected);
    toast.success(`${selected.length} számla exportálva`);
  };

  const isOverdue = (inv) => {
    if (inv.payment_status === 'paid' || inv.payment_status === 'cancelled') return false;
    if (!inv.due_date) return false;
    return new Date(inv.due_date) < new Date();
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Számlakezelés</Typography>
          <Typography variant="body2" color="text.secondary">Számlák nyilvántartása és költségkövetés</Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<FolderExportIcon />}
            onClick={() => setExportOpen(true)}
            sx={{ borderColor: '#f59e0b', color: '#d97706', '&:hover': { borderColor: '#d97706', bgcolor: 'rgba(245, 158, 11, 0.04)' } }}
          >
            Mappába exportálás
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
            Új számla
          </Button>
        </Stack>
      </Box>

      {/* Stats cards */}
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <StatCard
          title="Összes számla" value={stats?.total_count ?? '-'}
          icon={<ReceiptIcon />} color="#3b82f6"
        />
        <StatCard
          title="Függőben" value={stats ? formatCurrency(stats.pending_sum) : '-'}
          subtitle={stats ? `${stats.pending_count} db` : ''}
          icon={<PendingIcon />} color="#f59e0b"
        />
        <StatCard
          title="Lejárt" value={stats?.overdue_count ?? '-'}
          icon={<OverdueIcon />} color="#ef4444"
        />
        <StatCard
          title="Havi összeg" value={stats ? formatCurrency(stats.monthly_sum) : '-'}
          subtitle={stats ? `${stats.monthly_count} db számla` : ''}
          icon={<MonthlyIcon />} color="#8b5cf6"
        />
      </Stack>

      {/* Search and filter bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            fullWidth size="small" placeholder="Keresés számlaszám, szállító, leírás..."
            value={search} onChange={handleSearchChange}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Button
            variant={showFilters ? 'contained' : 'outlined'}
            startIcon={<FilterIcon />}
            onClick={() => setShowFilters(!showFilters)}
            sx={showFilters ? { bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } } : {}}
          >
            Szűrők
          </Button>
          {hasActiveFilters && (
            <Button variant="text" startIcon={<ClearIcon />} onClick={clearFilters} color="error" size="small">
              Törlés
            </Button>
          )}
        </Stack>

        {showFilters && (
          <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Státusz</InputLabel>
              <Select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }} label="Státusz">
                <MenuItem value="">Mind</MenuItem>
                {Object.entries(PAYMENT_STATUSES).map(([val, cfg]) => (
                  <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ minWidth: 250 }}>
              <CostCenterSelector
                value={filterCostCenter}
                onChange={(val) => { setFilterCostCenter(val); setPage(0); }}
                costCenters={costCenters}
                costCenterTree={costCenterTree}
                label="Költséghely"
              />
            </Box>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Kategória</InputLabel>
              <Select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }} label="Kategória">
                <MenuItem value="">Mind</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>{cat.icon} {cat.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small" type="date" label="Dátumtól" value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }}
            />
            <TextField
              size="small" type="date" label="Dátumig" value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }}
            />
          </Stack>
        )}
      </Paper>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <Paper sx={{ mb: 2 }}>
          <Toolbar variant="dense" sx={{ bgcolor: 'rgba(37, 99, 235, 0.06)', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
              {selectedIds.size} számla kiválasztva
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" color="success" startIcon={<BulkPaidIcon />}
                onClick={handleBulkMarkPaid}>
                Fizetve megjelölés
              </Button>
              <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />}
                onClick={handleBulkDelete}>
                Törlés
              </Button>
              <Button size="small" variant="outlined" startIcon={<ExportIcon />}
                onClick={handleBulkExportCsv}>
                Export CSV
              </Button>
            </Stack>
          </Toolbar>
        </Paper>
      )}

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : invoices.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <ReceiptIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {hasActiveFilters || search ? 'Nincs a szűrésnek megfelelő számla' : 'Még nincs rögzített számla'}
            </Typography>
            {!hasActiveFilters && !search && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate} sx={{ mt: 2, bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
                Első számla rögzítése
              </Button>
            )}
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedIds.size > 0 && selectedIds.size < invoices.length}
                        checked={selectedIds.size === invoices.length && invoices.length > 0}
                        onChange={handleSelectAll}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Dátum</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Számlaszám</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Szállító</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Költséghely</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Nettó</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">ÁFA</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Bruttó</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 130 }}>Műveletek</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => {
                    const overdue = isOverdue(inv);
                    return (
                      <TableRow key={inv.id} hover sx={{ bgcolor: overdue ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selectedIds.has(inv.id)}
                            onChange={() => handleToggleSelect(inv.id)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{inv.invoice_number || '-'}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{inv.vendor_name || '-'}</Typography>
                          {inv.vendor_tax_number && (
                            <Typography variant="caption" color="text.secondary">{inv.vendor_tax_number}</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={`${inv.cost_center_icon || '📁'} ${inv.cost_center_code || inv.cost_center_name || '-'}`}
                            size="small" variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatCurrency(inv.amount, inv.currency)}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                          {formatCurrency(inv.vat_amount, inv.currency)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatCurrency(inv.total_amount, inv.currency)}
                        </TableCell>
                        <TableCell>
                          {inv.category_name ? (
                            <Chip label={`${inv.category_icon || ''} ${inv.category_name}`} size="small" variant="outlined"
                              sx={{ bgcolor: inv.category_color ? `${inv.category_color}18` : undefined }}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <FormControl size="small" variant="standard" sx={{ minWidth: 100 }}>
                            <Select
                              value={inv.payment_status}
                              onChange={(e) => handleStatusChange(inv, e.target.value)}
                              disableUnderline
                              renderValue={(val) => (
                                <Chip
                                  label={PAYMENT_STATUSES[val]?.label || val}
                                  size="small"
                                  color={PAYMENT_STATUSES[val]?.color || 'default'}
                                />
                              )}
                            >
                              {Object.entries(PAYMENT_STATUSES).map(([val, cfg]) => (
                                <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Megtekintés">
                              <IconButton size="small" onClick={() => handleView(inv)}><ViewIcon fontSize="small" /></IconButton>
                            </Tooltip>
                            <Tooltip title="Szerkesztés">
                              <IconButton size="small" onClick={() => handleEdit(inv)}><EditIcon fontSize="small" /></IconButton>
                            </Tooltip>
                            {inv.file_path && (
                              <Tooltip title="Letöltés">
                                <IconButton size="small" component="a" href={`${UPLOADS_BASE_URL}/${inv.file_path}`} target="_blank" rel="noopener">
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Törlés">
                              <IconButton size="small" color="error" onClick={() => setDeleteConfirm(inv)}><DeleteIcon fontSize="small" /></IconButton>
                            </Tooltip>
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

      {/* Dialogs */}
      <InvoiceFormModal
        open={formOpen} onClose={() => setFormOpen(false)}
        onSave={handleSave} editData={editData}
        costCenters={costCenters} costCenterTree={costCenterTree} categories={categories}
      />

      <InvoiceDetailDialog
        open={detailOpen} onClose={() => setDetailOpen(false)}
        invoice={detailInvoice}
      />

      {/* Export to folder modal */}
      <ExportToFolderModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        costCenters={costCenters}
        costCenterTree={costCenterTree}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Számla törlése</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan törölni szeretnéd a(z) <strong>{deleteConfirm?.invoice_number || 'N/A'}</strong> számlát?
          </Typography>
          {deleteConfirm && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Szállító: {deleteConfirm.vendor_name || '-'} | Összeg: {formatCurrency(deleteConfirm.total_amount)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Mégse</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Törlés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Invoices;
