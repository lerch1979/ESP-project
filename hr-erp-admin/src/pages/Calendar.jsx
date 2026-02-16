import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Button,
  ButtonGroup,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import {
  Login as LoginIcon,
  Logout as LogoutIcon,
  CreditCard as CreditCardIcon,
  Description as DescriptionIcon,
  Assignment as AssignmentIcon,
  CalendarMonth as CalendarMonthIcon,
  FileDownload as FileDownloadIcon,
  Warning as WarningIcon,
  ErrorOutline as ErrorOutlineIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { calendarAPI } from '../services/api';
import Layout from '../components/Layout';

// ============================================================
// Constants
// ============================================================

const EVENT_TYPES = [
  { key: 'checkin', label: 'Check-in', icon: <LoginIcon fontSize="small" />, color: '#3b82f6' },
  { key: 'checkout', label: 'Check-out', icon: <LogoutIcon fontSize="small" />, color: '#8b5cf6' },
  { key: 'visa_expiry', label: 'Vízum lejárat', icon: <CreditCardIcon fontSize="small" />, color: '#f59e0b' },
  { key: 'contract_expiry', label: 'Szerződés lejárat', icon: <DescriptionIcon fontSize="small" />, color: '#10b981' },
  { key: 'ticket_deadline', label: 'Hibajegy határidő', icon: <AssignmentIcon fontSize="small" />, color: '#ef4444' },
];

const URGENCY_CONFIG = {
  critical: { label: 'Kritikus', color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
  warning: { label: 'Figyelmeztetés', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  normal: { label: 'Normál', color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
  past: { label: 'Lejárt', color: '#9e9e9e', bg: 'rgba(158,158,158,0.08)' },
};

const DATE_RANGE_PRESETS = [
  { key: 'this_month', label: 'Ez a hónap' },
  { key: 'next_month', label: 'Következő hónap' },
  { key: 'next_3_months', label: 'Következő 3 hónap' },
  { key: 'custom', label: 'Egyéni' },
];

// ============================================================
// Helper functions
// ============================================================

function computeDateParams(rangeKey, customFrom, customTo) {
  const now = new Date();
  switch (rangeKey) {
    case 'this_month': {
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      return { month: m, year: y };
    }
    case 'next_month': {
      const future = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { month: future.getMonth() + 1, year: future.getFullYear() };
    }
    case 'next_3_months': {
      const from = now.toISOString().split('T')[0];
      const to = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());
      return { date_from: from, date_to: to.toISOString().split('T')[0] };
    }
    case 'custom': {
      if (customFrom && customTo) {
        return { date_from: customFrom, date_to: customTo };
      }
      return {};
    }
    default:
      return {};
  }
}

function getEventTypeConfig(type) {
  return EVENT_TYPES.find(t => t.key === type) || EVENT_TYPES[0];
}

// ============================================================
// Component
// ============================================================

function Calendar() {
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('next_3_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedTypes, setSelectedTypes] = useState(EVENT_TYPES.map(t => t.key));

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const dateParams = computeDateParams(dateRange, customFrom, customTo);
      if (dateRange === 'custom' && (!customFrom || !customTo)) {
        setLoading(false);
        return;
      }
      const params = {
        ...dateParams,
        event_type: selectedTypes.join(','),
      };
      const result = await calendarAPI.getEvents(params);
      if (result.success) {
        setEvents(result.data.events);
        setSummary(result.data.summary);
      }
    } catch (error) {
      console.error('Calendar load error:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange, customFrom, customTo, selectedTypes]);

  useEffect(() => {
    if (dateRange !== 'custom') {
      loadEvents();
    }
  }, [dateRange, selectedTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEventType = (key) => {
    setSelectedTypes(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter(t => t !== key);
      }
      return [...prev, key];
    });
  };

  const handleExcelExport = () => {
    const wsData = events.map(ev => ({
      'Dátum': ev.event_date,
      'Típus': getEventTypeConfig(ev.type).label,
      'Név/Cím': ev.title,
      'Leírás': ev.description,
      'Sürgősség': URGENCY_CONFIG[ev.urgency]?.label || ev.urgency,
      'Napok': ev.days_until,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Események');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `naptar_esemenyek_${today}.xlsx`);
  };

  return (
    <Layout>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CalendarMonthIcon sx={{ fontSize: 32, color: '#2c5f2d' }} />
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Naptár
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="success"
            startIcon={<FileDownloadIcon />}
            onClick={handleExcelExport}
            disabled={events.length === 0}
          >
            Excel export
          </Button>
        </Box>

        {/* Summary stat cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {EVENT_TYPES.map(type => (
            <Grid item xs={12} sm={6} md key={type.key}>
              <Card sx={{ borderTop: `3px solid ${type.color}` }}>
                <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{ color: type.color, mb: 0.5 }}>{React.cloneElement(type.icon, { fontSize: 'medium' })}</Box>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    {loading ? '-' : (summary[type.key] || 0)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {type.label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
          <Grid item xs={12} sm={6} md>
            <Card sx={{ borderTop: '3px solid #ef4444' }}>
              <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                <ErrorOutlineIcon sx={{ color: '#ef4444', mb: 0.5 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#ef4444' }}>
                  {loading ? '-' : (summary.critical || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Kritikus
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md>
            <Card sx={{ borderTop: '3px solid #f59e0b' }}>
              <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                <WarningIcon sx={{ color: '#f59e0b', mb: 0.5 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#f59e0b' }}>
                  {loading ? '-' : (summary.warning || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Figyelmeztetés
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Date range selector */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Időszak
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <ButtonGroup variant="outlined" size="small">
              {DATE_RANGE_PRESETS.map(preset => (
                <Button
                  key={preset.key}
                  variant={dateRange === preset.key ? 'contained' : 'outlined'}
                  onClick={() => setDateRange(preset.key)}
                  sx={dateRange === preset.key ? { bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#3d6b4a' } } : {}}
                >
                  {preset.label}
                </Button>
              ))}
            </ButtonGroup>
            {dateRange === 'custom' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  type="date"
                  size="small"
                  label="Kezdő dátum"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                <TextField
                  type="date"
                  size="small"
                  label="Záró dátum"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 170 }}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={loadEvents}
                  disabled={!customFrom || !customTo}
                  sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#3d6b4a' } }}
                >
                  Lekérdezés
                </Button>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Event type filter chips */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
            Esemény típus szűrő
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {EVENT_TYPES.map(type => {
              const isActive = selectedTypes.includes(type.key);
              return (
                <Chip
                  key={type.key}
                  icon={type.icon}
                  label={`${type.label} (${summary[type.key] || 0})`}
                  variant={isActive ? 'filled' : 'outlined'}
                  onClick={() => toggleEventType(type.key)}
                  sx={isActive ? {
                    bgcolor: type.color,
                    color: '#fff',
                    '& .MuiChip-icon': { color: '#fff' },
                    '&:hover': { bgcolor: type.color, opacity: 0.9 },
                  } : {
                    borderColor: type.color,
                    color: type.color,
                    '& .MuiChip-icon': { color: type.color },
                  }}
                />
              );
            })}
          </Box>
        </Paper>

        {/* Events table */}
        <Paper sx={{ overflow: 'hidden' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress sx={{ color: '#2c5f2d' }} />
            </Box>
          ) : events.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CalendarMonthIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
              <Typography color="text.secondary">
                Nincs esemény a kiválasztott időszakban
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Dátum</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Típus</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Név/Cím</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Leírás</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Sürgősség</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }} align="right">Napok</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((ev, idx) => {
                    const typeConfig = getEventTypeConfig(ev.type);
                    const urgencyConfig = URGENCY_CONFIG[ev.urgency] || URGENCY_CONFIG.normal;
                    return (
                      <TableRow
                        key={`${ev.type}-${ev.related_entity_id}-${idx}`}
                        sx={{
                          bgcolor: urgencyConfig.bg,
                          borderLeft: `4px solid ${typeConfig.color}`,
                          '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                        }}
                      >
                        <TableCell sx={{ fontWeight: 500 }}>
                          {ev.event_date}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={typeConfig.icon}
                            label={typeConfig.label}
                            size="small"
                            sx={{
                              bgcolor: typeConfig.color,
                              color: '#fff',
                              '& .MuiChip-icon': { color: '#fff' },
                              fontWeight: 500,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>
                          {ev.title}
                        </TableCell>
                        <TableCell>
                          {ev.description}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={urgencyConfig.label}
                            size="small"
                            sx={{
                              bgcolor: urgencyConfig.color,
                              color: '#fff',
                              fontWeight: 500,
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {ev.days_until > 0 ? `${ev.days_until} nap` : ev.days_until === 0 ? 'Ma' : `${Math.abs(ev.days_until)} napja`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </Layout>
  );
}

export default Calendar;
