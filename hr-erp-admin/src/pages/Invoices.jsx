import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, IconButton, Tooltip, Card, CardContent,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  Alert, Divider,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Delete as DeleteIcon, Receipt as ReceiptIcon,
  FilterList as FilterIcon, Clear as ClearIcon,
  TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon,
  AccessTime as PendingIcon, CheckCircle as PaidIcon,
  Warning as OverdueIcon, Visibility as ViewIcon,
} from '@mui/icons-material';
import { costCentersAPI } from '../services/api';
import { toast } from 'react-toastify';

// ============================================
// CONSTANTS
// ============================================

const PAYMENT_STATUSES = {
  pending: { label: 'Függőben', color: 'warning', icon: <PendingIcon fontSize="small" /> },
  paid: { label: 'Fizetve', color: 'success', icon: <PaidIcon fontSize="small" /> },
  overdue: { label: 'Lejárt', color: 'error', icon: <OverdueIcon fontSize="small" /> },
  cancelled: { label: 'Sztornó', color: 'default', icon: null },
};

const CURRENCIES = ['HUF', 'EUR', 'USD'];

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
// INVOICE FORM DIALOG
// ============================================

function InvoiceFormDialog({ open, onClose, onSave, editData, costCenters, categories }) {
  const [form, setForm] = useState({
    invoice_number: '', vendor_name: '', vendor_tax_number: '', amount: '', vat_amount: '',
    total_amount: '', currency: 'HUF', invoice_date: '', due_date: '', payment_date: '',
    payment_status: 'pending', cost_center_id: '', category_id: '', description: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

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
      setForm({
        invoice_number: '', vendor_name: '', vendor_tax_number: '', amount: '', vat_amount: '',
        total_amount: '', currency: 'HUF', invoice_date: '', due_date: '', payment_date: '',
        payment_status: 'pending', cost_center_id: '', category_id: '', description: '', notes: '',
      });
    }
  }, [editData, open]);

  // Auto-calc total
  useEffect(() => {
    const a = parseFloat(form.amount) || 0;
    const v = parseFloat(form.vat_amount) || 0;
    if (a > 0) setForm((f) => ({ ...f, total_amount: (a + v).toString() }));
  }, [form.amount, form.vat_amount]);

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
      await onSave(data);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{editData ? 'Számla szerkesztése' : 'Új számla rögzítése'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Alapadatok</Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Számlaszám" value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} size="small" sx={{ flex: 1 }} placeholder="pl. INV-2026-001" />
            <TextField label="Számla dátum *" type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
            <FormControl size="small" sx={{ width: 100 }}>
              <InputLabel>Pénznem</InputLabel>
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} label="Pénznem">
                {CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Szállító</Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Szállító neve" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} size="small" sx={{ flex: 2 }} />
            <TextField label="Adószám" value={form.vendor_tax_number} onChange={(e) => setForm({ ...form, vendor_tax_number: e.target.value })} size="small" sx={{ flex: 1 }} placeholder="12345678-2-42" />
          </Stack>

          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Összegek</Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Nettó összeg *" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} size="small" sx={{ flex: 1 }} />
            <TextField label="ÁFA összeg" type="number" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })} size="small" sx={{ flex: 1 }} />
            <TextField label="Bruttó összeg" type="number" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} size="small" sx={{ flex: 1 }} InputProps={{ sx: { fontWeight: 700 } }} />
          </Stack>

          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Besorolás</Typography>
          <Stack direction="row" spacing={2}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Költséghely *</InputLabel>
              <Select value={form.cost_center_id} onChange={(e) => setForm({ ...form, cost_center_id: e.target.value })} label="Költséghely *">
                {costCenters.map((cc) => (
                  <MenuItem key={cc.id} value={cc.id}>
                    {'  '.repeat((cc.level || 1) - 1)}{cc.icon || '📁'} {cc.name} {cc.code ? `(${cc.code})` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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

          <Divider />
          <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>Fizetés</Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Fizetési határidő" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Státusz</InputLabel>
              <Select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })} label="Státusz">
                {Object.entries(PAYMENT_STATUSES).map(([val, cfg]) => (
                  <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Fizetés dátuma" type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} size="small" InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
          </Stack>

          <Divider />
          <TextField label="Leírás" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} size="small" multiline rows={2} fullWidth />
          <TextField label="Belső megjegyzések" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} size="small" fullWidth />
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

// ============================================
// INVOICE DETAIL DIALOG
// ============================================

function InvoiceDetailDialog({ open, onClose, invoice }) {
  if (!invoice) return null;

  const Field = ({ label, value }) => (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{value || '-'}</Typography>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptIcon color="primary" />
          Számla: {invoice.invoice_number || 'N/A'}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
          <Field label="Számlaszám" value={invoice.invoice_number} />
          <Field label="Számla dátum" value={formatDate(invoice.invoice_date)} />
          <Field label="Szállító neve" value={invoice.vendor_name} />
          <Field label="Szállító adószám" value={invoice.vendor_tax_number} />
          <Field label="Nettó összeg" value={formatCurrency(invoice.amount, invoice.currency)} />
          <Field label="ÁFA" value={formatCurrency(invoice.vat_amount, invoice.currency)} />
          <Field label="Bruttó összeg" value={
            <Typography variant="body1" sx={{ fontWeight: 700, color: '#2563eb' }}>
              {formatCurrency(invoice.total_amount, invoice.currency)}
            </Typography>
          } />
          <Field label="Pénznem" value={invoice.currency} />
          <Field label="Költséghely" value={
            <Chip label={`${invoice.cost_center_icon || '📁'} ${invoice.cost_center_name || '-'}`} size="small" variant="outlined" />
          } />
          <Field label="Kategória" value={
            invoice.category_name ? `${invoice.category_icon || ''} ${invoice.category_name}` : '-'
          } />
          <Field label="Fizetési státusz" value={
            <Chip
              label={PAYMENT_STATUSES[invoice.payment_status]?.label || invoice.payment_status}
              size="small"
              color={PAYMENT_STATUSES[invoice.payment_status]?.color || 'default'}
            />
          } />
          <Field label="Fizetési határidő" value={formatDate(invoice.due_date)} />
          <Field label="Fizetés dátuma" value={formatDate(invoice.payment_date)} />
          <Field label="Létrehozva" value={formatDate(invoice.created_at)} />
        </Box>
        {invoice.description && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">Leírás</Typography>
            <Typography variant="body2">{invoice.description}</Typography>
          </Box>
        )}
        {invoice.notes && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">Megjegyzések</Typography>
            <Typography variant="body2">{invoice.notes}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Bezárás</Button>
      </DialogActions>
    </Dialog>
  );
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
  const [showFilters, setShowFilters] = useState(false);

  // Lookups
  const [costCenters, setCostCenters] = useState([]);
  const [categories, setCategories] = useState([]);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Stats
  const [stats, setStats] = useState({ total: 0, pending: 0, paid: 0, overdue: 0, totalAmount: 0, pendingAmount: 0 });

  // ============================================
  // DATA LOADING
  // ============================================

  const loadLookups = useCallback(async () => {
    try {
      const [ccRes, catRes] = await Promise.all([
        costCentersAPI.getAll({ limit: 500 }),
        costCentersAPI.getInvoiceCategories(),
      ]);
      if (ccRes.success) setCostCenters(ccRes.data);
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
  }, [page, rowsPerPage, search, filterStatus, filterCostCenter, filterCategory, filterDateFrom, filterDateTo]);

  const loadStats = useCallback(async () => {
    try {
      // Load all invoices grouped stats
      const [allRes, pendingRes, paidRes, overdueRes] = await Promise.all([
        costCentersAPI.getInvoices({ limit: 1 }),
        costCentersAPI.getInvoices({ payment_status: 'pending', limit: 1 }),
        costCentersAPI.getInvoices({ payment_status: 'paid', limit: 1 }),
        costCentersAPI.getInvoices({ payment_status: 'overdue', limit: 1 }),
      ]);
      setStats({
        total: allRes.pagination?.total || 0,
        pending: pendingRes.pagination?.total || 0,
        paid: paidRes.pagination?.total || 0,
        overdue: overdueRes.pagination?.total || 0,
      });
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
    setSearch('');
    setPage(0);
  };

  const hasActiveFilters = filterStatus || filterCostCenter || filterCategory || filterDateFrom || filterDateTo;

  const handleCreate = () => { setEditData(null); setFormOpen(true); };

  const handleEdit = (invoice) => { setEditData(invoice); setFormOpen(true); };

  const handleView = (invoice) => { setDetailInvoice(invoice); setDetailOpen(true); };

  const handleSave = async (data) => {
    if (editData) {
      const res = await costCentersAPI.updateInvoice(editData.id, data);
      if (res.success) { toast.success(res.message); loadInvoices(); loadStats(); }
    } else {
      const res = await costCentersAPI.createInvoice(data);
      if (res.success) { toast.success(res.message); loadInvoices(); loadStats(); }
    }
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

  // Check overdue
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
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
          Új számla
        </Button>
      </Box>

      {/* Stats cards */}
      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <StatCard title="Összes számla" value={stats.total} icon={<ReceiptIcon />} color="#3b82f6" />
        <StatCard title="Függőben" value={stats.pending} icon={<PendingIcon />} color="#f59e0b" />
        <StatCard title="Fizetve" value={stats.paid} icon={<PaidIcon />} color="#10b981" />
        <StatCard title="Lejárt" value={stats.overdue} icon={<OverdueIcon />} color="#ef4444" />
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
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Költséghely</InputLabel>
              <Select value={filterCostCenter} onChange={(e) => { setFilterCostCenter(e.target.value); setPage(0); }} label="Költséghely">
                <MenuItem value="">Mind</MenuItem>
                {costCenters.map((cc) => (
                  <MenuItem key={cc.id} value={cc.id}>
                    {'  '.repeat((cc.level || 1) - 1)}{cc.icon || '📁'} {cc.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
                    <TableCell sx={{ fontWeight: 600 }}>Számlaszám</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Szállító</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Költséghely</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Bruttó összeg</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Számla dátum</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Határidő</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 130 }}>Műveletek</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => {
                    const overdue = isOverdue(inv);
                    return (
                      <TableRow key={inv.id} hover sx={{ bgcolor: overdue ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
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
                        <TableCell>
                          {inv.category_name ? (
                            <Chip label={`${inv.category_icon || ''} ${inv.category_name}`} size="small" variant="outlined" />
                          ) : '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatCurrency(inv.total_amount, inv.currency)}
                        </TableCell>
                        <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: overdue ? '#ef4444' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                            {formatDate(inv.due_date)}
                          </Typography>
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
      <InvoiceFormDialog
        open={formOpen} onClose={() => setFormOpen(false)}
        onSave={handleSave} editData={editData}
        costCenters={costCenters} categories={categories}
      />

      <InvoiceDetailDialog
        open={detailOpen} onClose={() => setDetailOpen(false)}
        invoice={detailInvoice}
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
