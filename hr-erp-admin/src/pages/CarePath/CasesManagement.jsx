import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip, Select, MenuItem, FormControl, InputLabel,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Divider, Rating
} from '@mui/material';
import { Folder, Visibility } from '@mui/icons-material';
import { carepathAPI } from '../../services/api';
import { toast } from 'react-toastify';

const STATUS_COLORS = { open: 'info', assigned: 'primary', in_progress: 'warning', resolved: 'success', closed: 'default' };
const STATUS_LABELS = { open: 'Nyitott', assigned: 'Kiosztva', in_progress: 'Folyamatban', resolved: 'Megoldva', closed: 'Lezárva' };
const URGENCY_COLORS = { low: 'success', medium: 'info', high: 'warning', crisis: 'error' };
const URGENCY_LABELS = { low: 'Alacsony', medium: 'Közepes', high: 'Magas', crisis: 'Krízis' };

const CasesManagement = () => {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => { load(); }, [statusFilter]);

  const load = async () => {
    try {
      setLoading(true);
      // Use the usage stats to get case info — admin cases endpoint
      const response = await carepathAPI.getUsageStats(
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        new Date().toISOString().split('T')[0]
      );
      // For now, show the stats data; in production, use admin/cases endpoint
      setCases(response.data || []);
    } catch (err) {
      toast.error('Nem sikerült betölteni');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          <Folder sx={{ mr: 1, verticalAlign: 'middle' }} />
          Esetek kezelése
        </Typography>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Státusz</InputLabel>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} label="Státusz">
            <MenuItem value="">Mind</MenuItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : cases.length === 0 ? (
        <Alert severity="info">Nincs megjeleníthető eset. Az esetek a CarePath API-n keresztül érhetők el.</Alert>
      ) : (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Havi összesítés</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Hónap</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Nyitott</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Lezárt</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Aktív</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Munkamenetek</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Kihasználtság</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Elégedettség</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cases.map((row, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{row.stat_month?.substring(0, 7)}</TableCell>
                    <TableCell><Chip label={row.total_cases_opened || 0} size="small" color="info" /></TableCell>
                    <TableCell><Chip label={row.total_cases_closed || 0} size="small" color="success" /></TableCell>
                    <TableCell><Chip label={row.total_cases_active || 0} size="small" color="warning" /></TableCell>
                    <TableCell>{row.total_sessions_held || 0}</TableCell>
                    <TableCell>{row.utilization_rate ? `${row.utilization_rate}%` : '—'}</TableCell>
                    <TableCell>
                      {row.avg_satisfaction_rating ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Rating value={parseFloat(row.avg_satisfaction_rating)} readOnly size="small" precision={0.1} />
                          <Typography variant="body2">{parseFloat(row.avg_satisfaction_rating).toFixed(1)}</Typography>
                        </Box>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
};

export default CasesManagement;
