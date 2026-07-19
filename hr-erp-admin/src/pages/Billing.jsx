import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, Stack, TextField, MenuItem,
  Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, IconButton, Chip, CircularProgress, Tooltip, Dialog,
  DialogTitle, DialogContent, DialogActions, Alert,
  Card, CardContent, Grid, Autocomplete,
  Accordion, AccordionSummary, AccordionDetails, Badge, Divider,
  Checkbox, FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Refresh as RefreshIcon, FilterAltOff as FilterOffIcon,
  TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon,
  AccountBalance as AccountBalanceIcon, Percent as PercentIcon,
  CloudUpload as CloudUploadIcon, Download as DownloadIcon,
  AttachFile as AttachFileIcon, ExpandMore as ExpandMoreIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { toast } from 'react-toastify';
import { expensesAPI, profitAPI, operatingCostsAPI, accommodationsAPI, costCentersAPI, invoiceDraftsAPI, accountantSharesAPI } from '../services/api';

// ────────────────────────────────────────────────────────────────────────
// Constants — match backend CHECK constraint on accommodation_expenses.category
// ────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'rezsi',        label: 'Rezsi',        color: 'info'    },
  { value: 'karbantartas', label: 'Karbantartás', color: 'warning' },
  { value: 'takaritas',    label: 'Takarítás',    color: 'success' },
  { value: 'egyeb',        label: 'Egyéb',        color: 'default' },
];

const TABS = ['expenses', 'drafts', 'runs', 'billings', 'shares', 'profit', 'operating_costs'];
const TAB_LABELS = [
  'Költségek', 'Beérkezett számlák', 'Számlázási futások',
  'Számlázások', 'Könyvelői hozzáférés', 'Profit dashboard', 'Üzemeltetési költségek',
];

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

// HTML <input type="date"> value format. NEVER use .toISOString().slice(0,10)
// — pg returns DATE as a JS Date at LOCAL midnight, which is the PREVIOUS
// UTC day in CEST. Same fix pattern as billingEngine.localDateStr().
const fmtDateInput = (d) => {
  if (!d) return '';
  // If caller already passed a YYYY-MM-DD string, pass it through unchanged
  // (avoid round-tripping through Date which may shift TZ).
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtBytes = (n) => {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const deriveBillingMonth = (perfDate) => {
  if (!perfDate || !/^\d{4}-\d{2}-\d{2}$/.test(perfDate)) return '';
  return perfDate.slice(0, 7);
};

const ALLOWED_UPLOAD_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// Client-side mirror of server-side VAT defaults + math. Must stay in
// sync with src/models/expense.model.js — if you change the rates or
// the formula, change both sides.
const DEFAULT_VAT_RATE_BY_CATEGORY = {
  rezsi: 27,
  karbantartas: 27,
  takaritas: 27,
  egyeb: null,
};
const computeNetVat = (gross, rate) => {
  const amt = Number(gross);
  const r = Number(rate);
  if (Number.isNaN(amt) || Number.isNaN(r)) return null;
  if (r < 0 || r > 100) return null;
  if (r === 0) return { net: Math.round(amt), vat: 0 };
  const net = Math.round(amt / (1 + r / 100));
  return { net, vat: Math.round(amt - net) };
};

const VAT_OPTIONS = [
  { value: '',           label: '— Nincs megadva —', group: 'none'    },
  { value: '27',         label: '27% (standard)',   group: 'rate'    },
  { value: '18',         label: '18%',              group: 'rate'    },
  { value: '5',          label: '5%',               group: 'rate'    },
  { value: '0',          label: '0% (export, EU)',  group: 'rate'    },
  { value: 'aam',        label: 'AAM (alanyi adómentes)', group: 'exempt' },
  { value: 'targy_mentes', label: 'Tárgyi mentes',  group: 'exempt' },
  { value: 'custom',     label: 'Egyéb (egyedi %)', group: 'custom'  },
];

const SectionLabel = ({ children, sx }) => (
  <Typography
    variant="overline"
    sx={{ display: 'block', mt: 2, mb: 1, color: 'text.secondary', fontWeight: 600, ...sx }}
  >
    {children}
  </Typography>
);

// ────────────────────────────────────────────────────────────────────────
// Tab 1: Expenses
// ────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  accommodation_id: '',
  performance_date: '',
  billing_month: '',
  invoice_date: '',
  category: 'rezsi',
  amount: '',
  vendor_name: '',
  vendor_tax_number: '',
  invoice_number: '',
  cost_center_id: '',
  notes: '',
  // VAT (migration 114)
  vat_rate: '',              // empty string = "not set"; service stores NULL
  net_amount: '',
  vat_amount: '',
  vat_exemption_reason: '',  // 'aam' | 'targy_mentes' | ''
  is_reverse_vat: false,
};

function ExpensesTab() {
  // ─── Data / filters ────────────────────────────────────────────────
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

  // ─── Reference data ────────────────────────────────────────────────
  const [accommodations, setAccommodations] = useState([]);
  const [costCenters, setCostCenters] = useState([]);

  // ─── Form ──────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = create, object = edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [billingMonthManual, setBillingMonthManual] = useState(false);
  // VAT sticky-override flags. When false, category change auto-fills the
  // rate from DEFAULT_VAT_RATE_BY_CATEGORY, and amount/rate change recomputes
  // net+vat. Once the user manually edits the corresponding field, the flag
  // flips to true and auto-fill stops fighting their input.
  const [vatRateManual, setVatRateManual] = useState(false);
  const [vatAmountsManual, setVatAmountsManual] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // ─── File management ───────────────────────────────────────────────
  const [stagedFiles, setStagedFiles] = useState([]);      // File[] in create mode
  const [existingFiles, setExistingFiles] = useState([]);  // file_attachments in edit mode
  const [fileUploading, setFileUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ─── Dedup warning ─────────────────────────────────────────────────
  const [dedupWarning, setDedupWarning] = useState(null); // { exactMatches, fuzzyMatches, confidence }
  const [overrideNote, setOverrideNote] = useState('');
  const [forcing, setForcing] = useState(false);

  // ─── Deletion ──────────────────────────────────────────────────────
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Reference data loaders ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await accommodationsAPI.getAll({ limit: 500 });
        const list = res?.accommodations || res?.data?.accommodations || res?.data || [];
        setAccommodations(Array.isArray(list) ? list : []);
      } catch (e) {
        toast.error('Szállások betöltése sikertelen');
      }
    })();
    (async () => {
      try {
        const res = await costCentersAPI.getAll({ limit: 500, is_active: true });
        const list = res?.data?.costCenters || res?.costCenters || res?.data || [];
        setCostCenters(Array.isArray(list) ? list : []);
      } catch (e) {
        // Cost centers are optional UX; silent failure with empty list
        setCostCenters([]);
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

  // ─── Form handlers ────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    const seedCategory = filters.category || 'rezsi';
    const seedRate = DEFAULT_VAT_RATE_BY_CATEGORY[seedCategory];
    setForm({
      ...EMPTY_FORM,
      accommodation_id: filters.accommodation_id || '',
      billing_month: filters.billing_month || '',
      category: seedCategory,
      vat_rate: seedRate != null ? String(seedRate) : '',
    });
    setBillingMonthManual(!!filters.billing_month);
    setVatRateManual(false);
    setVatAmountsManual(false);
    setStagedFiles([]);
    setExistingFiles([]);
    setShowAdvanced(false);
    setDedupWarning(null);
    setOverrideNote('');
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      accommodation_id: row.accommodation_id || '',
      performance_date: fmtDateInput(row.performance_date),
      billing_month: row.billing_month || '',
      invoice_date: fmtDateInput(row.invoice_date),
      category: row.category || 'rezsi',
      amount: row.amount != null ? String(row.amount) : '',
      vendor_name: row.vendor_name || '',
      vendor_tax_number: row.vendor_tax_number || '',
      invoice_number: row.invoice_number || '',
      cost_center_id: row.cost_center_id || '',
      notes: row.notes || '',
      vat_rate: row.vat_rate != null ? String(row.vat_rate) : '',
      net_amount: row.net_amount != null ? String(row.net_amount) : '',
      vat_amount: row.vat_amount != null ? String(row.vat_amount) : '',
      vat_exemption_reason: row.vat_exemption_reason || '',
      is_reverse_vat: !!row.is_reverse_vat,
    });
    setBillingMonthManual(true);
    setVatRateManual(true);     // existing row's VAT setup is intentional
    setVatAmountsManual(true);  // ditto for net/vat
    setStagedFiles([]);
    setExistingFiles(row.file_attachments || []);
    setShowAdvanced(!!row.cost_center_id || !!row.is_reverse_vat);
    setDedupWarning(null);
    setOverrideNote('');
    setFormError('');
    setFormOpen(true);
  };

  const setPerformanceDate = (value) => {
    setForm((f) => {
      const next = { ...f, performance_date: value };
      if (!billingMonthManual) next.billing_month = deriveBillingMonth(value);
      return next;
    });
  };

  const setBillingMonth = (value) => {
    setForm((f) => ({ ...f, billing_month: value }));
    setBillingMonthManual(true);
  };

  // ─── VAT field handlers ───────────────────────────────────────────
  // Auto-fill net/vat from gross + rate. Returns patch object to merge
  // into form state. Pass the EFFECTIVE amount + rate (i.e. what the
  // user is about to commit), not the current state values, because
  // React's setForm batches the update.
  const autoSplit = (amountStr, rateStr) => {
    const r = computeNetVat(amountStr, rateStr);
    if (!r) return { net_amount: '', vat_amount: '' };
    return { net_amount: String(r.net), vat_amount: String(r.vat) };
  };

  const setCategory = (cat) => {
    setForm((f) => {
      const next = { ...f, category: cat };
      // Suggest default rate ONLY if user hasn't manually set one.
      if (!vatRateManual) {
        const def = DEFAULT_VAT_RATE_BY_CATEGORY[cat];
        next.vat_rate = def != null ? String(def) : '';
        next.vat_exemption_reason = '';
        if (!vatAmountsManual && next.vat_rate !== '') {
          Object.assign(next, autoSplit(f.amount, next.vat_rate));
        } else if (!vatAmountsManual) {
          next.net_amount = '';
          next.vat_amount = '';
        }
      }
      return next;
    });
  };

  const setAmount = (value) => {
    setForm((f) => {
      const next = { ...f, amount: value };
      if (!vatAmountsManual && f.vat_rate !== '') {
        Object.assign(next, autoSplit(value, f.vat_rate));
      }
      return next;
    });
  };

  // Derive the single-select dropdown value from form state.
  const vatSelectValue = () => {
    if (form.vat_exemption_reason === 'aam') return 'aam';
    if (form.vat_exemption_reason === 'targy_mentes') return 'targy_mentes';
    if (form.vat_rate === '' || form.vat_rate == null) return '';
    if (['27', '18', '5', '0'].includes(String(form.vat_rate))) return String(form.vat_rate);
    return 'custom';
  };

  const onVatSelectChange = (selectValue) => {
    setVatRateManual(true);
    setForm((f) => {
      const next = { ...f };
      if (selectValue === 'aam' || selectValue === 'targy_mentes') {
        next.vat_rate = '';
        next.vat_exemption_reason = selectValue;
        next.net_amount = '';
        next.vat_amount = '';
      } else if (selectValue === '') {
        next.vat_rate = '';
        next.vat_exemption_reason = '';
        next.net_amount = '';
        next.vat_amount = '';
      } else if (selectValue === 'custom') {
        // keep current rate (so the user can type), clear exemption
        next.vat_exemption_reason = '';
      } else {
        // numeric rate
        next.vat_rate = selectValue;
        next.vat_exemption_reason = '';
        if (!vatAmountsManual) {
          Object.assign(next, autoSplit(f.amount, selectValue));
        }
      }
      return next;
    });
  };

  const setCustomVatRate = (value) => {
    setVatRateManual(true);
    setForm((f) => {
      const next = { ...f, vat_rate: value };
      if (!vatAmountsManual) Object.assign(next, autoSplit(f.amount, value));
      return next;
    });
  };

  const setNetAmount = (value) => {
    setVatAmountsManual(true);
    setForm((f) => ({ ...f, net_amount: value }));
  };
  const setVatAmount = (value) => {
    setVatAmountsManual(true);
    setForm((f) => ({ ...f, vat_amount: value }));
  };

  const setIsReverseVat = (checked) => {
    setForm((f) => {
      const next = { ...f, is_reverse_vat: checked };
      if (checked) {
        // Reverse-charge invoices show 0% on the invoice line — the buyer
        // accounts for the VAT. Pre-fill rate=0 and exemption clear, but
        // user can still override.
        next.vat_rate = '0';
        next.vat_exemption_reason = '';
        if (!vatAmountsManual) Object.assign(next, autoSplit(f.amount, 0));
        setVatRateManual(true);
      }
      return next;
    });
  };

  // ─── File staging / upload ────────────────────────────────────────
  const addFiles = async (files) => {
    const accepted = [];
    for (const f of files) {
      if (!ALLOWED_UPLOAD_MIMES.includes(f.type)) {
        toast.error(`${f.name}: csak PDF / JPG / PNG`);
        continue;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        toast.error(`${f.name}: maximum 10 MB`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length === 0) return;

    if (editing) {
      setFileUploading(true);
      try {
        let last;
        for (const f of accepted) {
          last = await expensesAPI.uploadFile(editing.id, f);
        }
        setExistingFiles(last?.data?.file_attachments || existingFiles);
        toast.success(`${accepted.length} fájl feltöltve`);
      } catch (e) {
        toast.error(e?.response?.data?.message || 'Fájl feltöltés sikertelen');
      } finally {
        setFileUploading(false);
      }
    } else {
      setStagedFiles((prev) => [...prev, ...accepted]);
    }
  };

  const onDropZoneDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  };
  const onFileInputChange = (e) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const handleDownload = async (file) => {
    if (!editing) return; // staged files have no server URL
    try {
      const blob = await expensesAPI.downloadFile(editing.id, file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name || file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Letöltés sikertelen');
    }
  };

  const handleExistingFileDelete = async (file) => {
    if (!editing) return;
    try {
      const res = await expensesAPI.deleteFile(editing.id, file.id);
      setExistingFiles(res?.data?.file_attachments || []);
      toast.success('Fájl törölve');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Fájl törlés sikertelen');
    }
  };

  const removeStagedFile = (idx) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ─── Save ─────────────────────────────────────────────────────────
  const buildPayload = (extra = {}) => {
    const amt = parseFloat(form.amount);
    const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
    return {
      accommodation_id: form.accommodation_id,
      performance_date: form.performance_date || null,
      invoice_date: form.invoice_date || null,
      billing_month: form.billing_month || undefined, // service auto-derives if missing
      category: form.category,
      amount: amt,
      vendor_name: form.vendor_name?.trim() || null,
      vendor_tax_number: form.vendor_tax_number?.trim() || null,
      invoice_number: form.invoice_number?.trim() || null,
      cost_center_id: form.cost_center_id || null,
      notes: form.notes?.trim() || null,
      // VAT (migration 114)
      vat_rate: numOrNull(form.vat_rate),
      net_amount: numOrNull(form.net_amount),
      vat_amount: numOrNull(form.vat_amount),
      vat_exemption_reason: form.vat_exemption_reason || null,
      is_reverse_vat: !!form.is_reverse_vat,
      ...extra,
    };
  };

  const handleSave = async ({ force = false } = {}) => {
    setFormError('');
    if (!form.accommodation_id) return setFormError('Szállás megadása kötelező');
    if (!form.performance_date && !form.billing_month) {
      return setFormError('Teljesítés dátum vagy számlázási hónap kötelező');
    }
    if (form.performance_date && !/^\d{4}-\d{2}-\d{2}$/.test(form.performance_date)) {
      return setFormError('Teljesítés dátum formátuma: YYYY-MM-DD');
    }
    if (form.billing_month && !/^\d{4}-\d{2}$/.test(form.billing_month)) {
      return setFormError('Számlázási hónap formátuma: YYYY-MM');
    }
    if (!form.category) return setFormError('Kategória kötelező');
    if (form.amount === '' || form.amount == null) return setFormError('Összeg kötelező');
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt < 0) return setFormError('Összeg nem lehet negatív');

    // VAT validation — mirrors server-side checks so we surface errors
    // before round-tripping. Server is still authoritative.
    if (form.vat_rate !== '' && form.vat_rate != null) {
      const r = parseFloat(form.vat_rate);
      if (isNaN(r) || r < 0 || r > 100) return setFormError('ÁFA kulcs 0 és 100 között lehet');
    }
    const hasNet = form.net_amount !== '' && form.net_amount != null;
    const hasVat = form.vat_amount !== '' && form.vat_amount != null;
    if (hasNet !== hasVat) {
      return setFormError('Nettó és ÁFA összeg csak együtt adható meg (vagy egyik sem)');
    }
    if (hasNet && hasVat) {
      const net = parseFloat(form.net_amount);
      const vat = parseFloat(form.vat_amount);
      if (Math.abs(net + vat - amt) > 1) {
        return setFormError(`Nettó + ÁFA ≠ bruttó (${net} + ${vat} ≠ ${amt}, tolerancia 1 Ft)`);
      }
    }

    setSaving(true);
    try {
      if (editing) {
        await expensesAPI.update(editing.id, buildPayload());
        toast.success('Költség frissítve');
      } else {
        const extra = force && overrideNote.trim() ? { override_note: overrideNote.trim() } : {};
        const result = await expensesAPI.create(buildPayload(extra), { force });
        const newId = result?.data?.expense?.id;
        if (newId && stagedFiles.length > 0) {
          let uploaded = 0;
          for (const f of stagedFiles) {
            try {
              await expensesAPI.uploadFile(newId, f);
              uploaded++;
            } catch (err) {
              toast.error(`${f.name}: feltöltés sikertelen`);
            }
          }
          toast.success(uploaded > 0
            ? `Költség rögzítve + ${uploaded} fájl feltöltve`
            : 'Költség rögzítve');
        } else {
          toast.success('Költség rögzítve');
        }
      }
      setFormOpen(false);
      setDedupWarning(null);
      setOverrideNote('');
      setStagedFiles([]);
      setExistingFiles([]);
      await load();
    } catch (e) {
      if (e?.response?.status === 409 && !editing) {
        setDedupWarning(e.response.data?.duplicate_check || null);
      } else {
        setFormError(e?.response?.data?.message || 'Mentés sikertelen');
      }
    } finally {
      setSaving(false);
      setForcing(false);
    }
  };

  const handleForceSave = async () => {
    if (!overrideNote.trim()) {
      toast.error('Indoklás megadása kötelező');
      return;
    }
    setForcing(true);
    setDedupWarning(null);
    await handleSave({ force: true });
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
  const selectedCostCenter = costCenters.find((c) => c.id === form.cost_center_id) || null;

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
                <TableCell>Beszállító</TableCell>
                <TableCell>Kategória</TableCell>
                <TableCell align="right">Összeg</TableCell>
                <TableCell align="center">📎</TableCell>
                <TableCell>Megjegyzés</TableCell>
                <TableCell align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nincs rögzített költség a megadott szűrőkre.
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.map((row) => {
                const meta = catMeta(row.category);
                const fileCount = Array.isArray(row.file_attachments) ? row.file_attachments.length : 0;
                return (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={() => openEdit(row)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{fmtDate(row.created_at)}</TableCell>
                    <TableCell>{row.billing_month}</TableCell>
                    <TableCell>{row.accommodation_name || '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={row.vendor_name || ''}>
                        <span>{row.vendor_name || '—'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={meta.label} color={meta.color} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">{fmtMoney(row.amount)}</TableCell>
                    <TableCell align="center">
                      {fileCount > 0 ? (
                        <Chip size="small" label={fileCount} color="primary" variant="outlined" />
                      ) : (
                        <Typography component="span" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={row.notes || ''}>
                        <span>{row.notes || '—'}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
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
      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editing ? 'Költség szerkesztése' : 'Új költség rögzítése'}</DialogTitle>
        <DialogContent dividers>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}

          {/* ─── Alapadatok ─── */}
          <SectionLabel>Alapadatok</SectionLabel>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                select required fullWidth size="small"
                label="Szállás"
                value={form.accommodation_id}
                onChange={(e) => setForm({ ...form, accommodation_id: e.target.value })}
              >
                {accommodations.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select required fullWidth size="small"
                label="Kategória"
                value={form.category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Teljesítés dátum"
                type="date"
                value={form.performance_date}
                onChange={(e) => setPerformanceDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="HU teljesítés dátum — ÁFA időszak alapja"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Számlázási hónap"
                type="month"
                value={form.billing_month}
                onChange={(e) => setBillingMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText={
                  billingMonthManual || !form.performance_date
                    ? 'Megadható kézzel'
                    : 'Automatikusan a teljesítés dátumból'
                }
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                required fullWidth size="small"
                label="Bruttó összeg (Ft)"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                value={form.amount}
                onChange={(e) => setAmount(e.target.value)}
                helperText="Bruttó (a teljes számla végösszege)"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth size="small"
                label="Megjegyzés"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                multiline rows={2}
              />
            </Grid>
          </Grid>

          {/* ─── Számla adatok ─── */}
          <SectionLabel>Számla adatok</SectionLabel>
          <Grid container spacing={2}>
            {/* VAT — ÁFA kulcs + Nettó + ÁFA */}
            <Grid item xs={12} md={vatSelectValue() === 'custom' ? 6 : 12}>
              <TextField
                select fullWidth size="small"
                label="ÁFA kulcs"
                value={vatSelectValue()}
                onChange={(e) => onVatSelectChange(e.target.value)}
              >
                {VAT_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {vatSelectValue() === 'custom' && (
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth size="small"
                  label="Egyedi ÁFA kulcs (%)"
                  type="number"
                  inputProps={{ min: 0, max: 100, step: 0.01 }}
                  value={form.vat_rate}
                  onChange={(e) => setCustomVatRate(e.target.value)}
                />
              </Grid>
            )}

            {(form.vat_exemption_reason === 'aam' || form.vat_exemption_reason === 'targy_mentes') && (
              <Grid item xs={12}>
                <Alert severity="info" sx={{ py: 0.5 }}>
                  {form.vat_exemption_reason === 'aam'
                    ? 'Alanyi adómentes (AAM) — ÁFA nincs felszámítva. A nettó és bruttó megegyezik.'
                    : 'Tárgyi mentes — a szolgáltatás vagy termék ÁFA mentes. A nettó és bruttó megegyezik.'}
                </Alert>
              </Grid>
            )}

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Nettó összeg (Ft)"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                value={form.net_amount}
                onChange={(e) => setNetAmount(e.target.value)}
                disabled={!!form.vat_exemption_reason}
                helperText={
                  vatAmountsManual
                    ? 'Kézzel megadva'
                    : (form.vat_rate !== '' ? 'Automatikusan a bruttóból és kulcsból' : '')
                }
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="ÁFA összeg (Ft)"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                value={form.vat_amount}
                onChange={(e) => setVatAmount(e.target.value)}
                disabled={!!form.vat_exemption_reason}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Beszállító neve"
                value={form.vendor_name}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                helperText="Számlához kapcsolódó költség esetén javasolt"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Adószám"
                value={form.vendor_tax_number}
                onChange={(e) => setForm({ ...form, vendor_tax_number: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Számlaszám"
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Számla dátum"
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          {/* ─── Csatolmányok ─── */}
          <SectionLabel>Csatolmányok</SectionLabel>

          {/* Existing files (edit mode) */}
          {editing && existingFiles.length > 0 && (
            <Stack spacing={1} sx={{ mb: 1 }}>
              {existingFiles.map((file) => (
                <Stack key={file.id} direction="row" alignItems="center" spacing={1}
                       sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <AttachFileIcon fontSize="small" />
                  <Typography variant="body2" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.original_name || file.filename}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{fmtBytes(file.size)}</Typography>
                  <Tooltip title="Letöltés">
                    <IconButton size="small" onClick={() => handleDownload(file)}>
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Eltávolítás">
                    <IconButton size="small" color="error" onClick={() => handleExistingFileDelete(file)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ))}
            </Stack>
          )}

          {/* Staged files (create mode) */}
          {!editing && stagedFiles.length > 0 && (
            <Stack spacing={1} sx={{ mb: 1 }}>
              {stagedFiles.map((file, i) => (
                <Stack key={i} direction="row" alignItems="center" spacing={1}
                       sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <AttachFileIcon fontSize="small" />
                  <Typography variant="body2" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{fmtBytes(file.size)}</Typography>
                  <Chip size="small" label="Mentésre vár" variant="outlined" />
                  <IconButton size="small" color="error" onClick={() => removeStagedFile(i)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
          )}

          {/* Drop zone */}
          <Box
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
            onDrop={onDropZoneDrop}
            sx={{
              p: 3, mt: 1,
              border: 2, borderStyle: 'dashed',
              borderColor: dragOver ? 'primary.main' : 'divider',
              bgcolor: dragOver ? 'action.hover' : 'background.default',
              borderRadius: 1, textAlign: 'center',
              transition: 'all 0.15s ease',
              cursor: 'pointer',
            }}
            onClick={() => document.getElementById('expense-file-input')?.click()}
          >
            <input
              id="expense-file-input"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              hidden
              onChange={onFileInputChange}
            />
            <Stack alignItems="center" spacing={1}>
              {fileUploading ? <CircularProgress size={24} /> : <CloudUploadIcon color="action" />}
              <Typography variant="body2" color="text.secondary">
                Húzd ide a fájlokat, vagy kattints a tallózáshoz
              </Typography>
              <Typography variant="caption" color="text.secondary">
                PDF / JPG / PNG · max 10 MB
              </Typography>
            </Stack>
          </Box>

          {/* ─── Speciális beállítások (cost_center) ─── */}
          <Accordion
            expanded={showAdvanced}
            onChange={() => setShowAdvanced(!showAdvanced)}
            sx={{ mt: 2, boxShadow: 'none', '&:before': { display: 'none' }, border: 1, borderColor: 'divider' }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>Speciális beállítások</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={!!form.is_reverse_vat}
                      onChange={(e) => setIsReverseVat(e.target.checked)}
                    />
                  }
                  label="Fordított adózás (vevő számolja el az ÁFA-t)"
                />
                {form.is_reverse_vat && (
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    Fordított adózás — a számla 0% ÁFA-val érkezik, te (vevő) számolod el az ÁFA-t
                    a saját bevallásodban. Tipikus esetek: építési-szerelési munka, fémhulladék.
                  </Alert>
                )}
                <Autocomplete
                  size="small"
                  options={costCenters}
                  value={selectedCostCenter}
                  onChange={(_, v) => setForm({ ...form, cost_center_id: v?.id || '' })}
                  getOptionLabel={(opt) => opt ? `${opt.name}${opt.code ? ` (${opt.code})` : ''}` : ''}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  renderInput={(params) => (
                    <TextField {...params} label="Költséghely" helperText="Opcionális: hozzárendelhető a régi cost_center taxonómiához" />
                  )}
                  noOptionsText="Nincs találat"
                />
              </Stack>
            </AccordionDetails>
          </Accordion>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)} disabled={saving}>Mégse</Button>
          <Button variant="contained" onClick={() => handleSave({ force: false })} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : (editing ? 'Mentés' : 'Rögzítés')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Dedup warning modal ─── */}
      <Dialog
        open={!!dedupWarning}
        onClose={() => !forcing && setDedupWarning(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <WarningIcon color="warning" />
            <span>Lehetséges duplikátum észlelve</span>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {dedupWarning?.confidence === 100
              ? 'Pontos egyezés található. Ellenőrizd, hogy nem ugyanazt a számlát próbálod-e duplán rögzíteni.'
              : `Magas hasonlóság: ${dedupWarning?.confidence}%`}
          </Alert>

          {dedupWarning?.exactMatches?.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Pontos egyezés ({dedupWarning.exactMatches.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Beszállító</TableCell>
                      <TableCell align="right">Összeg</TableCell>
                      <TableCell>Teljesítés</TableCell>
                      <TableCell>Hónap</TableCell>
                      <TableCell>Rögzítve</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dedupWarning.exactMatches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.vendor_name || '—'}</TableCell>
                        <TableCell align="right">{fmtMoney(m.amount)}</TableCell>
                        <TableCell>{fmtDate(m.performance_date)}</TableCell>
                        <TableCell>{m.billing_month}</TableCell>
                        <TableCell>{fmtDate(m.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {dedupWarning?.fuzzyMatches?.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Hasonló ({dedupWarning.fuzzyMatches.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Beszállító</TableCell>
                      <TableCell align="right">Összeg</TableCell>
                      <TableCell>Teljesítés</TableCell>
                      <TableCell align="right">Hasonlóság</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dedupWarning.fuzzyMatches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.vendor_name || '—'}</TableCell>
                        <TableCell align="right">{fmtMoney(m.amount)}</TableCell>
                        <TableCell>{fmtDate(m.performance_date)}</TableCell>
                        <TableCell align="right">
                          <Chip size="small" label={`${m.similarity_pct}%`}
                                color={m.similarity_pct >= 90 ? 'warning' : 'default'} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          <Divider sx={{ my: 2 }} />
          <TextField
            required fullWidth multiline rows={3}
            label="Indoklás (kötelező)"
            placeholder="Pl. ugyanaz a beszállító, de külön számla a karbantartásra"
            value={overrideNote}
            onChange={(e) => setOverrideNote(e.target.value)}
            helperText="Az indoklás bekerül a tevékenységi naplóba (activity_log)."
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => { setDedupWarning(null); setOverrideNote(''); }}
            disabled={forcing}
          >
            Mégse
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={handleForceSave}
            disabled={forcing || !overrideNote.trim()}
          >
            {forcing ? <CircularProgress size={20} /> : 'Mégis mentés'}
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
// Tab 4: Profit Dashboard
// ────────────────────────────────────────────────────────────────────────

const COLOR_INCOME    = '#16a34a'; // green
const COLOR_EXPENSE   = '#dc2626'; // red
const COLOR_PROFIT_POS = '#16a34a';
const COLOR_PROFIT_NEG = '#dc2626';
const COLOR_NEUTRAL   = '#475569';

// ────────────────────────────────────────────────────────────────────────
// Tab 2: Beérkezett számlák — list pending invoice_drafts + "Konvertálás
// költséggé" flow. POST /api/v1/invoice-drafts/:id/convert handles the
// expense creation, PDF copy, draft status update + audit log server-side.
// ────────────────────────────────────────────────────────────────────────

function DraftsTab() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(false);

  // ─── Convert dialog state ─────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null); // currently selected draft row
  const [form, setForm] = useState({
    accommodation_id: '',
    performance_date: '',
    billing_month: '',
    category: 'rezsi',
    amount: '',
    vat_rate: '27',
    notes: '',
    cost_center_id: '',
  });
  const [billingMonthManual, setBillingMonthManual] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [accommodations, setAccommodations] = useState([]);
  const [costCenters, setCostCenters] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [accRes, ccRes] = await Promise.all([
          accommodationsAPI.getAll({ limit: 500 }),
          costCentersAPI.getAll({ limit: 500, is_active: 'true' }),
        ]);
        const accs = accRes?.accommodations || accRes?.data?.accommodations || accRes?.data || [];
        setAccommodations(Array.isArray(accs) ? accs : []);
        const ccs = ccRes?.costCenters || ccRes?.data?.costCenters || ccRes?.data || ccRes?.cost_centers || [];
        setCostCenters(Array.isArray(ccs) ? ccs : []);
      } catch (e) { /* silent */ }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoiceDraftsAPI.getAll({ status: 'pending', limit: 100 });
      const list = res?.data?.drafts || res?.data || res?.drafts || [];
      setDrafts(Array.isArray(list) ? list : []);
    } catch (e) {
      toast.error('Számla piszkozatok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openConvert = (d) => {
    setDraft(d);
    // Pre-fill performance_date with the priority chain:
    //   draft.performanceDate (new, from OCR — migration 116) >
    //   draft.invoiceDate (legacy fallback for pre-migration drafts) >
    //   empty
    // NOTE 1: formatDraft returns camelCase, NOT snake_case.
    // NOTE 2: pg returns DATE as a Date at LOCAL midnight, which slides to
    //   the previous UTC day under CEST. fmtDateInput uses local components.
    const perf = fmtDateInput(d.performanceDate || d.invoiceDate);
    setForm({
      accommodation_id: '',
      performance_date: perf,
      billing_month: perf ? perf.slice(0, 7) : '',
      category: 'rezsi',
      amount: '',
      vat_rate: '27',
      notes: d.description ? String(d.description).slice(0, 200) : '',
      // Default the cost center to the AI's suggestion — one click when right,
      // change it when wrong (the human override).
      cost_center_id: d.suggestedCostCenter?.id || '',
    });
    setBillingMonthManual(false);
    setError('');
    setOpen(true);
  };

  const setPerformanceDate = (value) => {
    setForm((f) => {
      const next = { ...f, performance_date: value };
      if (!billingMonthManual && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        next.billing_month = value.slice(0, 7);
      }
      return next;
    });
  };

  const setBillingMonth = (value) => {
    setForm((f) => ({ ...f, billing_month: value }));
    setBillingMonthManual(true);
  };

  const setCategory = (cat) => {
    setForm((f) => {
      const next = { ...f, category: cat };
      const def = DEFAULT_VAT_RATE_BY_CATEGORY[cat];
      next.vat_rate = def != null ? String(def) : '';
      return next;
    });
  };

  const handleConvert = async () => {
    setError('');
    if (!form.accommodation_id) return setError('Szállás megadása kötelező');
    if (!form.performance_date && !form.billing_month) {
      return setError('Teljesítés dátum vagy számlázási hónap kötelező');
    }
    const amt = parseFloat(form.amount);
    if (Number.isNaN(amt) || amt < 0) return setError('Bruttó összeg pozitív szám kell legyen');
    if (!form.category) return setError('Kategória kötelező');

    setSaving(true);
    try {
      await invoiceDraftsAPI.convert(draft.id, {
        accommodation_id: form.accommodation_id,
        performance_date: form.performance_date || null,
        billing_month: form.billing_month || undefined,
        category: form.category,
        amount: amt,
        vat_rate: form.vat_rate === '' ? null : Number(form.vat_rate),
        notes: form.notes || null,
        cost_center_id: form.cost_center_id || null, // human override; backend falls back to the AI suggestion
        // Server adds source='email_ocr' + merges draft vendor/invoice metadata
      });
      toast.success('Költség létrehozva a piszkozatból');
      setOpen(false);
      await load();
    } catch (e) {
      const status = e?.response?.status;
      if (status === 409) {
        toast.warning(e?.response?.data?.message || 'A piszkozat már át lett konvertálva');
        setOpen(false);
        await load();
        return;
      }
      setError(e?.response?.data?.message || 'Konvertálás sikertelen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Beérkezett számlák — konverzióra váró piszkozatok
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Frissítés">
            <IconButton onClick={load}><RefreshIcon /></IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          A régi e-mail/OCR pipeline által rögzített piszkozatok. A "Konvertálás" gombbal
          az adatokból költség sor jön létre — a PDF automatikusan átkerül a csatolmányok közé.
        </Typography>
      </Paper>

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Beszállító</TableCell>
                <TableCell>Adószám</TableCell>
                <TableCell>Számlaszám</TableCell>
                <TableCell>Számla dátum</TableCell>
                <TableCell>Esedékesség</TableCell>
                <TableCell>OCR szöveg</TableCell>
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
              {!loading && drafts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nincs konverzióra váró piszkozat.
                  </TableCell>
                </TableRow>
              )}
              {!loading && drafts.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={d.vendorName || ''}>
                      <span>{d.vendorName || '—'}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{d.vendorTaxNumber || '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.invoiceNumber || '—'}
                  </TableCell>
                  <TableCell>{fmtDate(d.invoiceDate)}</TableCell>
                  <TableCell>{fmtDate(d.dueDate)}</TableCell>
                  <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Tooltip title={d.description || ''}>
                      <span>{d.description ? String(d.description).slice(0, 60) : '—'}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="contained" onClick={() => openConvert(d)}>
                      Konvertálás
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Convert dialog */}
      <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Konvertálás költséggé</DialogTitle>
        <DialogContent dividers>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {draft && (
            <Alert severity="info" sx={{ mb: 2 }} icon={<AttachFileIcon />}>
              <Typography variant="body2"><strong>{draft.vendorName || '—'}</strong></Typography>
              <Typography variant="caption" color="text.secondary">
                Számla: {draft.invoiceNumber || '—'} · Adószám: {draft.vendorTaxNumber || '—'}
                {draft.pdfFilePath && ' · PDF automatikusan csatolva'}
              </Typography>
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                select required fullWidth size="small"
                label="Szállás"
                value={form.accommodation_id}
                onChange={(e) => setForm({ ...form, accommodation_id: e.target.value })}
              >
                {accommodations.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select required fullWidth size="small"
                label="Kategória"
                value={form.category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                select fullWidth size="small"
                label="Költséghely"
                value={form.cost_center_id}
                onChange={(e) => setForm({ ...form, cost_center_id: e.target.value })}
                helperText={
                  draft?.suggestedCostCenter?.id
                    ? `AI javaslat: ${draft.suggestedCostCenter.code ? draft.suggestedCostCenter.code + ' · ' : ''}${draft.suggestedCostCenter.name}`
                      + (draft.costCenterConfidence != null ? ` (${Math.round(draft.costCenterConfidence * 100)}% biztos)` : '')
                      + (form.cost_center_id !== (draft.suggestedCostCenter.id || '') ? ' — felülírva' : '')
                    : 'Az AI nem javasolt költséghelyet — válassz kézzel'
                }
              >
                <MenuItem value="">— Nincs költséghely —</MenuItem>
                {costCenters.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.code ? `${c.code} · ${c.name}` : c.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                required fullWidth size="small"
                label="Bruttó összeg (Ft)"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                helperText="Olvasd le a PDF-ről vagy az OCR szövegből"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Teljesítés dátum"
                type="date"
                value={form.performance_date}
                onChange={(e) => setPerformanceDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth size="small"
                label="Számlázási hónap"
                type="month"
                value={form.billing_month}
                onChange={(e) => setBillingMonth(e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText={billingMonthManual ? 'Kézzel' : 'Automatikusan'}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                select fullWidth size="small"
                label="ÁFA kulcs"
                value={form.vat_rate}
                onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
              >
                <MenuItem value="">— Nincs megadva —</MenuItem>
                <MenuItem value="27">27% (standard)</MenuItem>
                <MenuItem value="18">18%</MenuItem>
                <MenuItem value="5">5%</MenuItem>
                <MenuItem value="0">0%</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth size="small"
                label="Megjegyzés"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                multiline rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Mégse</Button>
          <Button variant="contained" onClick={handleConvert} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Konvertálás'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Tab 5: Könyvelői hozzáférés (Day 4 — share-link rewrite, 2026-05-21)
//
// Admin issues a tokenised public URL for a given month. The accountant
// opens it without logging in and downloads the bundled ZIP on demand.
// Default expiry 14 days. Revocable any time. Tokens shown truncated in
// logs only; full URL stays in admin clipboard until accountant has it.
// ────────────────────────────────────────────────────────────────────────

const HU_MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

function AccountantShareTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [expiresInDays, setExpiresInDays] = useState(14);

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createNotice, setCreateNotice] = useState(null); // { public_url, preview }
  const [revokeId, setRevokeId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountantSharesAPI.list();
      const arr = res?.data?.links || [];
      setList(Array.isArray(arr) ? arr : []);
    } catch (e) {
      toast.error('Linkek betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await accountantSharesAPI.create({ year, month, expires_in_days: expiresInDays });
      setCreateNotice({
        public_url: r.data.public_url,
        preview: r.preview,
        expires_at: r.data.expires_at,
        period: `${year}. ${HU_MONTHS[month - 1]}`,
      });
      toast.success('Link létrehozva');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Link létrehozása sikertelen');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link a vágólapra másolva');
    } catch (e) {
      toast.error('Másolás sikertelen — másold ki kézzel');
    }
  };

  const handleRevoke = async () => {
    if (!revokeId) return;
    try {
      await accountantSharesAPI.revoke(revokeId);
      toast.success('Link visszavonva');
      setRevokeId(null);
      await load();
    } catch (e) {
      toast.error('Visszavonás sikertelen');
    }
  };

  const expiryColor = (expiresAt) => {
    const days = (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24);
    if (days < 1) return 'error';
    if (days < 3) return 'warning';
    return 'default';
  };

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <TextField
            select size="small" label="Év"
            value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}
            sx={{ minWidth: 110 }}
          >
            {Array.from({ length: 6 }).map((_, i) => {
              const y = now.getFullYear() - 4 + i;
              return <MenuItem key={y} value={y}>{y}</MenuItem>;
            })}
          </TextField>
          <TextField
            select size="small" label="Hónap"
            value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            sx={{ minWidth: 160 }}
          >
            {HU_MONTHS.map((label, i) => (
              <MenuItem key={i + 1} value={i + 1}>{label}</MenuItem>
            ))}
          </TextField>
          <TextField
            type="number" size="small" label="Lejárat (nap)"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(parseInt(e.target.value, 10) || 14)}
            inputProps={{ min: 1, max: 365 }}
            sx={{ minWidth: 130 }}
          />
          <Tooltip title="Frissítés">
            <IconButton onClick={load}><RefreshIcon /></IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate} disabled={creating}>
            {creating ? <CircularProgress size={20} /> : 'Új hozzáférés generálása'}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          A könyvelő bejelentkezés nélkül megnyithatja a generált linket. A link
          alapértelmezetten <strong>14 napig</strong> él, bármikor visszavonható.
          Csak <strong>jóváhagyott</strong> költségek jelennek meg.
        </Typography>
      </Paper>

      {/* Just-created link banner with copy-to-clipboard */}
      {createNotice && (
        <Alert
          severity="success" sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => setCreateNotice(null)}>Bezárás</Button>
          }
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Új link létrehozva — {createNotice.period}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.5 }}>
            <Box sx={{
              flexGrow: 1, p: 0.5, bgcolor: 'background.paper',
              border: 1, borderColor: 'divider', borderRadius: 0.5,
              fontFamily: 'monospace', fontSize: '0.75rem',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {createNotice.public_url}
            </Box>
            <Button size="small" variant="outlined" onClick={() => handleCopy(createNotice.public_url)}>
              Másolás
            </Button>
          </Stack>
          {createNotice.preview && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {createNotice.preview.expense_count} jóváhagyott költség
              {createNotice.preview.pending_review_count > 0 && (
                <span style={{ color: '#b54708' }}>
                  {' '}· ⚠ {createNotice.preview.pending_review_count} jóváhagyásra vár (nem lesz látható a könyvelőnek)
                </span>
              )}
            </Typography>
          )}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Időszak</TableCell>
                <TableCell>Létrehozva</TableCell>
                <TableCell>Lejár</TableCell>
                <TableCell align="right">Megnyitások</TableCell>
                <TableCell>Utolsó hozzáférés</TableCell>
                <TableCell>Publikus link</TableCell>
                <TableCell align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              )}
              {!loading && list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nincs aktív megosztás. Generálj egy új linket a fenti űrlappal.
                  </TableCell>
                </TableRow>
              )}
              {!loading && list.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell>{l.year}. {HU_MONTHS[l.month - 1]}</TableCell>
                  <TableCell>{fmtDate(l.created_at)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small" variant="outlined" color={expiryColor(l.expires_at)}
                      label={fmtDate(l.expires_at)}
                    />
                  </TableCell>
                  <TableCell align="right">{l.accessed_count}</TableCell>
                  <TableCell>{l.last_accessed_at ? fmtDate(l.last_accessed_at) : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    <Box sx={{
                      fontFamily: 'monospace', fontSize: '0.72rem',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {l.public_url}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Link másolása">
                      <IconButton size="small" onClick={() => handleCopy(l.public_url)}>
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Megnyitás új ablakban">
                      <IconButton size="small" component="a" href={l.public_url} target="_blank" rel="noopener">
                        <AttachFileIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Visszavonás">
                      <IconButton size="small" color="error" onClick={() => setRevokeId(l.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Revoke confirm */}
      <Dialog open={!!revokeId} onClose={() => setRevokeId(null)}>
        <DialogTitle>Link visszavonása</DialogTitle>
        <DialogContent>
          <Typography>Visszavonod a hozzáférést? A könyvelő ezután már nem nyithatja meg a linket.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeId(null)}>Mégse</Button>
          <Button color="error" variant="contained" onClick={handleRevoke}>Visszavonás</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function SummaryCard({ title, value, color, icon, subtitle }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ py: 2.5, px: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
        </Stack>
        <Typography variant="h4" sx={{ fontWeight: 700, color }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <Paper sx={{ p: 1.5, minWidth: 200 }} elevation={4}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{label}</Typography>
      {payload.map((p) => (
        <Stack key={p.dataKey} direction="row" justifyContent="space-between" spacing={2}>
          <Typography variant="body2" sx={{ color: p.color }}>{p.name}:</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{fmtMoney(p.value)}</Typography>
        </Stack>
      ))}
    </Paper>
  );
}

// Minimum visible spinner time so the "Profit számítása…" state can't flash
// imperceptibly when the API responds in <50ms.
const MIN_LOADING_MS = 300;

function ProfitTab() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Single effect owns the data lifecycle. We do NOT clear `data` eagerly —
  // the old chart stays visible behind the spinner until new data arrives,
  // which avoids the "empty render → manual refresh" glitch.
  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    let cancelled = false;
    const startedAt = Date.now();
    setLoading(true);
    (async () => {
      try {
        const res = await profitAPI.byAccommodation({ month });
        if (cancelled) return;
        const elapsed = Date.now() - startedAt;
        const remaining = MIN_LOADING_MS - elapsed;
        if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
        if (cancelled) return;
        setData(res?.data || null);
      } catch (e) {
        if (!cancelled) toast.error('Profit lekérdezés sikertelen');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const chartData = useMemo(() => {
    if (!data) return [];
    return (data.by_accommodation || []).map((r) => ({
      name: r.accommodation_name || '—',
      Bevétel: r.income || 0,
      Költség: r.expenses?.total || 0,
    }));
  }, [data]);

  const summary = data?.summary;
  const rows = data?.by_accommodation || [];
  const isEmpty = !loading && data && rows.length === 0;

  const profitColor = summary?.total_profit > 0
    ? COLOR_PROFIT_POS
    : summary?.total_profit < 0
      ? COLOR_PROFIT_NEG
      : COLOR_NEUTRAL;

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            label="Hónap"
            type="month"
            size="small"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 180 }}
            disabled={loading}
          />
          <Tooltip title="Újraszámítás">
            <span>
              <IconButton onClick={refresh} disabled={loading}><RefreshIcon /></IconButton>
            </span>
          </Tooltip>
          {loading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{
              color: 'primary.main',
              px: 1.5, py: 0.5,
              bgcolor: 'action.hover',
              borderRadius: 1,
            }}>
              <CircularProgress size={18} />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Profit számítása…
              </Typography>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Összes bevétel"
            value={fmtMoney(summary?.total_income ?? 0)}
            color={COLOR_INCOME}
            icon={<TrendingUpIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Összes költség"
            value={fmtMoney(summary?.total_expenses ?? 0)}
            color={COLOR_EXPENSE}
            icon={<TrendingDownIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Bérleti díj"
            value={fmtMoney(summary?.total_rent ?? 0)}
            color={COLOR_EXPENSE}
            icon={<TrendingDownIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Profit"
            value={fmtMoney(summary?.total_profit ?? 0)}
            color={profitColor}
            icon={<AccountBalanceIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Profit margin"
            value={summary?.profit_margin_pct == null ? '—' : `${summary.profit_margin_pct}%`}
            color={profitColor}
            icon={<PercentIcon />}
          />
        </Grid>
      </Grid>

      {/* Empty state */}
      {isEmpty && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Nincs adat erre a hónapra.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Próbálj egy másik hónapot, vagy rögzíts költséget a Költségek fülön.
          </Typography>
        </Paper>
      )}

      {/* Chart */}
      {!isEmpty && rows.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Bevétel vs. költség szállásonként
          </Typography>
          <Box sx={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12 }}
                  interval={0}
                  angle={chartData.length > 5 ? -25 : 0}
                  textAnchor={chartData.length > 5 ? 'end' : 'middle'}
                  height={chartData.length > 5 ? 60 : 30}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => `${(v / 1000).toLocaleString('hu-HU')}k`}
                />
                <RTooltip content={<ChartTooltip />} />
                <Legend />
                <Bar dataKey="Bevétel" fill={COLOR_INCOME} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Költség" fill={COLOR_EXPENSE} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {/* Detailed table */}
      {!isEmpty && rows.length > 0 && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Szállás</TableCell>
                  <TableCell align="right">Bevétel</TableCell>
                  <TableCell align="right">Rezsi</TableCell>
                  <TableCell align="right">Karbantartás</TableCell>
                  <TableCell align="right">Takarítás</TableCell>
                  <TableCell align="right">Egyéb</TableCell>
                  <TableCell align="right">Költség össz.</TableCell>
                  <TableCell align="right">Bérleti díj</TableCell>
                  <TableCell align="right">Profit</TableCell>
                  <TableCell align="right">Margin</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const exp = r.expenses || {};
                  const pColor = r.profit > 0
                    ? COLOR_PROFIT_POS
                    : r.profit < 0 ? COLOR_PROFIT_NEG : COLOR_NEUTRAL;
                  return (
                    <TableRow key={r.accommodation_id} hover>
                      <TableCell>{r.accommodation_name || '—'}</TableCell>
                      <TableCell align="right" sx={{ color: COLOR_INCOME, fontWeight: 600 }}>
                        {fmtMoney(r.income)}
                      </TableCell>
                      <TableCell align="right">{fmtMoney(exp.rezsi || 0)}</TableCell>
                      <TableCell align="right">{fmtMoney(exp.karbantartas || 0)}</TableCell>
                      <TableCell align="right">{fmtMoney(exp.takaritas || 0)}</TableCell>
                      <TableCell align="right">{fmtMoney(exp.egyeb || 0)}</TableCell>
                      <TableCell align="right" sx={{ color: COLOR_EXPENSE, fontWeight: 600 }}>
                        {fmtMoney(exp.total || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: COLOR_EXPENSE }}>
                        {fmtMoney(r.rent || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: pColor, fontWeight: 700 }}>
                        {fmtMoney(r.profit)}
                      </TableCell>
                      <TableCell align="right" sx={{ color: pColor, fontWeight: 600 }}>
                        {r.profit_margin_pct == null ? '—' : `${r.profit_margin_pct}%`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Üzemeltetési költségek — per-szálló operating costs (costs only), category
// split + cost-per-bed-night, with Excel/PDF export. Driven entirely by the
// live accommodation_id FK, so it auto-tracks added/closed accommodations.
// ────────────────────────────────────────────────────────────────────────
const OPCOST_CATS = [
  { key: 'rezsi', label: 'Rezsi', short: 'Rezsi' },
  { key: 'karbantartas', label: 'Karbantartás', short: 'Karbant.' },
  { key: 'takaritas', label: 'Takarítás', short: 'Takarít.' },
  { key: 'egyeb', label: 'Egyéb', short: 'Egyéb' },
];

// Compact grouped number (no currency suffix) so all 8 columns — including
// Ft/lakónap — fit without horizontal scrolling. Unit is stated in a caption.
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('hu-HU'));

function OperatingCostsTab() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await operatingCostsAPI.byAccommodation({ month });
        if (!cancelled) setData(res?.data || null);
      } catch (e) {
        if (!cancelled) toast.error('Üzemeltetési költség lekérdezés sikertelen');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month, refreshKey]);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const blob = await operatingCostsAPI.exportReport({ month, format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uzemeltetesi-koltsegek-${month}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Export sikertelen');
    } finally {
      setExporting('');
    }
  };

  const summary = data?.summary;
  const rows = data?.by_accommodation || [];
  const isEmpty = !loading && data && rows.length === 0;

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            label="Hónap" type="month" size="small"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 180 }}
            disabled={loading}
          />
          <Tooltip title="Újraszámítás">
            <span><IconButton onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}><RefreshIcon /></IconButton></span>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="outlined" size="small" startIcon={<DownloadIcon />}
            onClick={() => handleExport('xlsx')}
            disabled={loading || !!exporting || rows.length === 0}
          >
            {exporting === 'xlsx' ? 'Exportálás…' : 'Excel'}
          </Button>
          <Button
            variant="outlined" size="small" startIcon={<DownloadIcon />}
            onClick={() => handleExport('pdf')}
            disabled={loading || !!exporting || rows.length === 0}
          >
            {exporting === 'pdf' ? 'Exportálás…' : 'PDF'}
          </Button>
          {loading && <CircularProgress size={20} />}
        </Stack>
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <SummaryCard title="Összes üzemeltetési költség" value={fmtMoney(summary?.total_cost ?? 0)} color={COLOR_EXPENSE} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SummaryCard title="Lakónapok (hó)" value={(summary?.total_occupant_nights ?? 0).toLocaleString('hu-HU')} color={COLOR_NEUTRAL} />
        </Grid>
        <Grid item xs={12} sm={4}>
          <SummaryCard title="Átlag Ft / lakónap" value={summary?.cost_per_night == null ? '—' : fmtMoney(summary.cost_per_night)} color={COLOR_INCOME} />
        </Grid>
      </Grid>

      {isEmpty ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">Nincs üzemeltetési költség erre a hónapra.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table
            size="small"
            sx={{
              width: '100%',
              tableLayout: 'fixed',
              '& th, & td': { px: 1, py: 0.75, whiteSpace: 'nowrap' },
              '& td:not(:first-of-type), & th:not(:first-of-type)': { fontVariantNumeric: 'tabular-nums' },
            }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '22%' }}>Szállás</TableCell>
                {OPCOST_CATS.map((c) => (
                  <TableCell key={c.key} align="right" sx={{ fontWeight: 700 }}>{c.short}</TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 700 }}>Összes</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Lakónap</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Ft/lakónap</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.accommodation_id} hover>
                  <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.accommodation_name || '—'}>
                    {r.accommodation_name || '—'}
                  </TableCell>
                  {OPCOST_CATS.map((c) => (
                    <TableCell key={c.key} align="right">{fmtNum(r.expenses?.[c.key] || 0)}</TableCell>
                  ))}
                  <TableCell align="right" sx={{ color: COLOR_EXPENSE, fontWeight: 600 }}>{fmtNum(r.expenses?.total || 0)}</TableCell>
                  <TableCell align="right">{r.occupant_nights}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{r.cost_per_night == null ? '—' : fmtNum(r.cost_per_night)}</TableCell>
                </TableRow>
              ))}
              {summary && rows.length > 0 && (
                <TableRow sx={{ '& td': { fontWeight: 700, borderTop: '2px solid #e5e7eb' } }}>
                  <TableCell>ÖSSZESEN</TableCell>
                  {OPCOST_CATS.map((c) => (
                    <TableCell key={c.key} align="right">{fmtNum(summary.by_category?.[c.key] || 0)}</TableCell>
                  ))}
                  <TableCell align="right" sx={{ color: COLOR_EXPENSE }}>{fmtNum(summary.total_cost || 0)}</TableCell>
                  <TableCell align="right">{summary.total_occupant_nights}</TableCell>
                  <TableCell align="right">{summary.cost_per_night == null ? '—' : fmtNum(summary.cost_per_night)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        Az összegek forintban (Ft). „Ft/lakónap” = összes költség ÷ lakónapok.
      </Typography>
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
      {tabIdx === 1 && <DraftsTab />}
      {tabIdx === 2 && <PlaceholderTab title="Számlázási futások" />}
      {tabIdx === 3 && <PlaceholderTab title="Számlázások" />}
      {tabIdx === 4 && <AccountantShareTab />}
      {tabIdx === 5 && <ProfitTab />}
      {tabIdx === 6 && <OperatingCostsTab />}
    </Box>
  );
}
