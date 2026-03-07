import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  Alert, TableSortLabel,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Delete as DeleteIcon, Receipt as ReceiptIcon,
  FilterList as FilterIcon, Clear as ClearIcon,
  PictureAsPdf as PdfIcon, Email as EmailIcon,
  Payment as PaymentIcon, Visibility as ViewIcon,
} from '@mui/icons-material';
import { invoicesAPI, paymentsAPI } from '../../services/api';
import { toast } from 'react-toastify';

// ============================================
// CONSTANTS
// ============================================

const PAYMENT_STATUSES = {
  draft: { label: 'Piszkozat', color: 'default' },
  sent: { label: 'Elkuldve', color: 'info' },
  paid: { label: 'Kifizetve', color: 'success' },
  overdue: { label: 'Lejart', color: 'error' },
  cancelled: { label: 'Sztorno', color: 'default' },
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
// PAYMENT DIALOG
// ============================================

function PaymentDialog({ open, onClose, invoice, onPaymentAdded }) {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ amount: '', payment_date: '', payment_method: 'bank_transfer', reference_number: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const loadPayments = useCallback(async () => {
    if (!invoice) return;
    setLoading(true);
    try {
      const res = await invoicesAPI.getPayments(invoice.id);
      if (res.success) {
        setPayments(res.data.payments);
        setSummary(res.data.summary);
      }
    } catch (e) {
      toast.error('Hiba a fizetesek betoltesekor');
    } finally {
      setLoading(false);
    }
  }, [invoice]);

  useEffect(() => {
    if (open && invoice) {
      loadPayments();
      setForm({ amount: '', payment_date: new Date().toISOString().substring(0, 10), payment_method: 'bank_transfer', reference_number: '', notes: '' });
    }
  }, [open, invoice, loadPayments]);

  const handleAddPayment = async () => {
    if (!form.amount || !form.payment_date) {
      toast.error('Osszeg es datum megadasa kotelezo');
      return;
    }
    setSaving(true);
    try {
      const res = await paymentsAPI.create({
        invoice_id: invoice.id,
        amount: parseFloat(form.amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        reference_number: form.reference_number || undefined,
        notes: form.notes || undefined,
      });
      if (res.success) {
        toast.success('Fizetes rogzitve');
        setForm({ amount: '', payment_date: new Date().toISOString().substring(0, 10), payment_method: 'bank_transfer', reference_number: '', notes: '' });
        loadPayments();
        if (onPaymentAdded) onPaymentAdded();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a fizetes rogzitesekor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (id) => {
    if (!window.confirm('Biztosan torolni szeretned ezt a fizetest?')) return;
    try {
      const res = await paymentsAPI.delete(id);
      if (res.success) {
        toast.success('Fizetes torolve');
        loadPayments();
        if (onPaymentAdded) onPaymentAdded();
      }
    } catch (error) {
      toast.error('Hiba a torles soran');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Fizetesek - {invoice?.invoice_number}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
        ) : (
          <>
            {/* Summary */}
            {summary && (
              <Stack direction="row" spacing={3} sx={{ mb: 3, mt: 1, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Szamla osszeg</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCurrency(summary.invoice_total)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Fizetve</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#10b981' }}>{formatCurrency(summary.total_paid)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Fennmarado</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: summary.remaining > 0 ? '#ef4444' : '#10b981' }}>
                    {formatCurrency(summary.remaining)}
                  </Typography>
                </Box>
              </Stack>
            )}

            {/* Payments list */}
            {payments.length > 0 && (
              <TableContainer sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Datum</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Osszeg</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Mod</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Hivatkozas</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Rogzitette</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.payment_date)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(p.amount)}</TableCell>
                        <TableCell>{p.payment_method}</TableCell>
                        <TableCell>{p.reference_number || '-'}</TableCell>
                        <TableCell>{[p.created_by_first_name, p.created_by_last_name].filter(Boolean).join(' ') || '-'}</TableCell>
                        <TableCell>
                          <IconButton size="small" color="error" onClick={() => handleDeletePayment(p.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Add payment form */}
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Uj fizetes rogzitese</Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="flex-end">
              <TextField
                size="small" label="Osszeg *" type="number"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                sx={{ width: 140 }}
              />
              <TextField
                size="small" label="Datum *" type="date"
                value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
              />
              <FormControl size="small" sx={{ width: 160 }}>
                <InputLabel>Fizetesi mod</InputLabel>
                <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} label="Fizetesi mod">
                  <MenuItem value="bank_transfer">Banki atutalas</MenuItem>
                  <MenuItem value="cash">Keszpenz</MenuItem>
                  <MenuItem value="credit_card">Bankkartya</MenuItem>
                  <MenuItem value="other">Egyeb</MenuItem>
                </Select>
              </FormControl>
              <TextField
                size="small" label="Hivatkozas"
                value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                sx={{ width: 140 }}
              />
              <Button
                variant="contained" onClick={handleAddPayment} disabled={saving}
                sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, height: 40 }}
              >
                {saving ? <CircularProgress size={20} /> : 'Rogzites'}
              </Button>
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Bezaras</Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// EMAIL DIALOG
// ============================================

function EmailDialog({ open, onClose, invoice }) {
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setForm({
        to: '',
        cc: '',
        subject: `Szamla: ${invoice.invoice_number || ''} - ${invoice.vendor_name || ''}`,
        body: '',
      });
    }
  }, [open, invoice]);

  const handleSend = async () => {
    if (!form.to) {
      toast.error('Cimzett megadasa kotelezo');
      return;
    }
    setSending(true);
    try {
      const res = await invoicesAPI.sendEmail(invoice.id, form);
      if (res.success) {
        toast.success('Email elkuldve');
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba az email kuldese soran');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Szamla kuldese emailben</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField size="small" label="Cimzett *" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="pelda@email.hu" fullWidth />
          <TextField size="small" label="CC" value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} fullWidth />
          <TextField size="small" label="Targy" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} fullWidth />
          <TextField size="small" label="Szoveg (opcionalis)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} fullWidth multiline rows={4} />
        </Stack>
        <Alert severity="info" sx={{ mt: 2 }}>A szamla PDF automatikusan csatolva lesz a levelehez.</Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Megse</Button>
        <Button variant="contained" onClick={handleSend} disabled={sending}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
          {sending ? <CircularProgress size={22} /> : 'Kuldes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// CSV EXPORT
// ============================================

function exportToCsv(invoices) {
  const headers = ['Szamlaszam', 'Szallito', 'Netto', 'AFA', 'Brutto', 'Penznem', 'Datum', 'Hatarido', 'Statusz'];
  const rows = invoices.map((inv) => [
    inv.invoice_number || '', inv.vendor_name || '',
    inv.amount || 0, inv.vat_amount || 0, inv.total_amount || 0, inv.currency || 'HUF',
    inv.invoice_date ? inv.invoice_date.substring(0, 10) : '', inv.due_date ? inv.due_date.substring(0, 10) : '',
    PAYMENT_STATUSES[inv.payment_status]?.label || inv.payment_status,
  ]);

  const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `szamlak_${new Date().toISOString().substring(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================
// MAIN PAGE
// ============================================

function InvoiceListPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [total, setTotal] = useState(0);

  // Sorting
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Dialogs
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailInvoice, setEmailInvoice] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const hasActiveFilters = filterStatus || filterDateFrom || filterDateTo;

  // ============================================
  // DATA LOADING
  // ============================================

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: rowsPerPage, sort_by: sortBy, sort_order: sortOrder.toUpperCase() };
      if (search) params.search = search;
      if (filterStatus) params.payment_status = filterStatus;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;

      const res = await invoicesAPI.getAll(params);
      if (res.success) {
        setInvoices(res.data.invoices);
        setTotal(res.data.pagination.total);
      }
    } catch (error) {
      toast.error('Hiba a szamlak betoltesekor');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, filterStatus, filterDateFrom, filterDateTo, sortBy, sortOrder]);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(0);
  };

  const clearFilters = () => {
    setFilterStatus('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearch('');
    setPage(0);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await invoicesAPI.delete(deleteConfirm.id);
      if (res.success) { toast.success('Szamla torolve'); loadInvoices(); }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a torles soran');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleDownloadPDF = async (invoice) => {
    try {
      const response = await invoicesAPI.downloadPDF(invoice.id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoice_number || 'szamla'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Hiba a PDF letoltesekor');
    }
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
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Szamlak</Typography>
          <Typography variant="body2" color="text.secondary">Szamlak es fizetesek kezelese</Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            startIcon={<PdfIcon />}
            onClick={() => exportToCsv(invoices)}
          >
            CSV Export
          </Button>
        </Stack>
      </Box>

      {/* Search and filter bar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            fullWidth size="small" placeholder="Kereses szamlaszam, szallito, leiras..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <Button
            variant={showFilters ? 'contained' : 'outlined'}
            startIcon={<FilterIcon />}
            onClick={() => setShowFilters(!showFilters)}
            sx={showFilters ? { bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } } : {}}
          >
            Szurok
          </Button>
          {hasActiveFilters && (
            <Button variant="text" startIcon={<ClearIcon />} onClick={clearFilters} color="error" size="small">
              Torles
            </Button>
          )}
        </Stack>

        {showFilters && (
          <Stack direction="row" spacing={2} sx={{ mt: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Statusz</InputLabel>
              <Select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }} label="Statusz">
                <MenuItem value="">Mind</MenuItem>
                {Object.entries(PAYMENT_STATUSES).map(([val, cfg]) => (
                  <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small" type="date" label="Datumtol" value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }}
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }}
            />
            <TextField
              size="small" type="date" label="Datumig" value={filterDateTo}
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
              {hasActiveFilters || search ? 'Nincs a szuresnek megfelelo szamla' : 'Meg nincs szamla'}
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <TableSortLabel active={sortBy === 'invoice_date'} direction={sortBy === 'invoice_date' ? sortOrder : 'desc'} onClick={() => handleSort('invoice_date')}>
                        Datum
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Szamlaszam</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <TableSortLabel active={sortBy === 'vendor_name'} direction={sortBy === 'vendor_name' ? sortOrder : 'asc'} onClick={() => handleSort('vendor_name')}>
                        Szallito
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Netto</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">
                      <TableSortLabel active={sortBy === 'total_amount'} direction={sortBy === 'total_amount' ? sortOrder : 'desc'} onClick={() => handleSort('total_amount')}>
                        Brutto
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Hatarido</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <TableSortLabel active={sortBy === 'payment_status'} direction={sortBy === 'payment_status' ? sortOrder : 'asc'} onClick={() => handleSort('payment_status')}>
                        Statusz
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 200 }}>Muveletek</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => {
                    const overdue = isOverdue(inv);
                    return (
                      <TableRow key={inv.id} hover sx={{ bgcolor: overdue ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                        <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{inv.invoice_number || '-'}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{inv.vendor_name || '-'}</Typography>
                          {inv.client_name && (
                            <Typography variant="caption" color="text.secondary">{inv.client_name}</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatCurrency(inv.amount, inv.currency)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatCurrency(inv.total_amount || inv.amount, inv.currency)}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: overdue ? '#ef4444' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
                            {formatDate(inv.due_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={PAYMENT_STATUSES[inv.payment_status]?.label || inv.payment_status}
                            size="small"
                            color={PAYMENT_STATUSES[inv.payment_status]?.color || 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Fizetesek">
                              <IconButton size="small" onClick={() => { setPaymentInvoice(inv); setPaymentOpen(true); }}>
                                <PaymentIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="PDF letoltes">
                              <IconButton size="small" onClick={() => handleDownloadPDF(inv)}>
                                <PdfIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Kuldes emailben">
                              <IconButton size="small" onClick={() => { setEmailInvoice(inv); setEmailOpen(true); }}>
                                <EmailIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Torles">
                              <IconButton size="small" color="error" onClick={() => setDeleteConfirm(inv)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
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
              labelRowsPerPage="Sorok szama:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoice={paymentInvoice}
        onPaymentAdded={loadInvoices}
      />

      {/* Email Dialog */}
      <EmailDialog
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        invoice={emailInvoice}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Szamla torlese</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan torolni szeretned a(z) <strong>{deleteConfirm?.invoice_number || 'N/A'}</strong> szamlat?
          </Typography>
          {deleteConfirm && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Szallito: {deleteConfirm.vendor_name || '-'} | Osszeg: {formatCurrency(deleteConfirm.total_amount)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Megse</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Torles</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default InvoiceListPage;
