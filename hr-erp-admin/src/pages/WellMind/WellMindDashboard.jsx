import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress, Alert,
  Chip, LinearProgress, Paper
} from '@mui/material';
import { Psychology, Warning, People, TrendingUp } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { wellmindAPI } from '../../services/api';

const RISK_COLORS = { green: '#4caf50', yellow: '#ff9800', red: '#f44336' };

const StatCard = ({ title, value, subtitle, color, icon }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="text.secondary" variant="body2">{title}</Typography>
          <Typography variant="h3" sx={{ fontWeight: 700, my: 0.5, color: color || 'text.primary' }}>{value}</Typography>
          {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: (color || '#6366f1') + '20' }}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

const WellMindDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await wellmindAPI.getDashboard();
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Nem sikerült betölteni a dashboardot');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;
  if (!data) return null;

  const { overview, risk_distribution, recent_metrics, top_risk_employees, wellbeing_index } = data;

  const riskData = [
    { name: 'Egészséges', value: risk_distribution?.green || 0, color: RISK_COLORS.green },
    { name: 'Figyelendő', value: risk_distribution?.yellow || 0, color: RISK_COLORS.yellow },
    { name: 'Magas kockázat', value: risk_distribution?.red || 0, color: RISK_COLORS.red },
  ].filter(d => d.value > 0);

  const indexValue = wellbeing_index?.wellbeing_index || 0;
  const indexColor = indexValue >= 70 ? '#4caf50' : indexValue >= 50 ? '#ff9800' : '#f44336';

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        <Psychology sx={{ mr: 1, verticalAlign: 'middle' }} />
        WellMind Dashboard
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Wellbeing Index"
            value={`${indexValue}/100`}
            subtitle={wellbeing_index?.status === 'healthy' ? 'Egészséges' : wellbeing_index?.status === 'monitor' ? 'Figyelendő' : 'Beavatkozás szükséges'}
            color={indexColor}
            icon={<Psychology sx={{ fontSize: 32, color: indexColor }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Aktív felhasználók (30 nap)"
            value={overview?.active_users || 0}
            subtitle={`Átl. hangulat: ${overview?.avg_mood || '-'}/5`}
            icon={<People sx={{ fontSize: 32, color: '#6366f1' }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Magas kockázat"
            value={risk_distribution?.red || 0}
            subtitle="Azonnali figyelmet igényel"
            color="#f44336"
            icon={<Warning sx={{ fontSize: 32, color: '#f44336' }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Átl. stressz szint"
            value={`${overview?.avg_stress || '-'}/10`}
            subtitle="Alacsonyabb = jobb"
            icon={<TrendingUp sx={{ fontSize: 32, color: '#ff9800' }} />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Risk Distribution Pie */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: 360 }}>
            <Typography variant="h6" gutterBottom>Kockázati eloszlás</Typography>
            {riskData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                    {riskData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>Nincs elegendő adat</Typography>
            )}
          </Paper>
        </Grid>

        {/* Weekly Trend */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: 360 }}>
            <Typography variant="h6" gutterBottom>Heti trend</Typography>
            {recent_metrics && recent_metrics.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={[...recent_metrics].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="metric_date" tickFormatter={d => d?.substring(5, 10)} />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg_mood_score" name="Hangulat" stroke="#4caf50" strokeWidth={2} />
                  <Line type="monotone" dataKey="avg_stress_level" name="Stressz" stroke="#f44336" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>Nincs elegendő adat</Typography>
            )}
          </Paper>
        </Grid>

        {/* Top Risk Employees */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Legmagasabb kockázatú munkavállalók</Typography>
            {top_risk_employees && top_risk_employees.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {top_risk_employees.slice(0, 5).map((emp, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, bgcolor: '#fafafa', borderRadius: 1 }}>
                    <Chip label={emp.risk_level?.toUpperCase()} color={emp.risk_level === 'red' ? 'error' : 'warning'} size="small" />
                    <Typography sx={{ flex: 1 }}>Munkavállaló #{i + 1}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Fluktuáció kockázat: <strong>{Math.round(emp.turnover_risk_score)}%</strong>
                    </Typography>
                    <LinearProgress variant="determinate" value={emp.turnover_risk_score} color={emp.risk_level === 'red' ? 'error' : 'warning'} sx={{ width: 100 }} />
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography color="text.secondary">Nincs magas kockázatú munkavállaló</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default WellMindDashboard;
