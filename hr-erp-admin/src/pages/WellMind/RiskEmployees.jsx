import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip, Button, Select, MenuItem, FormControl, InputLabel,
  Alert, CircularProgress, LinearProgress, Tooltip
} from '@mui/material';
import { Warning, Email, Refresh } from '@mui/icons-material';
import { wellmindAPI } from '../../services/api';

const RiskEmployees = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [riskLevel, setRiskLevel] = useState('red');

  useEffect(() => { load(); }, [riskLevel]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await wellmindAPI.getRiskEmployees(riskLevel);
      setEmployees(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Nem sikerült betölteni');
    } finally {
      setLoading(false);
    }
  };

  const riskColor = (level) => ({ red: 'error', yellow: 'warning', green: 'success' }[level] || 'default');

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          <Warning sx={{ mr: 1, verticalAlign: 'middle', color: '#f44336' }} />
          Kockázatos munkavállalók
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Kockázati szint</InputLabel>
            <Select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} label="Kockázati szint">
              <MenuItem value="red">Magas kockázat</MenuItem>
              <MenuItem value="yellow">Közepes kockázat</MenuItem>
            </Select>
          </FormControl>
          <Button startIcon={<Refresh />} onClick={load} variant="outlined" size="small">Frissítés</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 600 }}>Kockázat</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Fluktuáció kockázat</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kiégés</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Elköteleződés</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Trend</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kockázati tényezők</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Nincs munkavállaló ebben a kategóriában</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp, i) => (
                  <TableRow key={i} hover>
                    <TableCell>
                      <Chip label={emp.risk_level?.toUpperCase()} color={riskColor(emp.risk_level)} size="small" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress variant="determinate" value={emp.turnover_risk_score || 0} color={riskColor(emp.risk_level)} sx={{ width: 80, height: 8, borderRadius: 4 }} />
                        <Typography variant="body2">{Math.round(emp.turnover_risk_score || 0)}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{emp.latest_burnout ? `${Math.round(emp.latest_burnout)}/100` : '—'}</TableCell>
                    <TableCell>{emp.latest_engagement ? `${Math.round(emp.latest_engagement)}/100` : '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={emp.burnout_progression_trend === 'declining' ? '↘ Romló' : emp.burnout_progression_trend === 'improving' ? '↗ Javuló' : '→ Stabil'}
                        size="small"
                        color={emp.burnout_progression_trend === 'declining' ? 'error' : emp.burnout_progression_trend === 'improving' ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {emp.top_risk_factors && Array.isArray(emp.top_risk_factors) ? (
                        emp.top_risk_factors.slice(0, 2).map((f, j) => (
                          <Chip key={j} label={f.factor?.replace(/_/g, ' ')} size="small" sx={{ mr: 0.5, mb: 0.5 }} variant="outlined" />
                        ))
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default RiskEmployees;
