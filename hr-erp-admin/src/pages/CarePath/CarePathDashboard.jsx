import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress, Alert, Paper, Chip
} from '@mui/material';
import { Healing, EventAvailable, People, ThumbUp, TrendingUp } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { carepathAPI } from '../../services/api';

const CATEGORY_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

const StatCard = ({ title, value, subtitle, icon, color }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="text.secondary" variant="body2">{title}</Typography>
          <Typography variant="h3" sx={{ fontWeight: 700, my: 0.5 }}>{value}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: (color || '#6366f1') + '20' }}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

const CarePathDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await carepathAPI.getUsageStats(start, end);
      setStats(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Nem sikerült betölteni');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;

  const latest = stats[0] || {};
  const totalCases = stats.reduce((s, m) => s + (parseInt(m.total_cases_opened) || 0), 0);
  const totalSessions = stats.reduce((s, m) => s + (parseInt(m.total_sessions_held) || 0), 0);

  // Category breakdown from latest month
  const catBreakdown = latest.category_breakdown || {};
  const catData = Object.entries(catBreakdown).map(([name, count], i) => ({
    name, value: parseInt(count) || 0, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  })).filter(d => d.value > 0);

  const chartData = [...stats].reverse();

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        <Healing sx={{ mr: 1, verticalAlign: 'middle' }} />
        CarePath Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Esetek összesen (6 hó)" value={totalCases} subtitle={`Aktív: ${latest.total_cases_active || 0}`} icon={<Healing sx={{ fontSize: 32, color: '#6366f1' }} />} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Munkamenetek (6 hó)" value={totalSessions} icon={<EventAvailable sx={{ fontSize: 32, color: '#10b981' }} />} color="#10b981" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="CarePath felhasználók" value={latest.employee_count_using_eap || 0}
            subtitle={latest.utilization_rate ? `${latest.utilization_rate}% kihasználtság` : ''}
            icon={<People sx={{ fontSize: 32, color: '#3b82f6' }} />} color="#3b82f6" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Átl. elégedettség" value={latest.avg_satisfaction_rating ? `${parseFloat(latest.avg_satisfaction_rating).toFixed(1)}/5` : '—'}
            icon={<ThumbUp sx={{ fontSize: 32, color: '#f59e0b' }} />} color="#f59e0b" />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Monthly Trend */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: 380 }}>
            <Typography variant="h6" gutterBottom>Havi trend (6 hónap)</Typography>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stat_month" tickFormatter={d => d?.substring(5, 7) + '. hó'} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total_cases_opened" name="Nyitott esetek" stroke="#6366f1" strokeWidth={2} />
                  <Line type="monotone" dataKey="total_sessions_held" name="Munkamenetek" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Nincs adat</Typography>
            )}
          </Paper>
        </Grid>

        {/* Category Pie */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: 380 }}>
            <Typography variant="h6" gutterBottom>Kategória eloszlás (utolsó hó)</Typography>
            {catData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                    label={({ name, value }) => `${name}: ${value}`}>
                    {catData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Nincs kategória adat</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CarePathDashboard;
