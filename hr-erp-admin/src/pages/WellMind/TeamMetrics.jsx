import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Paper, Typography, CircularProgress, Alert, Card,
  CardContent, Chip, LinearProgress
} from '@mui/material';
import { Groups, TrendingUp, TrendingDown, TrendingFlat } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { wellmindAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const TeamMetrics = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await wellmindAPI.getTeamMetrics(user?.id || 'me', startDate, endDate);
      setMetrics(response.data || []);
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Nincs elegendő adat a megjelenítéshez (minimum 5 munkavállaló szükséges az adatvédelmi szabályok miatt).');
      } else {
        setError(err.response?.data?.message || 'Nem sikerült betölteni a csapat metrikákat');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;

  const latest = metrics[0];
  const chartData = [...metrics].reverse();

  const trendIcon = (val) => {
    if (!val || val === 0) return <TrendingFlat color="action" />;
    return val > 0 ? <TrendingUp color="success" /> : <TrendingDown color="error" />;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        <Groups sx={{ mr: 1, verticalAlign: 'middle' }} />
        Csapat wellbeing metrikák
      </Typography>

      {error ? (
        <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>
      ) : metrics.length === 0 ? (
        <Alert severity="info">Nincs elegendő adat a csapat metrikák megjelenítéséhez.</Alert>
      ) : (
        <>
          {/* Summary Cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2">Csapat létszám</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>{latest?.employee_count || 0}</Typography>
                  <Chip label="Adatvédelmi szabály: min. 5 fő" size="small" variant="outlined" sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2">Átl. hangulat</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>{latest?.avg_mood_score || '—'}</Typography>
                    <Typography variant="body2" color="text.secondary">/5</Typography>
                    {trendIcon(latest?.mood_trend)}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2">Átl. stressz</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>{latest?.avg_stress_level || '—'}</Typography>
                    <Typography variant="body2" color="text.secondary">/10</Typography>
                    {trendIcon(latest?.stress_trend ? -latest.stress_trend : null)}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" variant="body2">Pulse részvétel</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>{latest?.pulse_response_rate ? `${Math.round(latest.pulse_response_rate)}%` : '—'}</Typography>
                  <LinearProgress variant="determinate" value={latest?.pulse_response_rate || 0} sx={{ mt: 1 }} />
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Risk Distribution */}
          {latest?.risk_distribution && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Kockázati eloszlás</Typography>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {['green', 'yellow', 'red'].map(level => {
                  const count = typeof latest.risk_distribution === 'object' ? (latest.risk_distribution[level] || 0) : 0;
                  const color = { green: 'success', yellow: 'warning', red: 'error' }[level];
                  const label = { green: 'Egészséges', yellow: 'Figyelendő', red: 'Magas kockázat' }[level];
                  return (
                    <Box key={level} sx={{ textAlign: 'center', minWidth: 100 }}>
                      <Chip label={label} color={color} sx={{ mb: 1 }} />
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>{count}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </Paper>
          )}

          {/* Trend Chart */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Heti trend (utolsó 90 nap)</Typography>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric_date" tickFormatter={d => d?.substring(5, 10)} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avg_mood_score" name="Hangulat (1-5)" stroke="#4caf50" strokeWidth={2} />
                <Line type="monotone" dataKey="avg_stress_level" name="Stressz (1-10)" stroke="#f44336" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </>
      )}
    </Box>
  );
};

export default TeamMetrics;
