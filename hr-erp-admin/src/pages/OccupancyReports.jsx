import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Collapse,
  IconButton,
  Chip,
  Button,
} from '@mui/material';
import {
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
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
import ResponsiveTable from '../components/ResponsiveTable';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];
const THEME_GREEN = '#2c5f2d';

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

const MONTHS = [
  { value: 1, label: 'Január' },
  { value: 2, label: 'Február' },
  { value: 3, label: 'Március' },
  { value: 4, label: 'Április' },
  { value: 5, label: 'Május' },
  { value: 6, label: 'Június' },
  { value: 7, label: 'Július' },
  { value: 8, label: 'Augusztus' },
  { value: 9, label: 'Szeptember' },
  { value: 10, label: 'Október' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

function OccupancyReports() {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  // Daily controls
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().slice(0, 10));

  // Monthly controls
  const now = new Date();
  const [monthlyYear, setMonthlyYear] = useState(now.getFullYear());
  const [monthlyMonth, setMonthlyMonth] = useState(now.getMonth() + 1);

  // Range controls
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const [rangeFrom, setRangeFrom] = useState(thirtyDaysAgo);
  const [rangeTo, setRangeTo] = useState(now.toISOString().slice(0, 10));

  // Table sorting
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Expanded rows for daily residents
  const [expandedRows, setExpandedRows] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setData(null);
    setSortConfig({ key: null, direction: 'asc' });
    setExpandedRows({});
    try {
      let response;
      if (tab === 0) {
        response = await reportsAPI.getOccupancyDaily({ date: dailyDate });
      } else if (tab === 1) {
        response = await reportsAPI.getOccupancyMonthly({ year: monthlyYear, month: monthlyMonth });
      } else {
        response = await reportsAPI.getOccupancyRange({ from: rangeFrom, to: rangeTo });
      }
      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Kihasználtság riport hiba:', error);
    } finally {
      setLoading(false);
    }
  }, [tab, dailyDate, monthlyYear, monthlyMonth, rangeFrom, rangeTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortedAccommodations = () => {
    const accs = data?.accommodations || [];
    if (!sortConfig.key) return accs;
    return [...accs].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = typeof aVal === 'number'
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), 'hu', { numeric: true });
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  };

  const toggleRow = (id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Years for select (current year +/- 2)
  const yearOptions = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) {
    yearOptions.push(y);
  }

  // ============================================================
  // Excel export
  // ============================================================

  const handleExcelExport = () => {
    if (!data?.accommodations?.length) return;
    const accs = getSortedAccommodations();
    let headers, rows;

    if (tab === 0) {
      headers = ['Szálláshely', 'Kapacitás', 'Foglalt', 'Szabad', 'Kihasználtság %'];
      rows = accs.map(a => [a.name, a.total_beds, a.occupied_beds, a.free_beds, a.occupancy_percentage + '%']);
    } else if (tab === 1) {
      headers = ['Szálláshely', 'Kapacitás', 'Összes éjszaka', 'Átl. kihasználtság %', 'Csúcs', 'Minimum'];
      rows = accs.map(a => [a.name, a.capacity, a.total_nights, a.avg_occupancy_pct + '%', a.peak_occupied, a.lowest_occupied]);
    } else {
      headers = ['Szálláshely', 'Kapacitás', 'Összes éjszaka', 'Átl. kihasználtság %', 'Csúcs'];
      rows = accs.map(a => [a.name, a.capacity, a.total_nights, a.avg_occupancy_pct + '%', a.peak_occupied]);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kihasználtság');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `kihaszn_${['napi', 'havi', 'idoszak'][tab]}_${date}.xlsx`);
  };

  // ============================================================
  // Render: Summary cards
  // ============================================================

  const renderSummary = () => {
    if (!data) return null;
    const s = data.summary;

    if (tab === 0) {
      return (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Összes ágy" value={s.total_beds} color={THEME_GREEN} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Foglalt" value={s.occupied_beds} color="#f59e0b" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Szabad" value={s.free_beds} color="#10b981" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Kihasználtság" value={`${s.occupancy_percentage}%`} color="#3b82f6" />
          </Grid>
        </Grid>
      );
    }

    if (tab === 1) {
      return (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Összes ágyas-éj" value={s.total_nights} color={THEME_GREEN} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Kapacitás éjszaka" value={s.total_capacity_nights} color="#3b82f6" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard title="Átl. kihasználtság" value={`${s.avg_occupancy_percentage}%`} color="#f59e0b" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatMiniCard
              title="Csúcsnap"
              value={s.peak_day ? `${s.peak_day.percentage}%` : '-'}
              color="#ef4444"
            />
          </Grid>
        </Grid>
      );
    }

    // Range
    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={2.4}>
          <StatMiniCard title="Ágyas-éj" value={s.total_nights} color={THEME_GREEN} />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <StatMiniCard title="Kapacitás éj" value={s.total_capacity_nights} color="#3b82f6" />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <StatMiniCard title="Átl. kihasználtság" value={`${s.average_occupancy_percentage}%`} color="#f59e0b" />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <StatMiniCard title="Átl. tartózkodás" value={`${s.average_stay_duration} nap`} color="#8b5cf6" />
        </Grid>
        <Grid item xs={6} sm={2.4}>
          <StatMiniCard title="Forgalom (fő)" value={s.turnover} color="#10b981" />
        </Grid>
      </Grid>
    );
  };

  // ============================================================
  // Render: Charts
  // ============================================================

  const renderCharts = () => {
    if (!data) return null;
    const accs = data.accommodations || [];

    // Pie data: occupied vs free (daily/monthly summary)
    const pieData = tab === 0
      ? [
          { name: 'Foglalt', value: data.summary.occupied_beds },
          { name: 'Szabad', value: data.summary.free_beds },
        ]
      : tab === 1
      ? [
          { name: 'Kihasznált éjszakák', value: data.summary.total_nights },
          { name: 'Szabad kapacitás', value: data.summary.total_capacity_nights - data.summary.total_nights },
        ]
      : [
          { name: 'Kihasznált éjszakák', value: data.summary.total_nights },
          { name: 'Szabad kapacitás', value: data.summary.total_capacity_nights - data.summary.total_nights },
        ];

    const pieColors = ['#f59e0b', '#10b981'];

    // Bar data: per-accommodation occupancy %
    const barData = accs.map(a => ({
      name: a.name,
      percentage: tab === 0 ? a.occupancy_percentage : a.avg_occupancy_pct,
    }));

    return (
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              {tab === 0 ? 'Foglaltság eloszlás' : 'Kihasználtság arány'}
            </Typography>
            {pieData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((_, idx) => (
                      <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
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
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Kihasználtság szállásonként (%)
            </Typography>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={80} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="percentage" name="Kihasználtság" fill={THEME_GREEN} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                <Typography color="text.secondary">Nincs adat</Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Monthly trend LineChart — only on monthly tab */}
        {tab === 1 && data.daily_trend?.length > 0 && (
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Napi trend ({MONTHS.find(m => m.value === data.month)?.label} {data.year})
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.daily_trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={d => d.slice(8)}
                  />
                  <YAxis yAxisId="left" domain={[0, 'auto']} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    labelFormatter={d => d}
                    formatter={(value, name) =>
                      name === 'Kihasználtság %' ? `${value}%` : value
                    }
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total_occupied"
                    name="Foglalt ágy"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b', r: 3 }}
                    yAxisId="left"
                  />
                  <Line
                    type="monotone"
                    dataKey="total_capacity"
                    name="Kapacitás"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    yAxisId="left"
                  />
                  <Line
                    type="monotone"
                    dataKey="percentage"
                    name="Kihasználtság %"
                    stroke={THEME_GREEN}
                    strokeWidth={2}
                    dot={{ fill: THEME_GREEN, r: 3 }}
                    yAxisId="right"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}
      </Grid>
    );
  };

  // ============================================================
  // Render: Monthly top residents
  // ============================================================

  const renderTopResidents = () => {
    if (tab !== 1 || !data?.top_residents?.length) return null;
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Legtöbb éjszaka (Top 10)
        </Typography>
        <ResponsiveTable>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Szálláshely</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Éjszakák</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.top_residents.map((r, idx) => (
                <TableRow key={idx} hover>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.accommodation_name}</TableCell>
                  <TableCell align="right">
                    <Chip label={r.nights_stayed} size="small" sx={{ bgcolor: 'rgba(44,95,45,0.1)', color: THEME_GREEN, fontWeight: 600 }} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ResponsiveTable>
      </Paper>
    );
  };

  // ============================================================
  // Render: Data table
  // ============================================================

  const renderTable = () => {
    if (!data?.accommodations?.length) return null;
    const sorted = getSortedAccommodations();
    const isDaily = tab === 0;
    const isMonthly = tab === 1;

    const columns = isDaily
      ? [
          { key: 'name', label: 'Szálláshely' },
          { key: 'total_beds', label: 'Kapacitás', align: 'right' },
          { key: 'occupied_beds', label: 'Foglalt', align: 'right' },
          { key: 'free_beds', label: 'Szabad', align: 'right' },
          { key: 'occupancy_percentage', label: 'Kihasználtság %', align: 'right' },
        ]
      : isMonthly
      ? [
          { key: 'name', label: 'Szálláshely' },
          { key: 'capacity', label: 'Kapacitás', align: 'right' },
          { key: 'total_nights', label: 'Összes éjszaka', align: 'right' },
          { key: 'avg_occupancy_pct', label: 'Átl. %', align: 'right' },
          { key: 'peak_occupied', label: 'Csúcs', align: 'right' },
          { key: 'lowest_occupied', label: 'Minimum', align: 'right' },
        ]
      : [
          { key: 'name', label: 'Szálláshely' },
          { key: 'capacity', label: 'Kapacitás', align: 'right' },
          { key: 'total_nights', label: 'Összes éjszaka', align: 'right' },
          { key: 'avg_occupancy_pct', label: 'Átl. %', align: 'right' },
          { key: 'peak_occupied', label: 'Csúcs', align: 'right' },
        ];

    return (
      <Paper sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2.5, pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Szálláshelyek ({sorted.length})
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={handleExcelExport}
            sx={{ borderColor: THEME_GREEN, color: THEME_GREEN, '&:hover': { borderColor: '#234d24', bgcolor: 'rgba(44,95,45,0.04)' } }}
          >
            Excel
          </Button>
        </Box>
        <ResponsiveTable sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {isDaily && <TableCell sx={{ width: 48 }} />}
                {columns.map(col => (
                  <TableCell key={col.key} align={col.align || 'left'} sx={{ fontWeight: 600 }}>
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
              {sorted.map((acc) => (
                <React.Fragment key={acc.id}>
                  <TableRow hover>
                    {isDaily && (
                      <TableCell>
                        {(acc.current_residents?.length > 0 || acc.rooms?.length > 0) && (
                          <IconButton size="small" onClick={() => toggleRow(acc.id)}>
                            {expandedRows[acc.id] ? <CollapseIcon /> : <ExpandIcon />}
                          </IconButton>
                        )}
                      </TableCell>
                    )}
                    {columns.map(col => (
                      <TableCell key={col.key} align={col.align || 'left'}>
                        {col.key === 'occupancy_percentage' || col.key === 'avg_occupancy_pct'
                          ? `${acc[col.key]}%`
                          : acc[col.key]
                        }
                      </TableCell>
                    ))}
                  </TableRow>
                  {isDaily && (acc.current_residents?.length > 0 || acc.rooms?.length > 0) && (
                    <TableRow>
                      <TableCell colSpan={columns.length + 1} sx={{ p: 0, borderBottom: expandedRows[acc.id] ? undefined : 'none' }}>
                        <Collapse in={expandedRows[acc.id]} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: '#f8fafc' }}>
                            {acc.rooms?.length > 0 ? (
                              <>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                  Szobák ({acc.rooms.length})
                                </Typography>
                                <Table size="small" sx={{ bgcolor: 'white', borderRadius: 1 }}>
                                  <TableHead>
                                    <TableRow>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Szoba</TableCell>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="right">Ágyak</TableCell>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="right">Foglalt</TableCell>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }} align="right">Szabad</TableCell>
                                      <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Lakók</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {acc.rooms.map((room) => {
                                      const roomColor = room.free_beds <= 0 ? '#fef2f2' : room.occupied_beds > 0 ? '#fffbeb' : '#f0fdf4';
                                      return (
                                        <TableRow key={room.room_id} sx={{ bgcolor: roomColor }}>
                                          <TableCell sx={{ fontWeight: 500, fontSize: '0.8rem' }}>{room.room_number}</TableCell>
                                          <TableCell align="right">{room.total_beds}</TableCell>
                                          <TableCell align="right">{room.occupied_beds}</TableCell>
                                          <TableCell align="right">{room.free_beds}</TableCell>
                                          <TableCell>
                                            {room.occupants?.length > 0
                                              ? room.occupants.map((o, i) => (
                                                  <Chip key={i} label={o.name} size="small" variant="outlined" sx={{ mr: 0.5, mb: 0.5 }} />
                                                ))
                                              : <Typography variant="caption" color="text.secondary">-</Typography>
                                            }
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                                {/* Show unassigned residents (those without room) */}
                                {acc.current_residents?.filter(r => !r.assigned_room_number).length > 0 && (
                                  <Box sx={{ mt: 1.5 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                      Szobához nem rendelt lakók:
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                      {acc.current_residents.filter(r => !r.assigned_room_number).map((r, idx) => (
                                        <Chip key={idx} label={r.name} size="small" variant="outlined" color="warning" />
                                      ))}
                                    </Box>
                                  </Box>
                                )}
                              </>
                            ) : (
                              <>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                  Jelenlegi lakók ({acc.current_residents.length})
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                  {acc.current_residents.map((r, idx) => (
                                    <Chip
                                      key={idx}
                                      label={`${r.name}${r.assigned_room_number ? ` (${r.assigned_room_number})` : r.room_number ? ` (${r.room_number})` : ''}`}
                                      size="small"
                                      variant="outlined"
                                    />
                                  ))}
                                </Box>
                              </>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </ResponsiveTable>
      </Paper>
    );
  };

  // ============================================================
  // Render: Page
  // ============================================================

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
        Ágyszám kihasználtság
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            '& .MuiTab-root': { fontWeight: 600 },
            '& .Mui-selected': { color: THEME_GREEN },
            '& .MuiTabs-indicator': { bgcolor: THEME_GREEN },
          }}
        >
          <Tab label="Napi" />
          <Tab label="Havi" />
          <Tab label="Időszak" />
        </Tabs>
      </Paper>

      {/* Date controls */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {tab === 0 && (
          <TextField
            type="date"
            label="Dátum"
            value={dailyDate}
            onChange={(e) => setDailyDate(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: 200 }}
          />
        )}
        {tab === 1 && (
          <>
            <TextField
              select
              label="Év"
              value={monthlyYear}
              onChange={(e) => setMonthlyYear(parseInt(e.target.value))}
              size="small"
              sx={{ width: 120 }}
            >
              {yearOptions.map(y => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Hónap"
              value={monthlyMonth}
              onChange={(e) => setMonthlyMonth(parseInt(e.target.value))}
              size="small"
              sx={{ width: 160 }}
            >
              {MONTHS.map(m => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>
          </>
        )}
        {tab === 2 && (
          <>
            <TextField
              type="date"
              label="Kezdet"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ width: 200 }}
            />
            <TextField
              type="date"
              label="Vége"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ width: 200 }}
            />
          </>
        )}
      </Box>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {renderSummary()}
          {renderCharts()}
          {renderTopResidents()}
          {renderTable()}
        </>
      )}
    </Box>
  );
}

export default OccupancyReports;
