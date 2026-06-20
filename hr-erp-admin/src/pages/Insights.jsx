import React, { useState, useEffect } from 'react';
import {
  Box, Grid, Paper, Typography, CircularProgress, Alert, Chip, Stack,
} from '@mui/material';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import { analyticsAPI } from '../services/api';

// Read-only BI Insights — AGGREGATE / PROCESS metrics only. No per-employee
// scoring or assignee-performance ranking (ticket metrics are by status / age /
// throughput — the process, never the individual).

const COLORS = ['#2e7d32', '#1565c0', '#f9a825', '#6a1b9a', '#00838f', '#c62828', '#ad1457', '#558b2f'];

function KpiCard({ label, value, sub, color = '#2e7d32' }) {
  return (
    <Paper sx={{ p: 2, height: '100%', borderLeft: `4px solid ${color}` }} elevation={1}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5, color }}>{value}</Typography>
      {sub != null && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

function ChartCard({ title, subtitle, children, height = 280 }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }} elevation={1}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      <Box sx={{ height, mt: 1 }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </Box>
    </Paper>
  );
}

const weekLabel = (w) => (w || '').slice(5); // YYYY-MM-DD → MM-DD

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    analyticsAPI.getOverview()
      .then((res) => { if (active) setData(res.data); })
      .catch((e) => { if (active) setError(e?.response?.data?.message || 'Az adatok betöltése nem sikerült.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;
  }

  const k = data.kpis;
  const utilTop = [...data.utilization].slice(0, 12); // already sorted by pct desc

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Insights</Typography>
        <Typography variant="caption" color="text.secondary">
          Aggregált, csak-olvasható elemzés · {new Date(data.generatedAt).toLocaleString('hu-HU')}
        </Typography>
      </Stack>

      {/* KPI row */}
      <Grid container spacing={2} sx={{ mb: 1 }}>
        <Grid item xs={6} md={2}><KpiCard label="Aktív munkavállaló" value={k.activeEmployees} color="#2e7d32" /></Grid>
        <Grid item xs={6} md={2}><KpiCard label="Kihasználtság" value={`${k.occupancyPct}%`} sub={`${k.occupiedBeds} / ${k.totalBeds} ágy`} color="#1565c0" /></Grid>
        <Grid item xs={6} md={2}><KpiCard label="Nyitott hibajegy" value={k.openTickets} color="#f9a825" /></Grid>
        <Grid item xs={6} md={2}><KpiCard label="Lejár ≤30 nap" value={k.expiring30d} sub="vízum + szerződés" color="#c62828" /></Grid>
        <Grid item xs={6} md={2}><KpiCard label="SLA túllépés" value={data.ticketAge.slaBreached} sub="nyitott, lejárt határidő" color="#ad1457" /></Grid>
        <Grid item xs={6} md={2}><KpiCard label="Szabad ágy" value={Math.max(0, k.totalBeds - k.occupiedBeds)} color="#00838f" /></Grid>
      </Grid>

      <Grid container spacing={2}>
        {/* Expiry horizon */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Lejárati horizont" subtitle="Vízum + szerződés, következő 30 / 60 / 90 nap">
            <BarChart data={data.expiryHorizon}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="horizon" /><YAxis allowDecimals={false} />
              <Tooltip /><Legend />
              <Bar dataKey="visa" name="Vízum" fill="#1565c0" />
              <Bar dataKey="contract" name="Szerződés" fill="#f9a825" />
            </BarChart>
          </ChartCard>
        </Grid>

        {/* Ticket age */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Nyitott hibajegyek kora" subtitle={`SLA túllépés: ${data.ticketAge.slaBreached}`}>
            <BarChart data={data.ticketAge.buckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" /><YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Hibajegy" fill="#2e7d32">
                {data.ticketAge.buckets.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ChartCard>
        </Grid>

        {/* Throughput */}
        <Grid item xs={12}>
          <ChartCard title="Hibajegy átfutás" subtitle="Létrehozott vs. lezárt / hét (utolsó ~10 hét)" height={260}>
            <LineChart data={data.throughput.map((t) => ({ ...t, label: weekLabel(t.week) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" /><YAxis allowDecimals={false} />
              <Tooltip /><Legend />
              <Line type="monotone" dataKey="created" name="Létrehozott" stroke="#1565c0" strokeWidth={2} />
              <Line type="monotone" dataKey="closed" name="Lezárt" stroke="#2e7d32" strokeWidth={2} />
            </LineChart>
          </ChartCard>
        </Grid>

        {/* Workforce by nationality */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Összetétel — nemzetiség" subtitle="Top 8">
            <BarChart data={data.workforce.byNationality} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={90} />
              <Tooltip />
              <Bar dataKey="count" name="Fő" fill="#6a1b9a" />
            </BarChart>
          </ChartCard>
        </Grid>

        {/* Workforce by accommodation */}
        <Grid item xs={12} md={6}>
          <ChartCard title="Összetétel — szállás" subtitle="Munkavállalók szállásonként (top 10)">
            <BarChart data={data.workforce.byAccommodation} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={90} />
              <Tooltip />
              <Bar dataKey="count" name="Fő" fill="#00838f" />
            </BarChart>
          </ChartCard>
        </Grid>

        {/* Accommodation utilization */}
        <Grid item xs={12}>
          <ChartCard title="Szállás kihasználtság" subtitle="Foglaltság %-ban, szállásonként" height={Math.max(220, utilTop.length * 26)}>
            <BarChart data={utilTop} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" /><YAxis type="category" dataKey="name" width={120} />
              <Tooltip formatter={(v, n, p) => [`${v}% (${p.payload.occupied}/${p.payload.capacity})`, 'Kihasználtság']} />
              <Bar dataKey="pct" name="Kihasználtság">
                {utilTop.map((r, i) => (
                  <Cell key={i} fill={r.pct >= 95 ? '#c62828' : r.pct >= 70 ? '#2e7d32' : '#f9a825'} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
        </Grid>
      </Grid>

      {data.kpis.totalBeds === 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          A diagramok valós HR-adat betöltése után telnek meg — jelenleg kevés az adat.
        </Alert>
      )}
    </Box>
  );
}
