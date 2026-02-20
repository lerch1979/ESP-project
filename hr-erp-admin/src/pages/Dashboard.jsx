import React, { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  useTheme,
  useMediaQuery,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Tooltip,
} from '@mui/material';
import {
  ConfirmationNumber,
  Business,
  Apartment,
  TrendingUp,
  Warning,
  Tune as TuneIcon,
  KeyboardArrowUp as UpIcon,
  KeyboardArrowDown as DownIcon,
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
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { dashboardAPI, preferencesAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import ResponsiveTable from '../components/ResponsiveTable';

const ACCOMMODATION_COLORS = {
  available: '#10b981',
  occupied: '#ec4899',
  maintenance: '#ef4444',
};

const DEFAULT_WIDGET_ORDER = ['stats', 'charts', 'urgent', 'recent'];

const WIDGET_LABELS = {
  stats: 'Statisztikák',
  charts: 'Grafikonok',
  urgent: 'Sürgős teendők',
  recent: 'Legutóbbi jegyek',
};

function Dashboard() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const chartHeight = isMobile ? 220 : 300;
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);

  // Widget customization state
  const [widgetOrder, setWidgetOrder] = useState(DEFAULT_WIDGET_ORDER);
  const [hiddenWidgets, setHiddenWidgets] = useState([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [tempOrder, setTempOrder] = useState([]);
  const [tempHidden, setTempHidden] = useState([]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    loadData();
    loadPreferences();
  }, []);

  const loadData = async () => {
    try {
      const response = await dashboardAPI.getStats();
      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Dashboard betöltési hiba:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = async () => {
    try {
      const response = await preferencesAPI.getPreferences();
      if (response.success && response.data.preferences) {
        const prefs = response.data.preferences;
        if (prefs.dashboard_widget_order) setWidgetOrder(prefs.dashboard_widget_order);
        if (prefs.dashboard_hidden_widgets) setHiddenWidgets(prefs.dashboard_hidden_widgets);
      }
    } catch (error) {
      // Silently fail — use defaults
    }
  };

  const openCustomize = () => {
    setTempOrder([...widgetOrder]);
    setTempHidden([...hiddenWidgets]);
    setCustomizeOpen(true);
  };

  const handleToggleWidget = (id) => {
    setTempHidden((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const handleMoveUp = (idx) => {
    if (idx === 0) return;
    setTempOrder((prev) => {
      const arr = [...prev];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      return arr;
    });
  };

  const handleMoveDown = (idx) => {
    setTempOrder((prev) => {
      if (idx >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return arr;
    });
  };

  const handleSaveCustomization = async () => {
    setWidgetOrder(tempOrder);
    setHiddenWidgets(tempHidden);
    setCustomizeOpen(false);
    try {
      await preferencesAPI.updatePreferences({
        preferences: {
          dashboard_widget_order: tempOrder,
          dashboard_hidden_widgets: tempHidden,
        },
      });
    } catch (error) {
      console.error('Preferences save error:', error);
    }
  };

  const handleResetCustomization = () => {
    setTempOrder([...DEFAULT_WIDGET_ORDER]);
    setTempHidden([]);
  };

  const getStatusColor = (slug) => {
    const colors = {
      new: 'info',
      in_progress: 'warning',
      completed: 'success',
      rejected: 'error',
      waiting: 'default',
    };
    return colors[slug] || 'default';
  };

  const StatCard = ({ title, value, subtitle, icon, bgColor }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="text.secondary" variant="body2" sx={{ fontWeight: 500 }}>
              {title}
            </Typography>
            <Typography variant="h3" component="div" sx={{ fontWeight: 700, my: 0.5 }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: bgColor || 'rgba(37, 99, 235, 0.1)',
              color: '#2563eb',
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ textAlign: 'center', mt: 5 }}>
        <Typography color="text.secondary">Nem sikerült betölteni az adatokat.</Typography>
      </Box>
    );
  }

  // Prepare chart data
  const ticketChartData = data.tickets.byStatus
    .filter(s => s.count > 0)
    .map(s => ({
      name: s.name,
      value: s.count,
      color: s.color || '#94a3b8',
    }));

  const accommodationChartData = [
    { name: 'Szabad', value: data.accommodations.available, color: ACCOMMODATION_COLORS.available },
    { name: 'Foglalt', value: data.accommodations.occupied, color: ACCOMMODATION_COLORS.occupied },
    { name: 'Karbantartás', value: data.accommodations.maintenance, color: ACCOMMODATION_COLORS.maintenance },
  ].filter(d => d.value > 0);

  // Widget components
  const widgetComponents = {
    stats: (
      <Grid container spacing={3} sx={{ mb: 4 }} key="stats">
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Összes hibajegy"
            value={data.tickets.total}
            subtitle={`${data.tickets.urgent} sürgős`}
            icon={<ConfirmationNumber sx={{ fontSize: 28 }} />}
            bgColor="rgba(59, 130, 246, 0.1)"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Alvállalkozók"
            value={data.contractors.total}
            subtitle={`${data.contractors.active} aktív`}
            icon={<Business sx={{ fontSize: 28 }} />}
            bgColor="rgba(139, 92, 246, 0.1)"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Szálláshelyek"
            value={data.accommodations.total}
            subtitle={`${data.accommodations.available} szabad`}
            icon={<Apartment sx={{ fontSize: 28 }} />}
            bgColor="rgba(16, 185, 129, 0.1)"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Kihasználtság"
            value={`${data.accommodations.occupancyRate}%`}
            subtitle={`${data.accommodations.occupied} / ${data.accommodations.total} foglalt`}
            icon={<TrendingUp sx={{ fontSize: 28 }} />}
            bgColor="rgba(245, 158, 11, 0.1)"
          />
        </Grid>
      </Grid>
    ),
    charts: (
      <Grid container spacing={3} sx={{ mb: 4 }} key="charts">
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Hibajegyek státusz szerint
            </Typography>
            {ticketChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart data={ticketChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis allowDecimals={false} />
                  <RechartsTooltip />
                  <Bar dataKey="value" name="Darab" radius={[4, 4, 0, 0]}>
                    {ticketChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                <Typography color="text.secondary">Nincs hibajegy adat</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Szálláshelyek állapota
            </Typography>
            {accommodationChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={accommodationChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {accommodationChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                <Typography color="text.secondary">Nincs szálláshely adat</Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    ),
    urgent: data.tickets.urgent > 0 ? (
      <Paper
        key="urgent"
        sx={{
          p: 2,
          mb: 3,
          bgcolor: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Warning sx={{ color: '#ef4444' }} />
          <Typography variant="body1" sx={{ fontWeight: 600, color: '#ef4444' }}>
            {data.tickets.urgent} sürgős/kritikus hibajegy vár megoldásra!
          </Typography>
        </Box>
      </Paper>
    ) : null,
    recent: (
      <Paper sx={{ p: 3 }} key="recent">
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Legutóbbi hibajegyek
        </Typography>
        {data.recentTickets.length > 0 ? (
          <ResponsiveTable>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Felelős</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Létrehozva</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.recentTickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    hover
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.04)' },
                    }}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#2563eb' }}>
                        {ticket.ticket_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ticket.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {ticket.category_name && (
                        <Chip label={ticket.category_name} size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ticket.status_name}
                        size="small"
                        color={getStatusColor(ticket.status_slug)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          color: ticket.priority_level >= 3 ? 'error.main' : 'text.secondary',
                          fontWeight: ticket.priority_level >= 3 ? 600 : 400,
                        }}
                      >
                        {ticket.priority_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {ticket.assigned_to_name || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(ticket.created_at).toLocaleDateString('hu-HU')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ResponsiveTable>
        ) : (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography color="text.secondary">Nincs hibajegy</Typography>
          </Box>
        )}
      </Paper>
    ),
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
            Kezdőlap
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {user?.firstName} {user?.lastName} • {user?.contractor?.name}
          </Typography>
        </Box>
        <Tooltip title="Testreszabás">
          <IconButton onClick={openCustomize} sx={{ color: '#2563eb' }}>
            <TuneIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Render widgets in order, skip hidden */}
      {widgetOrder
        .filter((id) => !hiddenWidgets.includes(id))
        .map((id) => widgetComponents[id] || null)}

      {/* Customization Dialog */}
      <Dialog open={customizeOpen} onClose={() => setCustomizeOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Kezdőlap testreszabása</DialogTitle>
        <DialogContent dividers>
          <List>
            {tempOrder.map((id, idx) => (
              <ListItem key={id} dense>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox
                    edge="start"
                    checked={!tempHidden.includes(id)}
                    onChange={() => handleToggleWidget(id)}
                  />
                </ListItemIcon>
                <ListItemText primary={WIDGET_LABELS[id] || id} />
                <IconButton size="small" onClick={() => handleMoveUp(idx)} disabled={idx === 0}>
                  <UpIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => handleMoveDown(idx)} disabled={idx === tempOrder.length - 1}>
                  <DownIcon fontSize="small" />
                </IconButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleResetCustomization} color="inherit">
            Visszaállítás
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => setCustomizeOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSaveCustomization} sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#3b82f6' } }}>
            Mentés
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Dashboard;
