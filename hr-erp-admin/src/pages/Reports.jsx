import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
} from '@mui/material';
import {
  People as PeopleIcon,
  Apartment as ApartmentIcon,
  ConfirmationNumber as ConfirmationNumberIcon,
  Business as BusinessIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import * as XLSX from 'xlsx';
import { reportsAPI } from '../services/api';
import FilterBuilder from '../components/FilterBuilder';

// ============================================================
// Constants
// ============================================================

const REPORT_TYPES = [
  { key: 'employees', label: 'Munkavállalók', icon: PeopleIcon, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { key: 'accommodations', label: 'Szálláshelyek', icon: ApartmentIcon, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  { key: 'tickets', label: 'Hibajegyek', icon: ConfirmationNumberIcon, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { key: 'contractors', label: 'Alvállalkozók', icon: BusinessIcon, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
];

const REPORT_FILTER_FIELDS = {
  employees: [
    { key: 'status', label: 'Státusz', type: 'dynamic' },
    { key: 'workplace', label: 'Munkahely', type: 'dynamic' },
    { key: 'gender', label: 'Nem', type: 'preset' },
    { key: 'visa_expiry', label: 'Vízum lejárat', type: 'preset' },
    { key: 'contract_end', label: 'Szerződés lejárat', type: 'preset' },
    { key: 'marital_status', label: 'Családi állapot', type: 'preset' },
    { key: 'position', label: 'Beosztás', type: 'dynamic' },
    { key: 'country', label: 'Ország', type: 'dynamic' },
    { key: 'birth_year', label: 'Életkor', type: 'preset' },
  ],
  accommodations: [
    { key: 'status', label: 'Állapot', type: 'preset' },
    { key: 'type', label: 'Típus', type: 'preset' },
    { key: 'contractor', label: 'Alvállalkozó', type: 'dynamic' },
  ],
  tickets: [
    { key: 'status', label: 'Státusz', type: 'dynamic' },
    { key: 'category', label: 'Kategória', type: 'dynamic' },
    { key: 'priority', label: 'Prioritás', type: 'dynamic' },
    { key: 'date_range', label: 'Időszak', type: 'preset' },
    { key: 'contractor', label: 'Alvállalkozó', type: 'dynamic' },
  ],
  contractors: [
    { key: 'is_active', label: 'Állapot', type: 'preset' },
    { key: 'date_range', label: 'Időszak', type: 'preset' },
  ],
};

const PRESET_VALUES = {
  gender: [
    { value: 'male', label: 'Férfi' },
    { value: 'female', label: 'Nő' },
    { value: 'other', label: 'Egyéb' },
  ],
  visa_expiry: [
    { value: 'expired', label: 'Lejárt' },
    { value: '30days', label: '30 napon belül lejár' },
    { value: '60days', label: '60 napon belül lejár' },
    { value: 'valid', label: 'Érvényes' },
  ],
  contract_end: [
    { value: 'expired', label: 'Lejárt' },
    { value: '30days', label: '30 napon belül lejár' },
    { value: '60days', label: '60 napon belül lejár' },
    { value: '90days', label: '90 napon belül lejár' },
  ],
  marital_status: [
    { value: 'single', label: 'Egyedülálló' },
    { value: 'married', label: 'Házas' },
    { value: 'divorced', label: 'Elvált' },
    { value: 'widowed', label: 'Özvegy' },
  ],
  birth_year: [
    { value: 'under_25', label: '25 év alatt' },
    { value: '25_35', label: '25-35 év' },
    { value: '35_50', label: '35-50 év' },
    { value: 'over_50', label: '50 év felett' },
  ],
  // Accommodation presets
  acc_status: [
    { value: 'available', label: 'Szabad' },
    { value: 'occupied', label: 'Foglalt' },
    { value: 'maintenance', label: 'Karbantartás' },
  ],
  acc_type: [
    { value: 'studio', label: 'Stúdió' },
    { value: '1br', label: '1 szobás' },
    { value: '2br', label: '2 szobás' },
    { value: '3br', label: '3 szobás' },
    { value: 'dormitory', label: 'Kollégium' },
  ],
  date_range: [
    { value: 'this_month', label: 'Ez a hónap' },
    { value: 'last_month', label: 'Múlt hónap' },
    { value: '3months', label: '3 hónap' },
    { value: '6months', label: '6 hónap' },
    { value: 'this_year', label: 'Idei év' },
  ],
  is_active: [
    { value: 'active', label: 'Aktív' },
    { value: 'inactive', label: 'Inaktív' },
  ],
};

const TABLE_COLUMNS = {
  employees: [
    { key: 'name', label: 'Név' },
    { key: 'status', label: 'Státusz' },
    { key: 'workplace', label: 'Munkahely' },
    { key: 'gender', label: 'Nem' },
    { key: 'position', label: 'Beosztás' },
    { key: 'visa_expiry', label: 'Vízum lejárat', format: 'date' },
    { key: 'start_date', label: 'Kezdés', format: 'date' },
    { key: 'end_date', label: 'Befejezés', format: 'date' },
    { key: 'accommodation', label: 'Szálláshely' },
  ],
  accommodations: [
    { key: 'name', label: 'Név' },
    { key: 'address', label: 'Cím' },
    { key: 'type', label: 'Típus' },
    { key: 'status', label: 'Állapot' },
    { key: 'capacity', label: 'Kapacitás' },
    { key: 'monthly_rent', label: 'Bérleti díj', format: 'currency' },
    { key: 'contractor_name', label: 'Alvállalkozó' },
  ],
  tickets: [
    { key: 'ticket_number', label: 'Szám' },
    { key: 'title', label: 'Cím' },
    { key: 'status', label: 'Státusz' },
    { key: 'priority', label: 'Prioritás' },
    { key: 'category', label: 'Kategória' },
    { key: 'created_at', label: 'Létrehozva', format: 'datetime' },
    { key: 'assigned_to_name', label: 'Felelős' },
    { key: 'contractor_name', label: 'Alvállalkozó' },
  ],
  contractors: [
    { key: 'name', label: 'Név' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Telefon' },
    { key: 'is_active', label: 'Aktív', format: 'boolean' },
    { key: 'total_tickets', label: 'Összes jegy' },
    { key: 'completed_tickets', label: 'Lezárt jegy' },
  ],
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

// ============================================================
// Helpers
// ============================================================

function formatCellValue(value, format) {
  if (value === null || value === undefined || value === '-') return '-';
  if (format === 'date') {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('hu-HU');
  }
  if (format === 'datetime') {
    if (!value) return '-';
    return new Date(value).toLocaleString('hu-HU');
  }
  if (format === 'currency') {
    return Number(value).toLocaleString('hu-HU') + ' Ft';
  }
  if (format === 'boolean') {
    return value ? 'Igen' : 'Nem';
  }
  return String(value);
}

// ============================================================
// Components
// ============================================================

const StatMiniCard = ({ title, value, color }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent sx={{ py: 2, px: 2.5, '&:last-child': { pb: 2 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color: color || '#1e293b' }}>
        {value}
      </Typography>
    </CardContent>
  </Card>
);

// ============================================================
// Main Component
// ============================================================

function Reports() {
  const [activeReport, setActiveReport] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summaryMetrics, setSummaryMetrics] = useState({});
  const [filterOptions, setFilterOptions] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Load summary metrics + filter options on mount
  useEffect(() => {
    loadSummaryMetrics();
    loadFilterOptions();
  }, []);

  const loadSummaryMetrics = async () => {
    try {
      const [emp, acc, tick, con] = await Promise.all([
        reportsAPI.getEmployeesSummary([]),
        reportsAPI.getAccommodationsSummary([]),
        reportsAPI.getTicketsSummary([]),
        reportsAPI.getContractorsSummary([]),
      ]);
      setSummaryMetrics({
        employees: emp.success ? emp.data.total : '-',
        accommodations: acc.success ? acc.data.total : '-',
        tickets: tick.success ? tick.data.total : '-',
        contractors: con.success ? con.data.total : '-',
      });
    } catch {
      // Non-critical
    }
  };

  const loadFilterOptions = async () => {
    try {
      const response = await reportsAPI.getFilterOptions();
      if (response.success) {
        setFilterOptions(response.data);
      }
    } catch (error) {
      console.error('Filter options load error:', error);
    }
  };

  // ============================================================
  // FilterBuilder helpers
  // ============================================================

  const getPresetValuesForReport = (reportType) => {
    const base = { ...PRESET_VALUES };
    if (reportType === 'accommodations') {
      return {
        ...base,
        status: PRESET_VALUES.acc_status,
        type: PRESET_VALUES.acc_type,
      };
    }
    return base;
  };

  const getDynamicOptionsForReport = useCallback((reportType) => {
    if (!filterOptions) return {};

    if (reportType === 'employees') {
      return {
        status: (filterOptions.employees?.statuses || []).map(s => ({ value: s.name, label: s.name })),
        workplace: (filterOptions.employees?.workplaces || []).map(w => ({ value: w, label: w })),
        position: (filterOptions.employees?.positions || []).map(p => ({ value: p, label: p })),
        country: (filterOptions.employees?.countries || []).map(c => ({ value: c, label: c })),
      };
    }

    if (reportType === 'tickets') {
      return {
        status: (filterOptions.tickets?.statuses || []).map(s => ({ value: s.slug, label: s.name })),
        category: (filterOptions.tickets?.categories || []).map(c => ({ value: c.name, label: c.name })),
        priority: (filterOptions.tickets?.priorities || []).map(p => ({ value: p.slug, label: p.name })),
        contractor: (filterOptions.tickets?.contractors || []).map(c => ({ value: String(c.id), label: c.name })),
      };
    }

    if (reportType === 'accommodations') {
      return {
        contractor: (filterOptions.accommodations?.contractors || []).map(c => ({ value: String(c.id), label: c.name })),
      };
    }

    return {};
  }, [filterOptions]);

  // ============================================================
  // Data loading
  // ============================================================

  const loadReport = useCallback(async (reportKey, reportFilters) => {
    setLoading(true);
    setData(null);
    setSortConfig({ key: null, direction: 'asc' });
    try {
      const activeFilters = reportFilters || [];
      let response;
      switch (reportKey) {
        case 'employees':
          response = await reportsAPI.getEmployeesSummary(activeFilters);
          break;
        case 'accommodations':
          response = await reportsAPI.getAccommodationsSummary(activeFilters);
          break;
        case 'tickets':
          response = await reportsAPI.getTicketsSummary(activeFilters);
          break;
        case 'contractors':
          response = await reportsAPI.getContractorsSummary(activeFilters);
          break;
        default:
          return;
      }
      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Riport betöltési hiba:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCardClick = (key) => {
    if (activeReport === key) {
      setActiveReport(null);
      setData(null);
    } else {
      setActiveReport(key);
      loadReport(key, []);
    }
  };

  const handleFilter = (activeFilters) => {
    if (!activeReport) return;
    loadReport(activeReport, activeFilters);
  };

  // ============================================================
  // Sorting
  // ============================================================

  const handleSort = (columnKey) => {
    setSortConfig(prev => ({
      key: columnKey,
      direction: prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortedRecords = () => {
    if (!data?.records || !sortConfig.key) return data?.records || [];
    return [...data.records].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), 'hu', { numeric: true });
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  };

  // ============================================================
  // Excel export
  // ============================================================

  const handleExcelExport = () => {
    if (!activeReport || !data?.records?.length) return;
    const columns = TABLE_COLUMNS[activeReport];
    const headers = columns.map(c => c.label);
    const rows = data.records.map(record =>
      columns.map(col => formatCellValue(record[col.key], col.format))
    );

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riport');

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `riport_${activeReport}_${date}.xlsx`);
  };

  // ============================================================
  // Render: Filter builder
  // ============================================================

  const renderFilterBuilder = () => {
    if (!activeReport) return null;
    const fields = REPORT_FILTER_FIELDS[activeReport] || [];

    return (
      <Box sx={{ mb: 3 }}>
        <FilterBuilder
          key={activeReport}
          fields={fields}
          presetValues={getPresetValuesForReport(activeReport)}
          dynamicOptions={getDynamicOptionsForReport(activeReport)}
          onFilter={handleFilter}
          resultCount={data ? data.totalRecords : null}
          loading={loading}
        />
        {data?.records?.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -2, mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              onClick={handleExcelExport}
              sx={{ borderColor: '#2c5f2d', color: '#2c5f2d', '&:hover': { borderColor: '#234d24', bgcolor: 'rgba(44,95,45,0.04)' } }}
            >
              Excel export
            </Button>
          </Box>
        )}
      </Box>
    );
  };

  // ============================================================
  // Render: Data table
  // ============================================================

  const renderDataTable = () => {
    if (!activeReport || !data?.records?.length) return null;
    const columns = TABLE_COLUMNS[activeReport];
    const sortedRecords = getSortedRecords();

    return (
      <Paper sx={{ mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, p: 2.5, pb: 1 }}>
          Rekordok ({data.totalRecords})
        </Typography>
        <TableContainer sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map(col => (
                  <TableCell key={col.key} sx={{ fontWeight: 600 }}>
                    <TableSortLabel
                      active={sortConfig.key === col.key}
                      direction={sortConfig.key === col.key ? sortConfig.direction : 'asc'}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedRecords.map((record, idx) => (
                <TableRow key={record.id || idx} hover>
                  {columns.map(col => (
                    <TableCell key={col.key}>
                      {formatCellValue(record[col.key], col.format)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  };

  // ============================================================
  // Render: Detail sections per report type
  // ============================================================

  const renderEmployeesDetail = () => {
    if (!data) return null;
    const genderColors = ['#3b82f6', '#ec4899', '#8b5cf6', '#94a3b8'];
    return (
      <Box>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Összes" value={data.total} color="#3b82f6" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Aktív" value={data.active} color="#10b981" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Vízum lejár (30 nap)" value={data.visaExpiring30d} color="#f59e0b" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Új (e hónap)" value={data.newThisMonth} color="#8b5cf6" />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Nem szerinti eloszlás</Typography>
              {data.byGender?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={data.byGender} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="count" nameKey="gender" label={({ gender, count }) => `${gender}: ${count}`}>
                      {data.byGender.map((_, idx) => (
                        <Cell key={idx} fill={genderColors[idx % genderColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Munkahely szerint</Typography>
              {data.byWorkplace?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.byWorkplace} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="workplace" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Fő" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Státusz szerint</Typography>
              {data.byStatus?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.byStatus} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Fő" radius={[4, 4, 0, 0]}>
                      {data.byStatus.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color || PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const renderAccommodationsDetail = () => {
    if (!data) return null;
    const statusColors = { 'Szabad': '#10b981', 'Foglalt': '#f59e0b', 'Karbantartás': '#ef4444' };
    return (
      <Box>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4}>
            <StatMiniCard title="Összes" value={data.total} color="#10b981" />
          </Grid>
          <Grid item xs={6} sm={4}>
            <StatMiniCard title="Kihasználtság" value={`${data.occupancyRate}%`} color="#f59e0b" />
          </Grid>
          <Grid item xs={6} sm={4}>
            <StatMiniCard title="Kapacitás / Lakók" value={`${data.currentOccupants} / ${data.totalCapacity}`} color="#3b82f6" />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Állapot szerinti eloszlás</Typography>
              {data.byStatus?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={data.byStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="count" nameKey="status" label={({ status, count }) => `${status}: ${count}`}>
                      {data.byStatus.map((entry, idx) => (
                        <Cell key={idx} fill={statusColors[entry.status] || PIE_COLORS[idx]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Típus szerint</Typography>
              {data.byType?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.byType} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Darab" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const renderTicketsDetail = () => {
    if (!data) return null;
    return (
      <Box>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Összes" value={data.total} color="#f59e0b" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Átl. megoldási idő" value={`${data.avgResolutionHours}h`} color="#3b82f6" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Kategóriák" value={data.byCategory?.length || 0} color="#8b5cf6" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Havi trend" value={data.monthlyTrend?.length || 0} color="#10b981" />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Státusz szerint</Typography>
              {data.byStatus?.filter(s => s.count > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.byStatus.filter(s => s.count > 0)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Darab" radius={[4, 4, 0, 0]}>
                      {data.byStatus.filter(s => s.count > 0).map((entry, idx) => (
                        <Cell key={idx} fill={entry.color || PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Prioritás szerint</Typography>
              {data.byPriority?.filter(p => p.count > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={data.byPriority.filter(p => p.count > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="count" nameKey="name" label={({ name, count }) => `${name}: ${count}`}>
                      {data.byPriority.filter(p => p.count > 0).map((entry, idx) => (
                        <Cell key={idx} fill={entry.color || PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Havi trend</Typography>
              {data.monthlyTrend?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" name="Hibajegyek" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const renderContractorsDetail = () => {
    if (!data) return null;
    return (
      <Box>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4}>
            <StatMiniCard title="Összes" value={data.total} color="#8b5cf6" />
          </Grid>
          <Grid item xs={6} sm={4}>
            <StatMiniCard title="Aktív" value={data.active} color="#10b981" />
          </Grid>
          <Grid item xs={6} sm={4}>
            <StatMiniCard title="Inaktív" value={data.inactive} color="#94a3b8" />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Hibajegyek alvállalkozónként (Top 10)</Typography>
              {data.ticketsPerContractor?.filter(c => c.totalTickets > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.ticketsPerContractor.filter(c => c.totalTickets > 0)} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={80} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalTickets" name="Összes" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completedTickets" name="Lezárt" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Átl. megoldási idő (óra)</Typography>
              {data.avgCompletionTime?.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.avgCompletionTime} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={75} />
                    <Tooltip formatter={(v) => `${v} óra`} />
                    <Bar dataKey="avgHours" name="Átl. óra" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <Typography color="text.secondary">Nincs adat</Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  // ============================================================
  // Render: Main detail section
  // ============================================================

  const renderDetail = () => {
    if (!activeReport) return null;

    return (
      <Box>
        {renderFilterBuilder()}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {activeReport === 'employees' && renderEmployeesDetail()}
            {activeReport === 'accommodations' && renderAccommodationsDetail()}
            {activeReport === 'tickets' && renderTicketsDetail()}
            {activeReport === 'contractors' && renderContractorsDetail()}
            {renderDataTable()}
          </>
        )}
      </Box>
    );
  };

  // ============================================================
  // Render: Page
  // ============================================================

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Riportok
        </Typography>
      </Box>

      {/* Report category cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          const isActive = activeReport === report.key;
          return (
            <Grid item xs={12} sm={6} md={3} key={report.key}>
              <Card
                sx={{
                  height: '100%',
                  border: isActive ? `2px solid ${report.color}` : '2px solid transparent',
                  boxShadow: isActive ? `0 0 0 1px ${report.color}20` : undefined,
                  transition: 'all 0.2s',
                }}
              >
                <CardActionArea onClick={() => handleCardClick(report.key)} sx={{ height: '100%' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: report.bg,
                        color: report.color,
                        flexShrink: 0,
                      }}
                    >
                      <Icon sx={{ fontSize: 28 }} />
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                        {report.label}
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {summaryMetrics[report.key] ?? '-'}
                      </Typography>
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Expanded detail section */}
      {renderDetail()}
    </Box>
  );
}

export default Reports;
