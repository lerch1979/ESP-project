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
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  ConfirmationNumber,
  Business,
  Apartment,
  TrendingUp,
  Warning,
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
} from 'recharts';
import { dashboardAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

const ACCOMMODATION_COLORS = {
  available: '#10b981',
  occupied: '#f59e0b',
  maintenance: '#ef4444',
};

const ACCOMMODATION_LABELS = {
  available: 'Szabad',
  occupied: 'Foglalt',
  maintenance: 'Karbantartás',
};

function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    loadData();
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
              bgcolor: bgColor || 'rgba(44, 95, 45, 0.1)',
              color: '#2c5f2d',
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

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
          Kezdőlap
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {user?.firstName} {user?.lastName} • {user?.contractor?.name}
        </Typography>
      </Box>

      {/* Stat cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
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

      {/* Charts row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Tickets by status - bar chart */}
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Hibajegyek státusz szerint
            </Typography>
            {ticketChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
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
                  <Tooltip />
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

        {/* Accommodations status - pie chart */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Szálláshelyek állapota
            </Typography>
            {accommodationChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
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
                  <Tooltip />
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

      {/* Urgent tickets warning */}
      {data.tickets.urgent > 0 && (
        <Paper
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
      )}

      {/* Recent tickets */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Legutóbbi hibajegyek
        </Typography>

        {data.recentTickets.length > 0 ? (
          <TableContainer>
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
                      '&:hover': { bgcolor: 'rgba(44, 95, 45, 0.04)' },
                    }}
                    onClick={() => navigate(`/tickets/${ticket.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#2c5f2d' }}>
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
          </TableContainer>
        ) : (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography color="text.secondary">Nincs hibajegy</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default Dashboard;
