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
  ButtonGroup,
  Button,
  TextField,
} from '@mui/material';
import {
  People as PeopleIcon,
  Apartment as ApartmentIcon,
  ConfirmationNumber as ConfirmationNumberIcon,
  Business as BusinessIcon,
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
import { reportsAPI } from '../services/api';

const REPORT_TYPES = [
  { key: 'employees', label: 'Munkavállalók', icon: PeopleIcon, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { key: 'accommodations', label: 'Szálláshelyek', icon: ApartmentIcon, color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  { key: 'tickets', label: 'Hibajegyek', icon: ConfirmationNumberIcon, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { key: 'contractors', label: 'Alvállalkozók', icon: BusinessIcon, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
];

const DATE_RANGES = [
  { key: 'month', label: 'Ez a hónap' },
  { key: 'last_month', label: 'Múlt hónap' },
  { key: '3months', label: '3 hónap' },
  { key: 'custom', label: 'Egyéni' },
];

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

function getDateRange(rangeKey) {
  const now = new Date();
  let from, to;

  switch (rangeKey) {
    case 'month': {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    }
    case 'last_month': {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    }
    case '3months': {
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    }
    default:
      return { from_date: null, to_date: null };
  }

  return {
    from_date: from.toISOString().split('T')[0],
    to_date: to.toISOString().split('T')[0],
  };
}

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

function Reports() {
  const [activeReport, setActiveReport] = useState(null);
  const [dateRange, setDateRange] = useState('month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summaryMetrics, setSummaryMetrics] = useState({});

  // Load summary metrics for all cards on mount
  useEffect(() => {
    loadSummaryMetrics();
  }, []);

  const loadSummaryMetrics = async () => {
    try {
      const [emp, acc, tick, con] = await Promise.all([
        reportsAPI.getEmployeesSummary(),
        reportsAPI.getAccommodationsSummary(),
        reportsAPI.getTicketsSummary(),
        reportsAPI.getContractorsSummary(),
      ]);
      setSummaryMetrics({
        employees: emp.success ? emp.data.total : '-',
        accommodations: acc.success ? acc.data.total : '-',
        tickets: tick.success ? tick.data.total : '-',
        contractors: con.success ? con.data.total : '-',
      });
    } catch {
      // Non-critical, cards will show '-'
    }
  };

  const loadReport = useCallback(async (reportKey) => {
    setLoading(true);
    setData(null);
    try {
      let params = {};
      if (dateRange === 'custom') {
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
      } else {
        const range = getDateRange(dateRange);
        if (range.from_date) params.from_date = range.from_date;
        if (range.to_date) params.to_date = range.to_date;
      }

      let response;
      switch (reportKey) {
        case 'employees':
          response = await reportsAPI.getEmployeesSummary(params);
          break;
        case 'accommodations':
          response = await reportsAPI.getAccommodationsSummary(params);
          break;
        case 'tickets':
          response = await reportsAPI.getTicketsSummary(params);
          break;
        case 'contractors':
          response = await reportsAPI.getContractorsSummary(params);
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
  }, [dateRange, fromDate, toDate]);

  // Reload when date range changes and a report is active
  useEffect(() => {
    if (activeReport) {
      loadReport(activeReport);
    }
  }, [dateRange, fromDate, toDate]);

  const handleCardClick = (key) => {
    if (activeReport === key) {
      setActiveReport(null);
      setData(null);
    } else {
      setActiveReport(key);
      loadReport(key);
    }
  };

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
          {/* Gender distribution */}
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

          {/* By workplace */}
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

          {/* By status */}
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
          {/* By status */}
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

          {/* By type */}
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
          {/* By status */}
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

          {/* By priority */}
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

          {/* Monthly trend */}
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
          {/* Tickets per contractor */}
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

          {/* Avg completion time */}
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

  const renderDetail = () => {
    if (!activeReport) return null;

    if (loading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    switch (activeReport) {
      case 'employees': return renderEmployeesDetail();
      case 'accommodations': return renderAccommodationsDetail();
      case 'tickets': return renderTicketsDetail();
      case 'contractors': return renderContractorsDetail();
      default: return null;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Riportok
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <ButtonGroup variant="outlined" size="small">
            {DATE_RANGES.map((range) => (
              <Button
                key={range.key}
                variant={dateRange === range.key ? 'contained' : 'outlined'}
                onClick={() => setDateRange(range.key)}
                sx={{
                  textTransform: 'none',
                  ...(dateRange === range.key && {
                    bgcolor: '#2c5f2d',
                    borderColor: '#2c5f2d',
                    '&:hover': { bgcolor: '#1e4620' },
                  }),
                }}
              >
                {range.label}
              </Button>
            ))}
          </ButtonGroup>

          {dateRange === 'custom' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                type="date"
                size="small"
                label="Kezdet"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160 }}
              />
              <TextField
                type="date"
                size="small"
                label="Vége"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160 }}
              />
            </Box>
          )}
        </Box>
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
