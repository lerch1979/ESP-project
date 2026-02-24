import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, IconButton, Tooltip, Breadcrumbs, Link,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, MenuItem, Select, FormControl, InputLabel,
  Collapse, Alert, LinearProgress, Tabs, Tab,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon,
  Delete as DeleteIcon, AccountTree as TreeIcon,
  ChevronRight as ChevronRightIcon, ExpandMore as ExpandMoreIcon,
  NavigateNext as NavigateNextIcon, DriveFileMove as MoveIcon,
  Assessment as BudgetIcon, Receipt as InvoiceIcon,
  Home as HomeIcon,
} from '@mui/icons-material';
import { costCentersAPI } from '../services/api';
import { toast } from 'react-toastify';
import InvoiceFormModal from '../components/invoices/InvoiceFormModal';

// ============================================
// PAYMENT STATUS CONFIG
// ============================================

const PAYMENT_STATUSES = {
  pending: { label: 'Függőben', color: 'warning' },
  paid: { label: 'Fizetve', color: 'success' },
  overdue: { label: 'Lejárt', color: 'error' },
  cancelled: { label: 'Sztornó', color: 'default' },
};

// Format large amounts for badges (e.g. 1.57M, 234K)
const formatCompactAmount = (val) => {
  if (!val || val === 0) return '0 Ft';
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M Ft`;
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K Ft`;
  return `${Math.round(val)} Ft`;
};

// Color by amount: green < 1M, yellow 1-5M, red > 5M
const getAmountColor = (val) => {
  if (!val || val === 0) return '#9ca3af';
  if (val < 1000000) return '#10b981';
  if (val <= 5000000) return '#f59e0b';
  return '#ef4444';
};

// ============================================
// TREE NODE COMPONENT
// ============================================

function TreeNode({ node, level = 0, selectedId, onSelect, expandedIds, onToggle }) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const summary = node.summary;
  const hasSummary = summary && summary.totalInvoices > 0;

  const summaryTooltip = hasSummary ? (
    `${summary.totalInvoices} számla\nNettó: ${new Intl.NumberFormat('hu-HU').format(summary.totalNetAmount)} Ft\nÁFA: ${new Intl.NumberFormat('hu-HU').format(summary.totalVatAmount)} Ft\nBruttó: ${new Intl.NumberFormat('hu-HU').format(summary.totalGrossAmount)} Ft\n${summary.firstInvoiceDate ? `${summary.firstInvoiceDate} - ${summary.lastInvoiceDate}` : ''}`
  ) : '';

  return (
    <>
      <Box
        onClick={() => onSelect(node)}
        sx={{
          display: 'flex', alignItems: 'center', py: 1, px: 2,
          pl: 2 + level * 3, cursor: 'pointer', borderRadius: 1,
          bgcolor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
          borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
          '&:hover': { bgcolor: isSelected ? 'rgba(37, 99, 235, 0.12)' : 'rgba(0,0,0,0.04)' },
          transition: 'all 0.15s',
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
            sx={{ mr: 0.5, p: 0.25 }}
          >
            {isExpanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 28, mr: 0.5 }} />
        )}
        <Typography sx={{ mr: 1, fontSize: '1.1rem' }}>{node.icon || '📁'}</Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: isSelected ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.name}
          </Typography>
          {node.code && (
            <Typography variant="caption" color="text.secondary">{node.code}</Typography>
          )}
        </Box>
        {!node.is_active && <Chip label="Inaktív" size="small" color="default" sx={{ ml: 1 }} />}
        {hasSummary && (
          <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{summaryTooltip}</span>} arrow placement="right">
            <Chip
              label={`${summary.totalInvoices} | ${formatCompactAmount(summary.totalGrossAmount)}`}
              size="small"
              sx={{
                ml: 1, height: 22, fontSize: '0.7rem', fontWeight: 600,
                bgcolor: `${getAmountColor(summary.totalGrossAmount)}18`,
                color: getAmountColor(summary.totalGrossAmount),
                border: `1px solid ${getAmountColor(summary.totalGrossAmount)}40`,
              }}
            />
          </Tooltip>
        )}
        {hasChildren && (
          <Chip label={node.children.length} size="small" variant="outlined" sx={{ ml: 0.5, minWidth: 24, height: 20 }} />
        )}
      </Box>
      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </Collapse>
      )}
    </>
  );
}

// ============================================
// COST CENTER FORM DIALOG
// ============================================

function CostCenterFormDialog({ open, onClose, onSave, editData, parentOptions }) {
  const [form, setForm] = useState({ name: '', code: '', parent_id: '', description: '', budget: '', color: '#3b82f6', icon: '📁' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editData) {
      setForm({
        name: editData.name || '',
        code: editData.code || '',
        parent_id: editData.parent_id || '',
        description: editData.description || '',
        budget: editData.budget || '',
        color: editData.color || '#3b82f6',
        icon: editData.icon || '📁',
      });
    } else {
      setForm({ name: '', code: '', parent_id: '', description: '', budget: '', color: '#3b82f6', icon: '📁' });
    }
  }, [editData, open]);

  const ICONS = ['📁', '📊', '📈', '👥', '🏗️', '🏢', '🏬', '🏠', '💰', '🎓', '💻', '⚡', '💧', '🔥', '🌐', '🔨', '👷', '📦', '📢', '🛠️', '📋', '🏘️'];

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('A név megadása kötelező');
      return;
    }
    setSaving(true);
    try {
      const data = { ...form, budget: form.budget ? parseFloat(form.budget) : null, parent_id: form.parent_id || null };
      await onSave(data);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editData ? 'Költséghely szerkesztése' : 'Új költséghely'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Név *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth size="small" />
          <TextField label="Kód" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} fullWidth size="small" placeholder="pl. OPR-BP-REZSI" helperText="Egyedi azonosító (opcionális)" />
          <FormControl fullWidth size="small">
            <InputLabel>Szülő költséghely</InputLabel>
            <Select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })} label="Szülő költséghely">
              <MenuItem value="">-- Nincs (gyökér szint) --</MenuItem>
              {parentOptions.map((opt) => (
                <MenuItem key={opt.id} value={opt.id}>
                  {'  '.repeat((opt.level || 1) - 1)}{opt.icon || '📁'} {opt.name} ({opt.code || '-'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Leírás" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth size="small" multiline rows={2} />
          <TextField label="Költségkeret (HUF)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} fullWidth size="small" type="number" />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Ikon</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {ICONS.map((icon) => (
                <Box
                  key={icon}
                  onClick={() => setForm({ ...form, icon })}
                  sx={{
                    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', borderRadius: 1, fontSize: '1.2rem',
                    border: form.icon === icon ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    bgcolor: form.icon === icon ? 'rgba(37,99,235,0.08)' : 'transparent',
                  }}
                >
                  {icon}
                </Box>
              ))}
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Szín</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#ef4444', '#06b6d4', '#6366f1', '#f472b6', '#6b7280'].map((c) => (
                <Box
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  sx={{
                    width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                    border: form.color === c ? '3px solid #1e293b' : '2px solid transparent',
                    transition: 'border 0.15s',
                  }}
                />
              ))}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
          {saving ? <CircularProgress size={22} /> : editData ? 'Mentés' : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// MOVE DIALOG
// ============================================

function MoveDialog({ open, onClose, costCenter, parentOptions, onMove }) {
  const [newParentId, setNewParentId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setNewParentId(''); }, [open]);

  const handleMove = async () => {
    setSaving(true);
    try {
      await onMove(costCenter.id, newParentId || null);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba az áthelyezés során');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Költséghely áthelyezése: {costCenter?.name}</DialogTitle>
      <DialogContent>
        <FormControl fullWidth size="small" sx={{ mt: 2 }}>
          <InputLabel>Új szülő</InputLabel>
          <Select value={newParentId} onChange={(e) => setNewParentId(e.target.value)} label="Új szülő">
            <MenuItem value="">-- Gyökér szint --</MenuItem>
            {parentOptions.filter((o) => o.id !== costCenter?.id).map((opt) => (
              <MenuItem key={opt.id} value={opt.id}>
                {'  '.repeat((opt.level || 1) - 1)}{opt.icon || '📁'} {opt.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleMove} disabled={saving}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
          {saving ? <CircularProgress size={22} /> : 'Áthelyezés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ============================================
// MAIN PAGE
// ============================================

function CostCenters() {
  const [tree, setTree] = useState([]);
  const [flatList, setFlatList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState(0); // 0=tree, 1=invoices

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Invoices
  const [invoices, setInvoices] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoicePage, setInvoicePage] = useState(0);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [invoiceEdit, setInvoiceEdit] = useState(null);
  const [categories, setCategories] = useState([]);
  const [budgetSummary, setBudgetSummary] = useState(null);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, flatRes] = await Promise.all([
        costCentersAPI.getTree({ is_active: 'true' }),
        costCentersAPI.getAll({ limit: 500 }),
      ]);
      if (treeRes.success) setTree(treeRes.data);
      if (flatRes.success) setFlatList(flatRes.data);
    } catch (error) {
      toast.error('Hiba a költséghelyek betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await costCentersAPI.getInvoiceCategories();
      if (res.success) setCategories(res.data);
    } catch (e) { /* silent */ }
  }, []);

  const loadDetail = useCallback(async (id) => {
    try {
      const res = await costCentersAPI.getById(id);
      if (res.success) setDetail(res.data);
    } catch (e) {
      toast.error('Hiba a részletek betöltésekor');
    }
  }, []);

  const loadInvoices = useCallback(async (costCenterId, page = 0) => {
    setInvoiceLoading(true);
    try {
      const params = { page: page + 1, limit: 20 };
      if (costCenterId) params.cost_center_id = costCenterId;
      const res = await costCentersAPI.getInvoices(params);
      if (res.success) {
        setInvoices(res.data);
        setInvoiceTotal(res.pagination.total);
      }
    } catch (e) {
      toast.error('Hiba a számlák betöltésekor');
    } finally {
      setInvoiceLoading(false);
    }
  }, []);

  const loadBudgetSummary = useCallback(async (id) => {
    try {
      const res = await costCentersAPI.getBudgetSummary(id);
      if (res.success) setBudgetSummary(res.data);
    } catch (e) { setBudgetSummary(null); }
  }, []);

  useEffect(() => { loadTree(); loadCategories(); }, [loadTree, loadCategories]);

  useEffect(() => {
    if (selected) {
      loadDetail(selected.id);
      loadBudgetSummary(selected.id);
      if (tab === 1) loadInvoices(selected.id, 0);
    } else {
      setDetail(null);
      setBudgetSummary(null);
      if (tab === 1) loadInvoices(null, 0);
    }
  }, [selected, loadDetail, loadBudgetSummary, loadInvoices, tab]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleToggle = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const ids = new Set();
    const collect = (nodes) => nodes.forEach((n) => { ids.add(n.id); if (n.children) collect(n.children); });
    collect(tree);
    setExpandedIds(ids);
  };

  const collapseAll = () => setExpandedIds(new Set());

  const handleSelect = (node, showInvoices = false) => {
    setSelected(node);
    setInvoicePage(0);
    if (showInvoices) setTab(1);
  };

  const handleCreate = () => { setEditData(null); setFormOpen(true); };

  const handleEdit = () => {
    if (detail) { setEditData(detail); setFormOpen(true); }
  };

  const handleSave = async (data) => {
    if (editData) {
      const res = await costCentersAPI.update(editData.id, data);
      if (res.success) { toast.success(res.message); loadTree(); if (selected) loadDetail(selected.id); }
    } else {
      const res = await costCentersAPI.create(data);
      if (res.success) { toast.success(res.message); loadTree(); }
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await costCentersAPI.delete(deleteConfirm.id);
      if (res.success) {
        toast.success(res.message);
        if (selected?.id === deleteConfirm.id) { setSelected(null); setDetail(null); }
        loadTree();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a törlés során');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleMove = async (id, newParentId) => {
    const res = await costCentersAPI.move(id, newParentId);
    if (res.success) { toast.success(res.message); loadTree(); loadDetail(id); }
  };

  const handleInvoiceSave = async (data, file) => {
    let savedInvoice;
    if (invoiceEdit) {
      const res = await costCentersAPI.updateInvoice(invoiceEdit.id, data);
      if (res.success) { toast.success(res.message); savedInvoice = res.data; }
    } else {
      const res = await costCentersAPI.createInvoice(data);
      if (res.success) { toast.success(res.message); savedInvoice = res.data; }
    }

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

    loadInvoices(selected?.id, invoicePage);
    if (selected) { loadBudgetSummary(selected.id); loadTree(); }
  };

  const handleInvoiceDelete = async (id) => {
    if (!window.confirm('Biztosan törölni szeretnéd ezt a számlát?')) return;
    try {
      const res = await costCentersAPI.deleteInvoice(id);
      if (res.success) { toast.success(res.message); loadInvoices(selected?.id, invoicePage); if (selected) loadBudgetSummary(selected.id); }
    } catch (e) {
      toast.error('Hiba a számla törlése során');
    }
  };

  // Filter tree by search
  const filterTree = (nodes, term) => {
    if (!term) return nodes;
    const lower = term.toLowerCase();
    return nodes.reduce((acc, node) => {
      const match = node.name.toLowerCase().includes(lower) || (node.code && node.code.toLowerCase().includes(lower));
      const filteredChildren = node.children ? filterTree(node.children, term) : [];
      if (match || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
      }
      return acc;
    }, []);
  };

  const displayTree = filterTree(tree, search);

  const formatCurrency = (val) => {
    if (!val && val !== 0) return '-';
    return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(val);
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Költségközpontok</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
            Új költséghely
          </Button>
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', gap: 3, minHeight: 'calc(100vh - 200px)' }}>
        {/* LEFT: Tree panel */}
        <Paper sx={{ width: 360, minWidth: 360, p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid #e5e7eb' }}>
            <TextField
              fullWidth size="small" placeholder="Keresés..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <Button size="small" onClick={expandAll}>Mindent kinyit</Button>
              <Button size="small" onClick={collapseAll}>Mindent bezár</Button>
            </Stack>
          </Box>

          <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : displayTree.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
                {search ? 'Nincs találat' : 'Nincs költséghely'}
              </Typography>
            ) : (
              displayTree.map((node) => (
                <TreeNode
                  key={node.id} node={node} selectedId={selected?.id}
                  onSelect={handleSelect} expandedIds={expandedIds} onToggle={handleToggle}
                />
              ))
            )}
          </Box>
        </Paper>

        {/* RIGHT: Detail panel */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {!selected ? (
            <Paper sx={{ p: 5, textAlign: 'center' }}>
              <TreeIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">Válassz egy költséghelyet a bal oldali fából</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {flatList.length} költséghely, {tree.length} gyökér szinttel
              </Typography>
            </Paper>
          ) : (
            <>
              {/* Breadcrumb */}
              {detail?.ancestors && (
                <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
                  <Link underline="hover" color="text.secondary" sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    onClick={() => setSelected(null)}>
                    <HomeIcon fontSize="small" sx={{ mr: 0.5 }} /> Gyökér
                  </Link>
                  {detail.ancestors.map((a) => (
                    <Link key={a.id} underline="hover" color="text.secondary" sx={{ cursor: 'pointer' }}
                      onClick={() => { const node = flatList.find((n) => n.id === a.id); if (node) handleSelect(node); }}>
                      {a.name}
                    </Link>
                  ))}
                  <Typography color="text.primary" sx={{ fontWeight: 600 }}>{detail.name}</Typography>
                </Breadcrumbs>
              )}

              {/* Detail header */}
              <Paper sx={{ p: 3, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: detail?.color || '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                      {detail?.icon || '📁'}
                    </Box>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>{detail?.name}</Typography>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        {detail?.code && <Chip label={detail.code} size="small" variant="outlined" />}
                        <Chip label={`Szint ${detail?.level}`} size="small" color="primary" variant="outlined" />
                        {detail?.children?.length > 0 && <Chip label={`${detail.children.length} gyerek`} size="small" />}
                      </Stack>
                    </Box>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Tooltip title="Szerkesztés"><IconButton onClick={handleEdit}><EditIcon /></IconButton></Tooltip>
                    <Tooltip title="Áthelyezés"><IconButton onClick={() => { setMoveTarget(detail); setMoveOpen(true); }}><MoveIcon /></IconButton></Tooltip>
                    <Tooltip title="Törlés"><IconButton onClick={() => setDeleteConfirm(detail)} color="error"><DeleteIcon /></IconButton></Tooltip>
                  </Stack>
                </Box>
                {detail?.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{detail.description}</Typography>
                )}

                {/* Invoice summary badges */}
                {detail?.summary && detail.summary.totalInvoices > 0 && (
                  <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Chip
                      icon={<InvoiceIcon />}
                      label={`${detail.summary.totalInvoices} számla`}
                      variant="outlined"
                      size="small"
                    />
                    <Tooltip title={`Nettó: ${formatCurrency(detail.summary.totalNetAmount)}\nÁFA: ${formatCurrency(detail.summary.totalVatAmount)}\nBruttó: ${formatCurrency(detail.summary.totalGrossAmount)}`}>
                      <Chip
                        label={`Bruttó: ${formatCurrency(detail.summary.totalGrossAmount)}`}
                        size="small"
                        sx={{
                          fontWeight: 600,
                          bgcolor: `${getAmountColor(detail.summary.totalGrossAmount)}18`,
                          color: getAmountColor(detail.summary.totalGrossAmount),
                          border: `1px solid ${getAmountColor(detail.summary.totalGrossAmount)}40`,
                        }}
                      />
                    </Tooltip>
                    {detail.summary.firstInvoiceDate && (
                      <Chip
                        label={`${new Date(detail.summary.firstInvoiceDate).toLocaleDateString('hu-HU')} - ${new Date(detail.summary.lastInvoiceDate).toLocaleDateString('hu-HU')}`}
                        variant="outlined"
                        size="small"
                        color="info"
                      />
                    )}
                  </Box>
                )}

                {/* Budget summary */}
                {budgetSummary && (
                  <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                    <Stack direction="row" spacing={4} flexWrap="wrap">
                      <Box>
                        <Typography variant="caption" color="text.secondary">Költségkeret</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCurrency(budgetSummary.budget)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Felhasznált</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: budgetSummary.total_spent > budgetSummary.budget && budgetSummary.budget > 0 ? '#ef4444' : '#10b981' }}>
                          {formatCurrency(budgetSummary.total_spent)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Fennmaradó</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{formatCurrency(budgetSummary.remaining)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Számlák</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>{budgetSummary.total_invoices}</Typography>
                      </Box>
                    </Stack>
                    {budgetSummary.budget > 0 && budgetSummary.utilization_percent !== null && (
                      <Box sx={{ mt: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption">Felhasználtság</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>{budgetSummary.utilization_percent}%</Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(budgetSummary.utilization_percent, 100)}
                          sx={{
                            height: 8, borderRadius: 4,
                            bgcolor: '#e5e7eb',
                            '& .MuiLinearProgress-bar': {
                              bgcolor: budgetSummary.utilization_percent > 90 ? '#ef4444' : budgetSummary.utilization_percent > 70 ? '#f59e0b' : '#10b981',
                              borderRadius: 4,
                            },
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                )}
              </Paper>

              {/* Tabs: Children / Invoices */}
              <Paper sx={{ overflow: 'hidden' }}>
                <Tabs value={tab} onChange={(_, v) => { setTab(v); setInvoicePage(0); }} sx={{ borderBottom: '1px solid #e5e7eb' }}>
                  <Tab label={`Gyerek elemek (${detail?.children?.length || 0})`} icon={<TreeIcon />} iconPosition="start" />
                  <Tab label={`Számlák (${budgetSummary?.total_invoices || 0})`} icon={<InvoiceIcon />} iconPosition="start" />
                </Tabs>

                {/* Tab 0: Children list */}
                {tab === 0 && (
                  <Box sx={{ p: 2 }}>
                    {detail?.children?.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                        Nincs al-költséghely
                      </Typography>
                    ) : (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>Ikon</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Kód</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Számlák</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {detail?.children?.map((child) => {
                            const childNode = flatList.find((n) => n.id === child.id);
                            const childSummary = childNode?.summary;
                            return (
                              <TableRow key={child.id} hover sx={{ cursor: 'pointer' }}
                                onClick={() => { if (childNode) handleSelect(childNode); }}>
                                <TableCell>{child.icon || '📁'}</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>{child.name}</TableCell>
                                <TableCell><Chip label={child.code || '-'} size="small" variant="outlined" /></TableCell>
                                <TableCell>
                                  {childSummary && childSummary.totalInvoices > 0 ? (
                                    <Tooltip title={`Nettó: ${new Intl.NumberFormat('hu-HU').format(childSummary.totalNetAmount)} Ft\nÁFA: ${new Intl.NumberFormat('hu-HU').format(childSummary.totalVatAmount)} Ft\nBruttó: ${new Intl.NumberFormat('hu-HU').format(childSummary.totalGrossAmount)} Ft`}>
                                      <Chip
                                        label={`${childSummary.totalInvoices} | ${formatCompactAmount(childSummary.totalGrossAmount)}`}
                                        size="small"
                                        sx={{
                                          fontWeight: 600, fontSize: '0.7rem',
                                          bgcolor: `${getAmountColor(childSummary.totalGrossAmount)}18`,
                                          color: getAmountColor(childSummary.totalGrossAmount),
                                          border: `1px solid ${getAmountColor(childSummary.totalGrossAmount)}40`,
                                        }}
                                      />
                                    </Tooltip>
                                  ) : (
                                    <Typography variant="caption" color="text.secondary">-</Typography>
                                  )}
                                </TableCell>
                                <TableCell><Chip label={child.is_active ? 'Aktív' : 'Inaktív'} size="small" color={child.is_active ? 'success' : 'default'} /></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </Box>
                )}

                {/* Tab 1: Invoices */}
                {tab === 1 && (
                  <Box>
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Számlák ({selected?.name} + al-költséghelyek)
                      </Typography>
                      <Button size="small" variant="contained" startIcon={<AddIcon />}
                        onClick={() => { setInvoiceEdit(null); setInvoiceFormOpen(true); }}
                        sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}>
                        Új számla
                      </Button>
                    </Box>

                    {invoiceLoading ? (
                      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                    ) : invoices.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>Nincs számla</Typography>
                    ) : (
                      <>
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 600 }}>Számlaszám</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Szállító</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Költséghely</TableCell>
                                <TableCell sx={{ fontWeight: 600 }} align="right">Összeg</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Dátum</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                                <TableCell />
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {invoices.map((inv) => (
                                <TableRow key={inv.id} hover>
                                  <TableCell sx={{ fontWeight: 500 }}>{inv.invoice_number || '-'}</TableCell>
                                  <TableCell>{inv.vendor_name || '-'}</TableCell>
                                  <TableCell>
                                    <Chip label={`${inv.cost_center_icon || '📁'} ${inv.cost_center_code || inv.cost_center_name}`} size="small" variant="outlined" />
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(inv.total_amount)}</TableCell>
                                  <TableCell>{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('hu-HU') : '-'}</TableCell>
                                  <TableCell>
                                    <Chip
                                      label={PAYMENT_STATUSES[inv.payment_status]?.label || inv.payment_status}
                                      size="small"
                                      color={PAYMENT_STATUSES[inv.payment_status]?.color || 'default'}
                                    />
                                  </TableCell>
                                  <TableCell>{inv.category_icon} {inv.category_name || '-'}</TableCell>
                                  <TableCell>
                                    <Stack direction="row" spacing={0.5}>
                                      <Tooltip title="Szerkesztés">
                                        <IconButton size="small" onClick={() => { setInvoiceEdit(inv); setInvoiceFormOpen(true); }}><EditIcon fontSize="small" /></IconButton>
                                      </Tooltip>
                                      <Tooltip title="Törlés">
                                        <IconButton size="small" color="error" onClick={() => handleInvoiceDelete(inv.id)}><DeleteIcon fontSize="small" /></IconButton>
                                      </Tooltip>
                                    </Stack>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        <TablePagination
                          component="div" count={invoiceTotal} page={invoicePage}
                          onPageChange={(_, p) => { setInvoicePage(p); loadInvoices(selected?.id, p); }}
                          rowsPerPage={20} rowsPerPageOptions={[20]}
                          labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
                        />
                      </>
                    )}
                  </Box>
                )}
              </Paper>
            </>
          )}
        </Box>
      </Box>

      {/* Dialogs */}
      <CostCenterFormDialog
        open={formOpen} onClose={() => setFormOpen(false)}
        onSave={handleSave} editData={editData} parentOptions={flatList}
      />

      <MoveDialog
        open={moveOpen} onClose={() => setMoveOpen(false)}
        costCenter={moveTarget} parentOptions={flatList} onMove={handleMove}
      />

      <InvoiceFormModal
        open={invoiceFormOpen} onClose={() => setInvoiceFormOpen(false)}
        onSave={handleInvoiceSave} editData={invoiceEdit}
        costCenters={flatList} costCenterTree={tree} categories={categories}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Költséghely törlése</DialogTitle>
        <DialogContent>
          <Typography>Biztosan törölni szeretnéd a(z) <strong>{deleteConfirm?.name}</strong> költséghelyet?</Typography>
          {deleteConfirm?.children?.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Ennek a költséghelynek {deleteConfirm.children.length} al-költséghelye van. Először azokat kell törölni vagy áthelyezni.
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

export default CostCenters;
