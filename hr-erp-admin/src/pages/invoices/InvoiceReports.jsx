import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Paper, Typography, Button, Stack, TextField, InputAdornment,
  CircularProgress, Chip, IconButton, Tooltip, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TableSortLabel, MenuItem, Select, FormControl, InputLabel,
  Autocomplete, Checkbox, Collapse, Radio, RadioGroup, FormControlLabel,
  FormLabel, LinearProgress, Skeleton, Divider, Alert,
} from '@mui/material';
import {
  Search as SearchIcon, Assessment as ReportIcon,
  FileDownload as ExcelIcon, PictureAsPdf as PdfIcon,
  TableChart as CsvIcon, ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon, BarChart as BarChartIcon,
  Receipt as ReceiptIcon, AccountTree as TreeIcon,
  TrendingUp as TrendingUpIcon, Category as CategoryIcon,
  Store as VendorIcon, CalendarMonth as CalendarIcon,
  Refresh as RefreshIcon, FilterList as FilterIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { costCentersAPI, invoiceReportsAPI } from '../../services/api';
import { toast } from 'react-toastify';

// ============================================
// CONSTANTS
// ============================================

const PAYMENT_STATUSES = {
  pending: { label: 'Függőben', color: 'warning' },
  paid: { label: 'Fizetve', color: 'success' },
  overdue: { label: 'Lejárt', color: 'error' },
  cancelled: { label: 'Sztornó', color: 'default' },
};

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Napi' },
  { value: 'week', label: 'Heti' },
  { value: 'month', label: 'Havi' },
  { value: 'quarter', label: 'Negyedéves' },
];

const CHART_COLORS = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#4f46e5', '#c026d3', '#d97706', '#059669',
  '#6366f1', '#ec4899', '#f97316', '#14b8a6', '#8b5cf6',
];

const formatCurrency = (val, currency = 'HUF') => {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('hu-HU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(val);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('hu-HU');
};

const formatNumber = (val) => {
  if (!val && val !== 0) return '-';
  return new Intl.NumberFormat('hu-HU').format(val);
};

// ============================================
// STAT CARD
// ============================================

function StatCard({ title, value, subtitle, color, icon, loading }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 160 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {loading ? (
          <Box>
            <Skeleton width="60%" height={16} />
            <Skeleton width="80%" height={32} sx={{ mt: 0.5 }} />
            <Skeleton width="40%" height={14} sx={{ mt: 0.5 }} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">{title}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: color || 'text.primary' }}>{value}</Typography>
              {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
            </Box>
            {icon && <Box sx={{ color: color || '#94a3b8', mt: 0.5 }}>{icon}</Box>}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// COST CENTER TREE HELPERS
// ============================================

function flattenTree(nodes, list = []) {
  if (!nodes) return list;
  nodes.forEach((n) => {
    list.push(n);
    if (n.children) flattenTree(n.children, list);
  });
  return list;
}

function collectAllIds(nodes) {
  const ids = new Set();
  const walk = (list) => list.forEach((n) => { ids.add(n.id); if (n.children) walk(n.children); });
  walk(nodes || []);
  return ids;
}

// ============================================
// COST CENTER MULTI-SELECT TREE
// ============================================

function CostCenterMultiSelect({ costCenterTree, selectedIds, onChange }) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [search, setSearch] = useState('');

  const filterTree = useCallback((nodes, term) => {
    if (!term) return nodes;
    const lower = term.toLowerCase();
    return (nodes || []).reduce((acc, node) => {
      const match = node.name.toLowerCase().includes(lower) || (node.code && node.code.toLowerCase().includes(lower));
      const filteredChildren = node.children ? filterTree(node.children, term) : [];
      if (match || filteredChildren.length > 0) {
        acc.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
      }
      return acc;
    }, []);
  }, []);

  const displayTree = useMemo(() => filterTree(costCenterTree, search), [costCenterTree, search, filterTree]);
  const effectiveExpanded = useMemo(() => {
    if (search) return collectAllIds(displayTree);
    return expandedIds;
  }, [search, displayTree, expandedIds]);

  const handleToggle = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCheck = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const renderNode = (node, level = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = effectiveExpanded.has(node.id);
    const isChecked = selectedIds.has(node.id);

    return (
      <React.Fragment key={node.id}>
        <Box sx={{
          display: 'flex', alignItems: 'center', py: 0.3, pl: 1 + level * 2,
          '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' }, borderRadius: 1,
        }}>
          {hasChildren ? (
            <IconButton size="small" onClick={() => handleToggle(node.id)} sx={{ p: 0.25, mr: 0.25 }}>
              {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          ) : <Box sx={{ width: 24, mr: 0.25 }} />}
          <Checkbox size="small" checked={isChecked} onChange={() => handleCheck(node.id)} sx={{ p: 0.25 }} />
          <Typography variant="body2" sx={{ fontSize: '0.8rem', ml: 0.5 }}>
            {node.icon || '📁'} {node.name}
          </Typography>
        </Box>
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, level + 1))}
      </React.Fragment>
    );
  };

  return (
    <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}>
      <Box sx={{ p: 1, borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, bgcolor: 'white', zIndex: 1 }}>
        <TextField
          fullWidth size="small" placeholder="Költséghely keresés..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16 }} /></InputAdornment>,
            sx: { fontSize: '0.8rem' },
          }}
        />
      </Box>
      <Box sx={{ p: 0.5 }}>
        {displayTree.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center', fontSize: '0.8rem' }}>
            Nincs találat
          </Typography>
        ) : displayTree.map((node) => renderNode(node))}
      </Box>
    </Paper>
  );
}

// ============================================
// HIERARCHICAL COST CENTER REPORT TABLE
// ============================================

function CostCenterReportTree({ data }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  useEffect(() => {
    // Auto-expand top level
    if (data && data.length > 0) {
      setExpandedIds(new Set(data.map((n) => n.id)));
    }
  }, [data]);

  const handleToggle = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderRow = (node, level = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isParent = hasChildren;
    const indent = level * 24;

    return (
      <React.Fragment key={node.id}>
        <TableRow
          hover
          sx={{
            bgcolor: level === 0 ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
            '& td': { fontWeight: isParent ? 600 : 400 },
          }}
        >
          <TableCell sx={{ pl: `${16 + indent}px`, whiteSpace: 'nowrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {hasChildren ? (
                <IconButton size="small" onClick={() => handleToggle(node.id)} sx={{ p: 0.25, mr: 0.5 }}>
                  {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 18 }} /> : <ChevronRightIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              ) : (
                <Box sx={{ width: 28, mr: 0.5 }}>
                  {level > 0 && (
                    <Typography component="span" sx={{ color: '#cbd5e1', fontSize: '0.8rem', ml: 0.5 }}>
                      {level === 1 ? '├─' : '├─'}
                    </Typography>
                  )}
                </Box>
              )}
              <Typography variant="body2" sx={{ fontWeight: isParent ? 600 : 400, fontSize: '0.85rem' }}>
                {node.icon || '📁'} {node.name}
              </Typography>
            </Box>
          </TableCell>
          <TableCell align="right">
            <Typography variant="body2" sx={{ fontWeight: isParent ? 600 : 400, fontSize: '0.85rem' }}>
              {node.invoiceCount || 0} db
            </Typography>
          </TableCell>
          <TableCell align="right">
            <Typography variant="body2" sx={{ fontWeight: isParent ? 600 : 400, fontSize: '0.85rem' }}>
              {formatCurrency(node.netAmount)}
            </Typography>
          </TableCell>
          <TableCell align="right">
            <Typography variant="body2" sx={{ fontWeight: isParent ? 600 : 400, fontSize: '0.85rem' }}>
              {formatCurrency(node.vatAmount)}
            </Typography>
          </TableCell>
          <TableCell align="right">
            <Typography variant="body2" sx={{ fontWeight: isParent ? 600 : 400, fontSize: '0.85rem' }}>
              {formatCurrency(node.grossAmount)}
            </Typography>
          </TableCell>
        </TableRow>
        {hasChildren && isExpanded && node.children.map((child) => renderRow(child, level + 1))}
      </React.Fragment>
    );
  };

  if (!data || data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        Nincs adat a kiválasztott szűrőkhöz
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8fafc' }}>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Költséghely</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Számla db</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Nettó</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ÁFA</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Bruttó</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((node) => renderRow(node))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================
// VENDOR SUMMARY TABLE WITH INLINE BARS
// ============================================

function VendorSummaryTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        Nincs adat
      </Typography>
    );
  }

  const maxGross = Math.max(...data.map((v) => v.grossAmount || 0));

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8fafc' }}>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>#</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Szállító</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Számla db</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Nettó</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ÁFA</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Bruttó</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem', width: 100 }}>Részesedés</TableCell>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem', minWidth: 150 }}></TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((vendor, idx) => {
            const pct = maxGross > 0 ? ((vendor.grossAmount / maxGross) * 100) : 0;
            return (
              <TableRow key={vendor.vendorName || idx} hover>
                <TableCell sx={{ fontSize: '0.85rem', color: '#94a3b8' }}>{idx + 1}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{vendor.vendorName}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{vendor.invoiceCount} db</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(vendor.netAmount)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(vendor.vatAmount)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatCurrency(vendor.grossAmount)}</TableCell>
                <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{vendor.percentage?.toFixed(1) || '0.0'}%</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{
                      height: 12, width: `${pct}%`, minWidth: 4,
                      bgcolor: CHART_COLORS[idx % CHART_COLORS.length],
                      borderRadius: 1, transition: 'width 0.5s ease',
                    }} />
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================
// CATEGORY SUMMARY TABLE
// ============================================

function CategorySummaryTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        Nincs adat
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8fafc' }}>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Kategória</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Számla db</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Nettó</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ÁFA</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Bruttó</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((cat, idx) => (
            <TableRow key={cat.categoryId || idx} hover>
              <TableCell>
                <Chip
                  label={cat.categoryName || 'Nincs kategória'}
                  size="small"
                  sx={{
                    bgcolor: `${CHART_COLORS[idx % CHART_COLORS.length]}18`,
                    color: CHART_COLORS[idx % CHART_COLORS.length],
                    fontWeight: 500, fontSize: '0.8rem',
                  }}
                />
              </TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{cat.invoiceCount} db</TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(cat.netAmount)}</TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(cat.vatAmount)}</TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatCurrency(cat.grossAmount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================
// PERIOD BREAKDOWN TABLE
// ============================================

function PeriodBreakdownTable({ data, groupBy }) {
  if (!data || data.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        Nincs adat
      </Typography>
    );
  }

  const periodLabel = {
    day: 'Nap', week: 'Hét', month: 'Hónap', quarter: 'Negyedév',
  }[groupBy] || 'Időszak';

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8fafc' }}>
            <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{periodLabel}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Számla db</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Nettó</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>ÁFA</TableCell>
            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Bruttó</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((period, idx) => (
            <TableRow key={period.period || idx} hover>
              <TableCell sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{period.periodLabel || period.period}</TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{period.invoiceCount} db</TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(period.netAmount)}</TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(period.vatAmount)}</TableCell>
              <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatCurrency(period.grossAmount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ============================================
// CUSTOM TOOLTIP FOR CHARTS
// ============================================

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <Paper sx={{ p: 1.5, boxShadow: 3 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{label}</Typography>
      {payload.map((entry, idx) => (
        <Typography key={idx} variant="caption" sx={{ display: 'block', color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)}
        </Typography>
      ))}
    </Paper>
  );
}

// ============================================
// SECTION WRAPPER
// ============================================

function ReportSection({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box
        onClick={() => setOpen(!open)}
        sx={{
          display: 'flex', alignItems: 'center', px: 2, py: 1.5,
          cursor: 'pointer', bgcolor: '#f8fafc',
          '&:hover': { bgcolor: '#f1f5f9' },
          borderBottom: open ? '1px solid #e2e8f0' : 'none',
        }}
      >
        {icon}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, ml: 1, flex: 1, fontSize: '0.95rem' }}>
          {title}
        </Typography>
        {open ? <ExpandMoreIcon /> : <ChevronRightIcon />}
      </Box>
      <Collapse in={open}>
        <Box>{children}</Box>
      </Collapse>
    </Paper>
  );
}

// ============================================
// MAIN PAGE
// ============================================

export default function InvoiceReports() {
  // Filter state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().substring(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [selectedCostCenters, setSelectedCostCenters] = useState(new Set());
  const [selectedVendors, setSelectedVendors] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [groupBy, setGroupBy] = useState('month');

  // Data state
  const [costCenterTree, setCostCenterTree] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);

  // Report state
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'xlsx' | 'pdf' | 'csv' | null
  const [generated, setGenerated] = useState(false);

  // Table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [orderBy, setOrderBy] = useState('invoice_date');
  const [order, setOrder] = useState('desc');

  // Load initial data (cost centers, categories, vendors)
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [treeRes, allRes, catRes] = await Promise.all([
          costCentersAPI.getTree({ is_active: 'true' }),
          costCentersAPI.getAll({ limit: 500 }),
          costCentersAPI.getInvoiceCategories(),
        ]);
        setCostCenterTree(treeRes?.data || []);
        setCostCenters(allRes?.data || []);
        setCategories(catRes?.data || []);

        // Load distinct vendors from all invoices
        try {
          const invRes = await costCentersAPI.getInvoices({ limit: 1000, fields: 'vendor_name' });
          const invList = invRes?.data || [];
          const uniqueVendors = [...new Set(invList.map((i) => i.vendor_name).filter(Boolean))].sort();
          setVendors(uniqueVendors);
        } catch {
          // Vendors will be empty, that's ok
        }
      } catch (err) {
        toast.error('Hiba az adatok betöltésekor');
      }
    };
    loadInitialData();
  }, []);

  // Build filters object
  const buildFilters = useCallback(() => ({
    startDate,
    endDate,
    costCenterIds: [...selectedCostCenters],
    vendorNames: selectedVendors,
    categoryIds: selectedCategories,
    paymentStatus: selectedStatuses,
    groupBy,
  }), [startDate, endDate, selectedCostCenters, selectedVendors, selectedCategories, selectedStatuses, groupBy]);

  // Generate report
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setGenerated(false);
    setPage(0);
    try {
      const filters = buildFilters();
      const res = await invoiceReportsAPI.generate(filters);
      setReportData(res?.data || res);
      setGenerated(true);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Hiba a riport generálásánál';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [buildFilters]);

  // Export handler
  const handleExport = useCallback(async (format) => {
    setExporting(format);
    try {
      const filters = buildFilters();
      const response = await invoiceReportsAPI.export(filters, format);

      // Handle blob download
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      const contentDisposition = response.headers?.['content-disposition'];
      let filename = `szamla_riport_${startDate}_${endDate}.${format === 'xlsx' ? 'xlsx' : format === 'pdf' ? 'pdf' : 'csv'}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) filename = match[1].replace(/['"]/g, '');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} sikeresen letöltve`);
    } catch (err) {
      let msg = 'Hiba az exportálásnál';
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          msg = json.message || msg;
        } catch { /* ignore */ }
      }
      toast.error(msg);
    } finally {
      setExporting(null);
    }
  }, [buildFilters, startDate, endDate]);

  // Clear filters
  const handleClearFilters = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    setStartDate(d.toISOString().substring(0, 10));
    setEndDate(new Date().toISOString().substring(0, 10));
    setSelectedCostCenters(new Set());
    setSelectedVendors([]);
    setSelectedCategories([]);
    setSelectedStatuses([]);
    setGroupBy('month');
  };

  // Sorting
  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  // Sort invoices
  const sortedInvoices = useMemo(() => {
    const invoices = reportData?.invoices || [];
    return [...invoices].sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [reportData?.invoices, orderBy, order]);

  const paginatedInvoices = useMemo(() =>
    sortedInvoices.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sortedInvoices, page, rowsPerPage]
  );

  // Summary data
  const summary = reportData?.summary || {};
  const byCostCenter = reportData?.byCostCenter || [];
  const byVendor = reportData?.byVendor || [];
  const byCategory = reportData?.byCategory || [];
  const byPeriod = reportData?.byPeriod || [];

  // Chart data
  const costCenterChartData = useMemo(() =>
    byCostCenter.map((n) => ({ name: n.name, Bruttó: n.grossAmount || 0, Nettó: n.netAmount || 0 })),
    [byCostCenter]
  );

  const categoryChartData = useMemo(() =>
    byCategory.map((c) => ({ name: c.categoryName || 'N/A', value: c.grossAmount || 0 })),
    [byCategory]
  );

  const periodChartData = useMemo(() =>
    byPeriod.map((p) => ({
      name: p.periodLabel || p.period,
      Bruttó: p.grossAmount || 0,
      Nettó: p.netAmount || 0,
      ÁFA: p.vatAmount || 0,
    })),
    [byPeriod]
  );

  const cumulativeChartData = useMemo(() => {
    let cumNet = 0, cumGross = 0;
    return byPeriod.map((p) => {
      cumNet += p.netAmount || 0;
      cumGross += p.grossAmount || 0;
      return { name: p.periodLabel || p.period, 'Kumulált nettó': cumNet, 'Kumulált bruttó': cumGross };
    });
  }, [byPeriod]);

  const hasActiveFilters = selectedCostCenters.size > 0 || selectedVendors.length > 0 ||
    selectedCategories.length > 0 || selectedStatuses.length > 0;

  return (
    <Box>
      {/* ============================================ */}
      {/* HEADER */}
      {/* ============================================ */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReportIcon sx={{ fontSize: 32, color: '#2563eb' }} />
            Számlariportok
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Átfogó számla elemzés, összesítések és exportálás
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Tooltip title="Excel letöltés">
            <span>
              <Button
                variant="outlined" size="small"
                startIcon={exporting === 'xlsx' ? <CircularProgress size={16} /> : <ExcelIcon />}
                onClick={() => handleExport('xlsx')}
                disabled={!generated || !!exporting}
                sx={{ color: '#16a34a', borderColor: '#16a34a', '&:hover': { borderColor: '#15803d', bgcolor: '#f0fdf4' } }}
              >
                Excel
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="PDF letöltés">
            <span>
              <Button
                variant="outlined" size="small"
                startIcon={exporting === 'pdf' ? <CircularProgress size={16} /> : <PdfIcon />}
                onClick={() => handleExport('pdf')}
                disabled={!generated || !!exporting}
                sx={{ color: '#dc2626', borderColor: '#dc2626', '&:hover': { borderColor: '#b91c1c', bgcolor: '#fef2f2' } }}
              >
                PDF
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="CSV letöltés">
            <span>
              <Button
                variant="outlined" size="small"
                startIcon={exporting === 'csv' ? <CircularProgress size={16} /> : <CsvIcon />}
                onClick={() => handleExport('csv')}
                disabled={!generated || !!exporting}
                sx={{ color: '#2563eb', borderColor: '#2563eb', '&:hover': { borderColor: '#1d4ed8', bgcolor: '#eff6ff' } }}
              >
                CSV
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {/* ============================================ */}
      {/* FILTERS */}
      {/* ============================================ */}
      <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <FilterIcon sx={{ color: '#64748b', mr: 1 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>Szűrők</Typography>
          {hasActiveFilters && (
            <Button size="small" startIcon={<ClearIcon />} onClick={handleClearFilters} color="inherit">
              Szűrők törlése
            </Button>
          )}
        </Box>

        <Stack spacing={2.5}>
          {/* Row 1: Date range + Period */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
            <TextField
              label="Kezdő dátum"
              type="date"
              size="small"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 180 }}
            />
            <TextField
              label="Záró dátum"
              type="date"
              size="small"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 180 }}
            />
            <Box>
              <FormLabel sx={{ fontSize: '0.75rem', mb: 0.5, display: 'block' }}>Időszak bontás</FormLabel>
              <RadioGroup row value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {PERIOD_OPTIONS.map((opt) => (
                  <FormControlLabel
                    key={opt.value} value={opt.value}
                    control={<Radio size="small" />}
                    label={<Typography variant="body2" sx={{ fontSize: '0.8rem' }}>{opt.label}</Typography>}
                    sx={{ mr: 2 }}
                  />
                ))}
              </RadioGroup>
            </Box>
          </Stack>

          {/* Row 2: Vendor + Category + Status */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Autocomplete
              multiple
              size="small"
              options={vendors}
              value={selectedVendors}
              onChange={(_, val) => setSelectedVendors(val)}
              renderInput={(params) => <TextField {...params} label="Szállító" placeholder="Keresés..." />}
              sx={{ minWidth: 250, flex: 1 }}
              limitTags={2}
              disableCloseOnSelect
              renderOption={(props, option, { selected }) => (
                <li {...props}>
                  <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0 }} />
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>{option}</Typography>
                </li>
              )}
            />
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Kategória</InputLabel>
              <Select
                multiple
                value={selectedCategories}
                onChange={(e) => setSelectedCategories(e.target.value)}
                label="Kategória"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((id) => {
                      const cat = categories.find((c) => c.id === id);
                      return <Chip key={id} label={cat?.name || id} size="small" sx={{ height: 22, fontSize: '0.75rem' }} />;
                    })}
                  </Box>
                )}
              >
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>
                    <Checkbox size="small" checked={selectedCategories.includes(cat.id)} sx={{ p: 0, mr: 1 }} />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>{cat.icon || ''} {cat.name}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Fizetési státusz</InputLabel>
              <Select
                multiple
                value={selectedStatuses}
                onChange={(e) => setSelectedStatuses(e.target.value)}
                label="Fizetési státusz"
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((s) => (
                      <Chip key={s} label={PAYMENT_STATUSES[s]?.label || s} size="small" color={PAYMENT_STATUSES[s]?.color || 'default'} sx={{ height: 22, fontSize: '0.75rem' }} />
                    ))}
                  </Box>
                )}
              >
                {Object.entries(PAYMENT_STATUSES).map(([key, { label, color }]) => (
                  <MenuItem key={key} value={key}>
                    <Checkbox size="small" checked={selectedStatuses.includes(key)} sx={{ p: 0, mr: 1 }} />
                    <Chip label={label} size="small" color={color} sx={{ height: 22, fontSize: '0.75rem' }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {/* Row 3: Cost Center Tree Multi-Select */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '0.8rem', color: '#64748b' }}>
              Költséghely szűrő {selectedCostCenters.size > 0 && `(${selectedCostCenters.size} kiválasztva)`}
            </Typography>
            <CostCenterMultiSelect
              costCenterTree={costCenterTree}
              selectedIds={selectedCostCenters}
              onChange={setSelectedCostCenters}
            />
          </Box>

          {/* Generate Button */}
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
              onClick={handleGenerate}
              disabled={loading}
              sx={{
                px: 5, py: 1.2, fontSize: '1rem', fontWeight: 600,
                background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                '&:hover': { background: 'linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)' },
              }}
            >
              {loading ? 'Riport generálása...' : 'Riport generálás'}
            </Button>
          </Box>
        </Stack>
      </Paper>

      {/* Loading overlay */}
      {loading && (
        <Paper variant="outlined" sx={{ p: 4, mb: 3, textAlign: 'center' }}>
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Riport generálása...</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Kérjük várjon, az adatok feldolgozása folyamatban van
          </Typography>
          <LinearProgress sx={{ mt: 2, maxWidth: 400, mx: 'auto' }} />
        </Paper>
      )}

      {/* ============================================ */}
      {/* REPORT CONTENT */}
      {/* ============================================ */}
      {generated && !loading && reportData && (
        <Stack spacing={3}>

          {/* SUMMARY CARDS */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}>
            <StatCard
              title="Összes számla"
              value={formatNumber(summary.totalInvoices || 0)}
              subtitle="darabszám"
              color="#2563eb"
              icon={<ReceiptIcon sx={{ fontSize: 32 }} />}
            />
            <StatCard
              title="Nettó összeg"
              value={formatCurrency(summary.totalNet || 0)}
              color="#16a34a"
              icon={<TrendingUpIcon sx={{ fontSize: 32 }} />}
            />
            <StatCard
              title="ÁFA összeg"
              value={formatCurrency(summary.totalVat || 0)}
              color="#d97706"
            />
            <StatCard
              title="Bruttó összeg"
              value={formatCurrency(summary.totalGross || 0)}
              color="#7c3aed"
              icon={<BarChartIcon sx={{ fontSize: 32 }} />}
            />
            <StatCard
              title="Átlagos számla"
              value={formatCurrency(summary.avgInvoice || 0)}
              subtitle="számlánként"
              color="#0891b2"
            />
          </Stack>

          {/* TABLE 1: DETAILED INVOICE LIST */}
          <ReportSection
            title={`Részletes lista (${sortedInvoices.length} számla)`}
            icon={<ReceiptIcon sx={{ color: '#2563eb' }} />}
          >
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {[
                      { id: 'invoice_date', label: 'Dátum' },
                      { id: 'invoice_number', label: 'Számlaszám' },
                      { id: 'vendor_name', label: 'Szállító' },
                      { id: 'cost_center_name', label: 'Költséghely' },
                      { id: 'category_name', label: 'Kategória' },
                      { id: 'amount', label: 'Nettó', align: 'right' },
                      { id: 'vat_amount', label: 'ÁFA', align: 'right' },
                      { id: 'total_amount', label: 'Bruttó', align: 'right' },
                      { id: 'payment_status', label: 'Státusz' },
                    ].map((col) => (
                      <TableCell
                        key={col.id}
                        align={col.align || 'left'}
                        sx={{ fontWeight: 600, fontSize: '0.8rem', bgcolor: '#f8fafc', whiteSpace: 'nowrap' }}
                      >
                        <TableSortLabel
                          active={orderBy === col.id}
                          direction={orderBy === col.id ? order : 'asc'}
                          onClick={() => handleSort(col.id)}
                        >
                          {col.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                        <Typography variant="body2" color="text.secondary">Nincs adat a kiválasztott szűrőkhöz</Typography>
                      </TableCell>
                    </TableRow>
                  ) : paginatedInvoices.map((inv) => {
                    const statusInfo = PAYMENT_STATUSES[inv.payment_status] || {};
                    const isOverdue = inv.payment_status === 'overdue';
                    return (
                      <TableRow
                        key={inv.id}
                        hover
                        sx={{
                          bgcolor: isOverdue ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                          '&:hover': { bgcolor: isOverdue ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.04)' },
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{formatDate(inv.invoice_date)}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{inv.invoice_number || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{inv.vendor_name || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{inv.cost_center_name || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.85rem' }}>{inv.category_name || '-'}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(inv.amount)}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.85rem' }}>{formatCurrency(inv.vat_amount)}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatCurrency(inv.total_amount)}</TableCell>
                        <TableCell>
                          <Chip
                            label={statusInfo.label || inv.payment_status}
                            size="small"
                            color={statusInfo.color || 'default'}
                            sx={{ height: 24, fontSize: '0.75rem' }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={sortedInvoices.length}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50, 100]}
              labelRowsPerPage="Sorok/oldal:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
            />
          </ReportSection>

          {/* TABLE 2: COST CENTER HIERARCHICAL SUMMARY */}
          <ReportSection
            title="Összesítés költséghely szerint (hierarchikus)"
            icon={<TreeIcon sx={{ color: '#7c3aed' }} />}
          >
            <CostCenterReportTree data={byCostCenter} />

            {/* Cost Center Bar Chart */}
            {costCenterChartData.length > 0 && (
              <Box sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontSize: '0.85rem', color: '#64748b' }}>
                  Költséghely összehasonlítás
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={costCenterChartData} margin={{ top: 5, right: 20, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={80} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="Nettó" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Bruttó" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </ReportSection>

          {/* TABLE 3: VENDOR SUMMARY (TOP 10) */}
          <ReportSection
            title={`Összesítés szállító szerint (TOP ${Math.min(byVendor.length, 10)})`}
            icon={<VendorIcon sx={{ color: '#ea580c' }} />}
          >
            <VendorSummaryTable data={byVendor.slice(0, 10)} />
          </ReportSection>

          {/* TABLE 4: CATEGORY SUMMARY */}
          <ReportSection
            title="Összesítés kategória szerint"
            icon={<CategoryIcon sx={{ color: '#db2777' }} />}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={0}>
              <Box sx={{ flex: 1 }}>
                <CategorySummaryTable data={byCategory} />
              </Box>

              {/* Category Pie Chart */}
              {categoryChartData.length > 0 && (
                <Box sx={{ width: { xs: '100%', md: 350 }, p: 2, borderLeft: { md: '1px solid #e2e8f0' } }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                    Kategória megoszlás
                  </Typography>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={categoryChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={40}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={{ strokeWidth: 1 }}
                      >
                        {categoryChartData.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(val) => formatCurrency(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </Stack>
          </ReportSection>

          {/* TABLE 5: PERIOD BREAKDOWN */}
          <ReportSection
            title={`Időszak szerinti bontás (${PERIOD_OPTIONS.find((o) => o.value === groupBy)?.label || groupBy})`}
            icon={<CalendarIcon sx={{ color: '#0891b2' }} />}
          >
            <PeriodBreakdownTable data={byPeriod} groupBy={groupBy} />

            {/* Line Chart: Amount over time */}
            {periodChartData.length > 0 && (
              <Box sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontSize: '0.85rem', color: '#64748b' }}>
                  Időbeli alakulás
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={periodChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Legend />
                    <Line type="monotone" dataKey="Nettó" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Bruttó" stroke="#7c3aed" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="ÁFA" stroke="#d97706" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            )}

            {/* Area Chart: Cumulative spending */}
            {cumulativeChartData.length > 1 && (
              <Box sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontSize: '0.85rem', color: '#64748b' }}>
                  Kumulált költés
                </Typography>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={cumulativeChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Legend />
                    <Area type="monotone" dataKey="Kumulált bruttó" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="Kumulált nettó" stroke="#2563eb" fill="#2563eb" fillOpacity={0.1} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            )}
          </ReportSection>
        </Stack>
      )}

      {/* No report generated yet */}
      {!generated && !loading && (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <ReportIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
            Válassza ki a szűrőket és nyomja meg a "Riport generálás" gombot
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            A riport tartalmazza a részletes számla listát, költséghely és szállító összesítéseket, valamint időszaki bontást
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
