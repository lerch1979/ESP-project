import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Paper, Typography, CircularProgress, Alert,
  ToggleButton, ToggleButtonGroup, Chip
} from '@mui/material';
import { Timeline, TrendingUp } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { wellmindAPI } from '../../services/api';

const TrendsAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(90);

  useEffect(() => { load(); }, [period]);

  const load = async () => {
    try {
      setLoading(true);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await wellmindAPI.getTrends(startDate, endDate);
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Nem sikerült betölteni');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;

  const pulseTrends = data?.pulse_trends || [];
  const riskTrends = data?.risk_trends || [];

  // Aggregate risk trends by quarter
  const riskByQuarter = {};
  riskTrends.forEach(r => {
    if (!riskByQuarter[r.quarter]) riskByQuarter[r.quarter] = { quarter: r.quarter, green: 0, yellow: 0, red: 0 };
    riskByQuarter[r.quarter][r.risk_level] = parseInt(r.count);
  });
  const riskChartData = Object.values(riskByQuarter);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          <Timeline sx={{ mr: 1, verticalAlign: 'middle' }} />
          Trend elemzés
        </Typography>
        <ToggleButtonGroup value={period} exclusive onChange={(_, v) => v && setPeriod(v)} size="small">
          <ToggleButton value={30}>30 nap</ToggleButton>
          <ToggleButton value={60}>60 nap</ToggleButton>
          <ToggleButton value={90}>90 nap</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={3}>
        {/* Pulse Trends */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Heti átlagos hangulat és stressz</Typography>
            {pulseTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={pulseTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tickFormatter={d => d?.substring(5, 10)} />
                  <YAxis yAxisId="mood" domain={[1, 5]} label={{ value: 'Hangulat', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="stress" orientation="right" domain={[1, 10]} label={{ value: 'Stressz', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="mood" type="monotone" dataKey="avg_mood" name="Átl. hangulat" stroke="#4caf50" strokeWidth={2} dot={{ r: 4 }} />
                  <Line yAxisId="stress" type="monotone" dataKey="avg_stress" name="Átl. stressz" stroke="#f44336" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Nincs adat a kiválasztott időszakra</Typography>
            )}
            {pulseTrends.length > 0 && (
              <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                <Chip label={`${pulseTrends.length} hét adat`} variant="outlined" size="small" />
                <Chip label={`Átl. részvétel: ${Math.round(pulseTrends.reduce((s, p) => s + parseInt(p.participants || 0), 0) / pulseTrends.length)} fő/hét`} variant="outlined" size="small" />
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Risk Distribution Over Time */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Kockázati eloszlás negyedévenként</Typography>
            {riskChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={riskChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarter" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="green" name="Egészséges" fill="#4caf50" stackId="risk" />
                  <Bar dataKey="yellow" name="Figyelendő" fill="#ff9800" stackId="risk" />
                  <Bar dataKey="red" name="Magas kockázat" fill="#f44336" stackId="risk" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Nincs értékelési adat</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default TrendsAnalytics;
