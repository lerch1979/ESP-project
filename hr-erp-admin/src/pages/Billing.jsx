import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, TextField, MenuItem,
  Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, IconButton, Chip, CircularProgress, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Refresh as RefreshIcon, FilterAltOff as FilterOffIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { expensesAPI, accommodationsAPI } from '../services/api';

// ────────────────────────────────────────────────────────────────────────
// Constants — match backend CHECK constraint on accommodation_expenses.category
// ────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'rezsi',        label: 'Rezsi',        color: 'info'    },
  { value: 'karbantartas', label: 'Karbantartás', color: 'warning' },
  { value: 'takaritas',    label: 'Takarítás',    color: 'success' },
  { value: 'egyeb',        label: 'Egyéb',        color: 'default' },
];

const TABS = ['expenses', 'runs', 'billings', 'profit'];
const TAB_LABELS = ['Költségek', 'Számlázási futások', 'Számlázások', 'Profit dashboard'];

// ────────────────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────────────────

const fmtMoney = (n) =>
  n == null || n === '' ? '—' : `${Number(n).toLocaleString('hu-HU')} Ft`;

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}.`;
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// ────────────────────────────────────────────────────────────────────────
// Tab 1: Expenses
// ────────────────────────────────────────────────────────────────────────

function ExpensesTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [filters, setFilters] = useState({
    accommodation_id: '',
    billing_month: '',
    category: '',
  });

  const [accommodations, setAccommodations] = useState([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = create, object = edit
  const [form, setForm] = useState({
    accommodation_id: '',
    billing_month: currentMonth(),
    category: 'rezsi',
    amount: '',
    notes: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load accommodations once for the dropdowns
  useEffect(() => {
    (async () => {
      try {
        const res = await accommodationsAPI.getAll({ limit: 500 });
        // accommodationsAPI response shape varies; try a few
        const list = res?.accommodations || res?.data?.accommodations || res?.data || [];
        setAccommodations(Array.isArray(list) ? list : []);
      } catch (e) {
        toast.error('Szállások betöltése sikertelen');
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: page + 1, limit: perPage };
      if (filters.accommodation_id) params.accommodation_id = filters.accommodation_id;
      if (filters.billing_month)    params.billing_month    = filters.billing_month;
      if (filters.category)         params.category         = filters.category;

      const res = await expensesAPI.getAll(params);
      const data = res?.data || {};
      setRows(data.expenses || []);
      setTotal(data.pagination?.total || 0);
    } catch (e) {
      toast.error('Költségek betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, filters]);

  useEffect(() => { load(); }, [load]);

  const visibleTotal = useMemo(
    () => rows.reduce((s, r) => s + Number(r.amount || 0), 0),
    [rows],
  );

  const resetFilters = () => {
    setFilters({ accommodation_id: '', billing_month: '', category: '' });
    setPage(0);
  };

  // ─── Form handlers ───
  const openCreate = () => {
    setEditing(null);
    setForm({
      accommodation_id: filters.accommodation_id || '',
      billing_month: filters.billing_month || currentMonth(),
      category: filters.category || 'rezsi',
      amount: '',
      notes: '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      accommodation_id: row.accommodation_id || '',
      billing_month: row.billing_month || currentMonth(),
      category: row.category || 'rezsi',
      amount: row.amount != null ? String(row.amount) : '',
      notes: row.notes || '',
    });
    setFormError('');
    setFormOpen(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.accommodation_id) return setFormError('Szállás megadása kötelező');
    if (!form.billing_month)    return setFormError('Számlázási hónap kötelező');
    if (!/^\d{4}-\d{2}$/.test(form.billing_month)) {
      return setFormError('Számlázási hónap formátuma: YYYY-MM');
    }
    if (!form.category)         return setFormError('Kategória kötelező');
    if (form.amount === '' || form.amount == null) return setFormError('Összeg kötelező');
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt < 0)  return setFormError('Összeg nem lehet negatív');

    setSaving(true);
    try {
      if (editing) {
        await expensesAPI.update(editing.id, {
          accommodation_id: form.accommodation_id,
          billing_month: form.billing_month,
          category: form.category,
          amount: amt,
          notes: form.notes || null,
        });
        toast.success('Költség frissítve');
      } else {
        await expensesAPI.create({
          accommodation_id: form.accommodation_id,
          billing_month: form.billing_month,
          category: form.category,
          amount: amt,
          notes: form.notes || null,
        });
        toast.success('Költség rögzítve');
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || 'Mentés sikertelen';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await expensesAPI.delete(deleteId);
      toast.success('Költség törölve');
      setDeleteId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Törlés sikertelen');
    } finally {
      setDeleting(false);
    }
  };

  const catMeta = (slug) => CATEGORIES.find((c) => c.value === slug) || { label: slug, color: 'default' };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap">
          <TextField
            select
            label="Szállás"
            size="small"
            value={filters.accommodation_id}
            onChange={(e) => { setFilters({ ...filters, accommodation_id: e.target.value }); setPage(0); }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Mind</MenuItem>
            {accommodations.map((a) => (
              <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
            ))}
          </TextField>

          <TextField
            label="Hónap"
            type="month"
            size="small"
            value={filters.billing_month}
            onChange={(e) => { setFilters({ ...filters, billing_month: e.target.value }); setPage(0); }}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />

          <TextField
            select
            label="Kategória"
            size="small"
            value={filters.category}
            onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(0); }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Mind</MenuItem>
            {CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </TextField>

          <Tooltip title="Szűrők törlése">
            <IconButton onClick={resetFilters}><FilterOffIcon /></IconButton>
          </Tooltip>
          <Tooltip title="Frissítés">
            <IconButton onClick={load}><RefreshIcon /></IconButton>
          </Tooltip>

          <Box sx={{ flexGrow: 1 }} />

          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Új költség
          </Button>
        </Stack>
      </Paper>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Rögzítve</TableCell>
                <TableCell>Hónap</TableCell>
                <TableCell>Szállás</TableCell>
                <TableCell>Kategória</TableCell>
                <TableCell align="right">Összeg</TableCell>
                <TableCell>Megjegyzés</TableCell>
                <TableCell align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nincs rögzített költség a megadott szűrőkre.
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.map((row) => {
                const meta = catMeta(row.category);
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>{fmtDate(row.created_at)}</TableCell>
                    <TableCell>{row.billing_month}</TableCell>
                    <TableCell>{row.accommodation_name || '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={meta.label} color={meta.color} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">{fmtMoney(row.amount)}</TableCell>
                    <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={row.notes || ''}>
                        <span>{row.notes || '—'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(row)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteId(row.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Aktuális oldalon: <strong>{fmtMoney(visibleTotal)}</strong>
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={perPage}
            onRowsPerPageChange={(e) => { setPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Sorok / oldal"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
          />
        </Stack>
      </Paper>

      {/* Create / Edit modal */}
      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Költség szerkesztése' : 'Új költség rögzítése'}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              required
              label="Szállás"
              value={form.accommodation_id}
              onChange={(e) => setForm({ ...form, accommodation_id: e.target.value })}
              fullWidth
            >
              {accommodations.map((a) => (
                <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
              ))}
            </TextField>

            <TextField
              required
              label="Számlázási hónap"
              type="month"
              value={form.billing_month}
              onChange={(e) => setForm({ ...form, billing_month: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />

            <TextField
              select
              required
              label="Kategória"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              fullWidth
            >
              {CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
              ))}
            </TextField>

            <TextField
              required
              label="Összeg (Ft)"
              type="number"
              inputProps={{ min: 0, step: 1 }}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              fullWidth
            />

            <TextField
              label="Megjegyzés"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)} disabled={saving}>Mégse</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : (editing ? 'Mentés' : 'Rögzítés')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onClose={() => !deleting && setDeleteId(null)}>
        <DialogTitle>Költség törlése</DialogTitle>
        <DialogContent>
          <Typography>Biztosan törlöd ezt a költséget? A művelet visszavonható (soft delete).</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)} disabled={deleting}>Mégse</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Törlés'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Placeholder tabs (built in later steps)
// ────────────────────────────────────────────────────────────────────────

function PlaceholderTab({ title }) {
  return (
    <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
      <Typography variant="h6" sx={{ mb: 1 }}>{title}</Typography>
      <Typography>Hamarosan elérhető.</Typography>
    </Paper>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') || TABS[0];
  const initialIdx = Math.max(0, TABS.indexOf(tabParam));
  const [tabIdx, setTabIdx] = useState(initialIdx);

  const handleTabChange = (_, idx) => {
    setTabIdx(idx);
    const next = new URLSearchParams(searchParams);
    next.set('tab', TABS[idx]);
    setSearchParams(next, { replace: true });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 600 }}>Szállás könyvelés</Typography>

      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={tabIdx}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          {TAB_LABELS.map((label) => <Tab key={label} label={label} />)}
        </Tabs>
      </Paper>

      {tabIdx === 0 && <ExpensesTab />}
      {tabIdx === 1 && <PlaceholderTab title="Számlázási futások" />}
      {tabIdx === 2 && <PlaceholderTab title="Számlázások" />}
      {tabIdx === 3 && <PlaceholderTab title="Profit dashboard" />}
    </Box>
  );
}
