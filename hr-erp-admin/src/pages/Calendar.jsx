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
  TableHead,
  TableRow,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  IconButton,
  Menu,
  Switch,
  Autocomplete,
  Snackbar,
  Alert,
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
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  WorkOutline as WorkOutlineIcon,
  LocalHospital as LocalHospitalIcon,
  Event as EventIcon,
  PersonOutline as PersonOutlineIcon,
  Google as GoogleIcon,
  Sync as SyncIcon,
  LinkOff as LinkOffIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { calendarAPI, employeesAPI, googleCalendarAPI } from '../services/api';
import ResponsiveTable from '../components/ResponsiveTable';

// ============================================================
// Constants
// ============================================================

const ADMIN_ROLE_SLUGS = ['superadmin', 'data_controller', 'admin'];
const ADMIN_ROLE_NAMES = ['Szuperadmin', 'Adatkezelő', 'Admin'];

const EVENT_TYPES = [
  { key: 'checkin', label: 'Check-in', icon: <LoginIcon fontSize="small" />, color: '#3b82f6' },
  { key: 'checkout', label: 'Check-out', icon: <LogoutIcon fontSize="small" />, color: '#8b5cf6' },
  { key: 'visa_expiry', label: 'Vízum lejárat', icon: <CreditCardIcon fontSize="small" />, color: '#f59e0b' },
  { key: 'contract_expiry', label: 'Szerződés lejárat', icon: <DescriptionIcon fontSize="small" />, color: '#10b981' },
  { key: 'ticket_deadline', label: 'Hibajegy határidő', icon: <AssignmentIcon fontSize="small" />, color: '#ef4444' },
  { key: 'shift', label: 'Műszak', icon: <WorkOutlineIcon fontSize="small" />, color: '#06b6d4' },
  { key: 'medical_appointment', label: 'Orvosi vizsgálat', icon: <LocalHospitalIcon fontSize="small" />, color: '#ec4899' },
  { key: 'personal_event', label: 'Személyes esemény', icon: <EventIcon fontSize="small" />, color: '#8b5cf6' },
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

const SHIFT_TYPES = [
  { value: 'morning', label: 'Reggeli' },
  { value: 'afternoon', label: 'Délutáni' },
  { value: 'night', label: 'Éjszakai' },
  { value: 'full_day', label: 'Egész napos' },
];

const APPOINTMENT_TYPES = [
  { value: 'general', label: 'Általános' },
  { value: 'specialist', label: 'Szakorvos' },
  { value: 'emergency', label: 'Sürgősségi' },
  { value: 'dental', label: 'Fogorvos' },
  { value: 'eye', label: 'Szemész' },
  { value: 'other', label: 'Egyéb' },
];

const PERSONAL_EVENT_TYPES = [
  { value: 'birthday', label: 'Születésnap' },
  { value: 'meeting', label: 'Megbeszélés' },
  { value: 'reminder', label: 'Emlékeztető' },
  { value: 'holiday', label: 'Szabadság' },
  { value: 'other', label: 'Egyéb' },
];

const SHIFT_TYPE_LABELS = Object.fromEntries(SHIFT_TYPES.map(s => [s.value, s.label]));
const APPOINTMENT_TYPE_LABELS = Object.fromEntries(APPOINTMENT_TYPES.map(a => [a.value, a.label]));
const PERSONAL_EVENT_TYPE_LABELS = Object.fromEntries(PERSONAL_EVENT_TYPES.map(p => [p.value, p.label]));

// ============================================================
// Helpers
// ============================================================

function userIsAdmin() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    // Check roleSlugs first (new login sessions), fall back to roles (Hungarian names from older sessions)
    if (user.roleSlugs?.length) {
      return user.roleSlugs.some(r => ADMIN_ROLE_SLUGS.includes(r));
    }
    if (user.roles?.length) {
      return user.roles.some(r => ADMIN_ROLE_SLUGS.includes(r) || ADMIN_ROLE_NAMES.includes(r));
    }
    return false;
  } catch {
    return false;
  }
}

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
      if (customFrom && customTo) return { date_from: customFrom, date_to: customTo };
      return {};
    }
    default:
      return {};
  }
}

function getEventTypeConfig(type) {
  return EVENT_TYPES.find(t => t.key === type) || EVENT_TYPES[0];
}

function formatDescription(ev) {
  if (ev.type === 'shift') {
    const parts = (ev.description || '').replace('Műszak: ', '').split(' - ');
    const shiftType = SHIFT_TYPE_LABELS[parts[0]] || parts[0];
    return parts.length > 1 ? `${shiftType} - ${parts[1]}` : shiftType;
  }
  if (ev.type === 'medical_appointment') {
    const parts = (ev.description || '').replace('Orvosi: ', '').split(' - ');
    const apptType = APPOINTMENT_TYPE_LABELS[parts[0]] || parts[0];
    return parts.length > 1 ? `${apptType} - ${parts[1]}` : apptType;
  }
  return ev.description;
}

const EDITABLE_TYPES = ['shift', 'medical_appointment', 'personal_event'];

// ============================================================
// Component
// ============================================================

function Calendar() {
  const admin = userIsAdmin();

  // Data state
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('next_3_months');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedTypes, setSelectedTypes] = useState(EVENT_TYPES.map(t => t.key));

  // Personal view (admin only)
  const [personalView, setPersonalView] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Add event menu
  const [addMenuAnchor, setAddMenuAnchor] = useState(null);

  // Dialogs
  const [shiftDialog, setShiftDialog] = useState(false);
  const [medicalDialog, setMedicalDialog] = useState(false);
  const [personalDialog, setPersonalDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Forms
  const [shiftForm, setShiftForm] = useState({
    employee_id: '', shift_date: '', shift_start_time: '', shift_end_time: '', shift_type: 'morning', location: '', notes: '',
  });
  const [medicalForm, setMedicalForm] = useState({
    employee_id: '', appointment_date: '', appointment_time: '', doctor_name: '', clinic_location: '', appointment_type: 'general', notes: '',
  });
  const [personalForm, setPersonalForm] = useState({
    employee_id: '', event_date: '', event_time: '', event_type: 'meeting', title: '', description: '', all_day: false,
  });

  // Snackbar
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Google Calendar disconnect confirmation
  const [googleDisconnectConfirm, setGoogleDisconnectConfirm] = useState(false);

  // Google Calendar state
  const [googleStatus, setGoogleStatus] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadGoogleStatus = useCallback(async () => {
    try {
      const result = await googleCalendarAPI.getStatus();
      if (result.success) setGoogleStatus(result.data);
    } catch {
      setGoogleStatus(null);
    }
  }, []);

  useEffect(() => { loadGoogleStatus(); }, [loadGoogleStatus]);

  // Listen for popup postMessage
  useEffect(() => {
    const handler = (event) => {
      if (event.data?.type === 'google-auth') {
        if (event.data.status === 'success') {
          showSnack('Google Naptár sikeresen csatlakoztatva!');
          loadGoogleStatus();
        } else {
          showSnack('Google Naptár csatlakozás sikertelen: ' + (event.data.reason || 'Ismeretlen hiba'), 'error');
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleConnect = async () => {
    setGoogleLoading(true);
    try {
      const result = await googleCalendarAPI.getAuthUrl();
      if (result.success && result.data.authUrl) {
        window.open(result.data.authUrl, 'google-auth', 'width=500,height=600,left=200,top=100');
      }
    } catch (err) {
      showSnack('Nem sikerült elindítani a Google hitelesítést', 'error');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSync = async () => {
    setSyncing(true);
    try {
      const result = await googleCalendarAPI.triggerSync();
      if (result.success) {
        showSnack('Google Naptár szinkronizálás sikeres!');
        loadGoogleStatus();
        loadEvents();
      }
    } catch (err) {
      showSnack(err.response?.data?.message || 'Szinkronizálási hiba', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    try {
      await googleCalendarAPI.disconnect();
      setGoogleStatus(null);
      setGoogleDisconnectConfirm(false);
      showSnack('Google Naptár lecsatlakoztatva');
    } catch (err) {
      setGoogleDisconnectConfirm(false);
      showSnack('Lecsatlakoztatási hiba', 'error');
    }
  };

  // Load employees for admin selectors
  useEffect(() => {
    if (admin) {
      employeesAPI.getAll({ limit: 1000 }).then(res => {
        if (res.success) setEmployees(res.data.employees || res.data || []);
      }).catch(() => {});
    }
  }, [admin]);

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
      if (admin && personalView && selectedEmployee) {
        params.employee_id = selectedEmployee.id;
      }
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
  }, [dateRange, customFrom, customTo, selectedTypes, admin, personalView, selectedEmployee]);

  useEffect(() => {
    if (dateRange !== 'custom') {
      loadEvents();
    }
  }, [dateRange, selectedTypes, personalView, selectedEmployee]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEventType = (key) => {
    setSelectedTypes(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
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
      'Leírás': formatDescription(ev),
      'Sürgősség': URGENCY_CONFIG[ev.urgency]?.label || ev.urgency,
      'Napok': ev.days_until,
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Események');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `naptar_esemenyek_${today}.xlsx`);
  };

  const showSnack = (message, severity = 'success') => setSnack({ open: true, message, severity });

  // ---- Dialog open handlers ----

  const openShiftDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setShiftForm({
        employee_id: '', shift_date: item.event_date || '', shift_start_time: '', shift_end_time: '',
        shift_type: 'morning', location: '', notes: '',
      });
    } else {
      setEditingItem(null);
      setShiftForm({ employee_id: '', shift_date: '', shift_start_time: '', shift_end_time: '', shift_type: 'morning', location: '', notes: '' });
    }
    setShiftDialog(true);
    setAddMenuAnchor(null);
  };

  const openMedicalDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setMedicalForm({
        employee_id: '', appointment_date: item.event_date || '', appointment_time: '', doctor_name: '',
        clinic_location: '', appointment_type: 'general', notes: '',
      });
    } else {
      setEditingItem(null);
      setMedicalForm({ employee_id: '', appointment_date: '', appointment_time: '', doctor_name: '', clinic_location: '', appointment_type: 'general', notes: '' });
    }
    setMedicalDialog(true);
    setAddMenuAnchor(null);
  };

  const openPersonalDialog = (item = null) => {
    if (item) {
      setEditingItem(item);
      setPersonalForm({
        employee_id: '', event_date: item.event_date || '', event_time: '', event_type: 'meeting',
        title: item.title || '', description: '', all_day: false,
      });
    } else {
      setEditingItem(null);
      setPersonalForm({ employee_id: '', event_date: '', event_time: '', event_type: 'meeting', title: '', description: '', all_day: false });
    }
    setPersonalDialog(true);
    setAddMenuAnchor(null);
  };

  // ---- CRUD handlers ----

  const handleSaveShift = async () => {
    try {
      if (editingItem) {
        await calendarAPI.updateShift(editingItem.related_entity_id, shiftForm);
        showSnack('Műszak frissítve');
      } else {
        await calendarAPI.createShift(shiftForm);
        showSnack('Műszak létrehozva');
      }
      setShiftDialog(false);
      loadEvents();
    } catch (err) {
      showSnack(err.response?.data?.message || 'Hiba történt', 'error');
    }
  };

  const handleSaveMedical = async () => {
    try {
      if (editingItem) {
        await calendarAPI.updateMedicalAppointment(editingItem.related_entity_id, medicalForm);
        showSnack('Orvosi vizsgálat frissítve');
      } else {
        await calendarAPI.createMedicalAppointment(medicalForm);
        showSnack('Orvosi vizsgálat létrehozva');
      }
      setMedicalDialog(false);
      loadEvents();
    } catch (err) {
      showSnack(err.response?.data?.message || 'Hiba történt', 'error');
    }
  };

  const handleSavePersonal = async () => {
    try {
      if (editingItem) {
        await calendarAPI.updatePersonalEvent(editingItem.related_entity_id, personalForm);
        showSnack('Személyes esemény frissítve');
      } else {
        await calendarAPI.createPersonalEvent(personalForm);
        showSnack('Személyes esemény létrehozva');
      }
      setPersonalDialog(false);
      loadEvents();
    } catch (err) {
      showSnack(err.response?.data?.message || 'Hiba történt', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const { type, related_entity_id } = deleteConfirm;
      if (type === 'shift') await calendarAPI.deleteShift(related_entity_id);
      else if (type === 'medical_appointment') await calendarAPI.deleteMedicalAppointment(related_entity_id);
      else if (type === 'personal_event') await calendarAPI.deletePersonalEvent(related_entity_id);
      showSnack('Esemény törölve');
      setDeleteConfirm(null);
      loadEvents();
    } catch (err) {
      showSnack(err.response?.data?.message || 'Törlési hiba', 'error');
      setDeleteConfirm(null);
    }
  };

  const handleEditRow = (ev) => {
    if (ev.type === 'shift') openShiftDialog(ev);
    else if (ev.type === 'medical_appointment') openMedicalDialog(ev);
    else if (ev.type === 'personal_event') openPersonalDialog(ev);
  };

  // ---- Employee selector helper for admin forms ----
  const EmployeeSelect = ({ value, onChange, label = 'Dolgozó' }) => (
    <Autocomplete
      options={employees}
      getOptionLabel={(opt) => `${opt.last_name || ''} ${opt.first_name || ''}`}
      value={employees.find(e => e.id === value) || null}
      onChange={(_, newVal) => onChange(newVal?.id || '')}
      renderInput={(params) => <TextField {...params} label={label} size="small" fullWidth required />}
      sx={{ mb: 2 }}
    />
  );

  return (
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CalendarMonthIcon sx={{ fontSize: 32, color: '#2c5f2d' }} />
            <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
              Naptár
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Add event button */}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={(e) => setAddMenuAnchor(e.currentTarget)}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#3d6b4a' } }}
            >
              Esemény hozzáadása
            </Button>
            <Menu
              anchorEl={addMenuAnchor}
              open={Boolean(addMenuAnchor)}
              onClose={() => setAddMenuAnchor(null)}
            >
              {admin && (
                <MenuItem onClick={() => openShiftDialog()}>
                  <WorkOutlineIcon sx={{ mr: 1, color: '#06b6d4' }} fontSize="small" />
                  Műszak
                </MenuItem>
              )}
              <MenuItem onClick={() => openMedicalDialog()}>
                <LocalHospitalIcon sx={{ mr: 1, color: '#ec4899' }} fontSize="small" />
                Orvosi vizsgálat
              </MenuItem>
              <MenuItem onClick={() => openPersonalDialog()}>
                <EventIcon sx={{ mr: 1, color: '#8b5cf6' }} fontSize="small" />
                Személyes esemény
              </MenuItem>
            </Menu>

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
        </Box>

        {/* Google Calendar connection */}
        <Paper sx={{ p: 2, mb: 3, border: googleStatus?.connected ? '1px solid #10b981' : '1px solid #e0e0e0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <GoogleIcon sx={{ color: googleStatus?.connected ? '#10b981' : '#9e9e9e', fontSize: 28 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  Google Naptár
                </Typography>
                {googleStatus?.connected ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircleIcon sx={{ color: '#10b981', fontSize: 16 }} />
                    <Typography variant="body2" color="text.secondary">
                      Csatlakoztatva: {googleStatus.google_email}
                      {googleStatus.last_sync_at && (
                        <> &mdash; Utolsó szinkron: {new Date(googleStatus.last_sync_at).toLocaleString('hu-HU')}</>
                      )}
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Nincs csatlakoztatva
                  </Typography>
                )}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {googleStatus?.connected ? (
                <>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                    onClick={handleGoogleSync}
                    disabled={syncing}
                    color="success"
                  >
                    {syncing ? 'Szinkronizálás...' : 'Szinkronizálás most'}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<LinkOffIcon />}
                    onClick={() => setGoogleDisconnectConfirm(true)}
                    color="error"
                  >
                    Lecsatlakozás
                  </Button>
                </>
              ) : (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={googleLoading ? <CircularProgress size={16} color="inherit" /> : <GoogleIcon />}
                  onClick={handleGoogleConnect}
                  disabled={googleLoading}
                  sx={{ bgcolor: '#4285f4', '&:hover': { bgcolor: '#3367d6' } }}
                >
                  Csatlakoztatás
                </Button>
              )}
            </Box>
          </Box>
        </Paper>

        {/* Admin: personal view toggle */}
        {admin && (
          <Paper sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <PersonOutlineIcon sx={{ color: '#2c5f2d' }} />
            <FormControlLabel
              control={
                <Switch
                  checked={personalView}
                  onChange={(e) => {
                    setPersonalView(e.target.checked);
                    if (!e.target.checked) setSelectedEmployee(null);
                  }}
                  color="success"
                />
              }
              label="Személyes nézet"
            />
            {personalView && (
              <Autocomplete
                options={employees}
                getOptionLabel={(opt) => `${opt.last_name || ''} ${opt.first_name || ''}`}
                value={selectedEmployee}
                onChange={(_, val) => setSelectedEmployee(val)}
                renderInput={(params) => <TextField {...params} label="Dolgozó kiválasztása" size="small" sx={{ minWidth: 250 }} />}
                sx={{ flexGrow: 1, maxWidth: 400 }}
              />
            )}
          </Paper>
        )}

        {/* Summary stat cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {EVENT_TYPES.map(type => (
            <Grid item xs={6} sm={4} md key={type.key}>
              <Card sx={{ borderTop: `3px solid ${type.color}` }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
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
          <Grid item xs={6} sm={4} md>
            <Card sx={{ borderTop: '3px solid #ef4444' }}>
              <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
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
          <Grid item xs={6} sm={4} md>
            <Card sx={{ borderTop: '3px solid #f59e0b' }}>
              <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
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
            <ResponsiveTable sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Dátum</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Típus</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Név/Cím</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Leírás</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }}>Sürgősség</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc' }} align="right">Napok</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: '#f8fafc', width: 100 }} align="center">Műveletek</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((ev, idx) => {
                    const typeConfig = getEventTypeConfig(ev.type);
                    const urgencyConfig = URGENCY_CONFIG[ev.urgency] || URGENCY_CONFIG.normal;
                    const canEdit = EDITABLE_TYPES.includes(ev.type);
                    const canEditShift = ev.type === 'shift' ? admin : true;
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
                          {formatDescription(ev)}
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
                        <TableCell align="center">
                          {canEdit && canEditShift && (
                            <>
                              <IconButton size="small" onClick={() => handleEditRow(ev)} title="Szerkesztés">
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={() => setDeleteConfirm(ev)} title="Törlés" color="error">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ResponsiveTable>
          )}
        </Paper>

        {/* ============================================================ */}
        {/* Shift Dialog */}
        {/* ============================================================ */}
        <Dialog open={shiftDialog} onClose={() => setShiftDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingItem ? 'Műszak szerkesztése' : 'Új műszak'}</DialogTitle>
          <DialogContent sx={{ pt: '16px !important' }}>
            {admin && (
              <EmployeeSelect
                value={shiftForm.employee_id}
                onChange={(val) => setShiftForm(f => ({ ...f, employee_id: val }))}
              />
            )}
            <TextField
              label="Dátum"
              type="date"
              size="small"
              fullWidth
              required
              value={shiftForm.shift_date}
              onChange={(e) => setShiftForm(f => ({ ...f, shift_date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <FormControl size="small" fullWidth sx={{ mb: 2 }}>
              <InputLabel>Műszak típus</InputLabel>
              <Select
                value={shiftForm.shift_type}
                label="Műszak típus"
                onChange={(e) => setShiftForm(f => ({ ...f, shift_type: e.target.value }))}
              >
                {SHIFT_TYPES.map(st => (
                  <MenuItem key={st.value} value={st.value}>{st.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <TextField
                label="Kezdés"
                type="time"
                size="small"
                fullWidth
                required
                value={shiftForm.shift_start_time}
                onChange={(e) => setShiftForm(f => ({ ...f, shift_start_time: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Befejezés"
                type="time"
                size="small"
                fullWidth
                required
                value={shiftForm.shift_end_time}
                onChange={(e) => setShiftForm(f => ({ ...f, shift_end_time: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <TextField
              label="Helyszín"
              size="small"
              fullWidth
              value={shiftForm.location}
              onChange={(e) => setShiftForm(f => ({ ...f, location: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Megjegyzés"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={shiftForm.notes}
              onChange={(e) => setShiftForm(f => ({ ...f, notes: e.target.value }))}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShiftDialog(false)}>Mégse</Button>
            <Button
              variant="contained"
              onClick={handleSaveShift}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#3d6b4a' } }}
            >
              Mentés
            </Button>
          </DialogActions>
        </Dialog>

        {/* ============================================================ */}
        {/* Medical Appointment Dialog */}
        {/* ============================================================ */}
        <Dialog open={medicalDialog} onClose={() => setMedicalDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingItem ? 'Orvosi vizsgálat szerkesztése' : 'Új orvosi vizsgálat'}</DialogTitle>
          <DialogContent sx={{ pt: '16px !important' }}>
            {admin && (
              <EmployeeSelect
                value={medicalForm.employee_id}
                onChange={(val) => setMedicalForm(f => ({ ...f, employee_id: val }))}
              />
            )}
            <TextField
              label="Dátum"
              type="date"
              size="small"
              fullWidth
              required
              value={medicalForm.appointment_date}
              onChange={(e) => setMedicalForm(f => ({ ...f, appointment_date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Időpont"
              type="time"
              size="small"
              fullWidth
              value={medicalForm.appointment_time}
              onChange={(e) => setMedicalForm(f => ({ ...f, appointment_time: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            <FormControl size="small" fullWidth sx={{ mb: 2 }}>
              <InputLabel>Vizsgálat típus</InputLabel>
              <Select
                value={medicalForm.appointment_type}
                label="Vizsgálat típus"
                onChange={(e) => setMedicalForm(f => ({ ...f, appointment_type: e.target.value }))}
              >
                {APPOINTMENT_TYPES.map(at => (
                  <MenuItem key={at.value} value={at.value}>{at.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Orvos neve"
              size="small"
              fullWidth
              value={medicalForm.doctor_name}
              onChange={(e) => setMedicalForm(f => ({ ...f, doctor_name: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Rendelő helyszín"
              size="small"
              fullWidth
              value={medicalForm.clinic_location}
              onChange={(e) => setMedicalForm(f => ({ ...f, clinic_location: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Megjegyzés"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={medicalForm.notes}
              onChange={(e) => setMedicalForm(f => ({ ...f, notes: e.target.value }))}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMedicalDialog(false)}>Mégse</Button>
            <Button
              variant="contained"
              onClick={handleSaveMedical}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#3d6b4a' } }}
            >
              Mentés
            </Button>
          </DialogActions>
        </Dialog>

        {/* ============================================================ */}
        {/* Personal Event Dialog */}
        {/* ============================================================ */}
        <Dialog open={personalDialog} onClose={() => setPersonalDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingItem ? 'Személyes esemény szerkesztése' : 'Új személyes esemény'}</DialogTitle>
          <DialogContent sx={{ pt: '16px !important' }}>
            {admin && (
              <EmployeeSelect
                value={personalForm.employee_id}
                onChange={(val) => setPersonalForm(f => ({ ...f, employee_id: val }))}
              />
            )}
            <TextField
              label="Cím"
              size="small"
              fullWidth
              required
              value={personalForm.title}
              onChange={(e) => setPersonalForm(f => ({ ...f, title: e.target.value }))}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Dátum"
              type="date"
              size="small"
              fullWidth
              required
              value={personalForm.event_date}
              onChange={(e) => setPersonalForm(f => ({ ...f, event_date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              sx={{ mb: 2 }}
            />
            {!personalForm.all_day && (
              <TextField
                label="Időpont"
                type="time"
                size="small"
                fullWidth
                value={personalForm.event_time}
                onChange={(e) => setPersonalForm(f => ({ ...f, event_time: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ mb: 2 }}
              />
            )}
            <FormControlLabel
              control={
                <Checkbox
                  checked={personalForm.all_day}
                  onChange={(e) => setPersonalForm(f => ({ ...f, all_day: e.target.checked, event_time: '' }))}
                  color="success"
                />
              }
              label="Egész napos"
              sx={{ mb: 2, display: 'block' }}
            />
            <FormControl size="small" fullWidth sx={{ mb: 2 }}>
              <InputLabel>Esemény típus</InputLabel>
              <Select
                value={personalForm.event_type}
                label="Esemény típus"
                onChange={(e) => setPersonalForm(f => ({ ...f, event_type: e.target.value }))}
              >
                {PERSONAL_EVENT_TYPES.map(pt => (
                  <MenuItem key={pt.value} value={pt.value}>{pt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Leírás"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={personalForm.description}
              onChange={(e) => setPersonalForm(f => ({ ...f, description: e.target.value }))}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPersonalDialog(false)}>Mégse</Button>
            <Button
              variant="contained"
              onClick={handleSavePersonal}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#3d6b4a' } }}
            >
              Mentés
            </Button>
          </DialogActions>
        </Dialog>

        {/* ============================================================ */}
        {/* Google Calendar disconnect confirmation */}
        {/* ============================================================ */}
        <Dialog open={googleDisconnectConfirm} onClose={() => setGoogleDisconnectConfirm(false)} maxWidth="xs">
          <DialogTitle>Google Naptár lecsatlakoztatása</DialogTitle>
          <DialogContent>
            <Typography>
              Biztosan le szeretnéd csatlakoztatni a Google Naptárat ({googleStatus?.google_email})?
              A szinkronizált események megmaradnak, de az automatikus szinkronizálás leáll.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setGoogleDisconnectConfirm(false)}>Mégse</Button>
            <Button variant="contained" color="error" onClick={handleGoogleDisconnect}>
              Lecsatlakozás
            </Button>
          </DialogActions>
        </Dialog>

        {/* ============================================================ */}
        {/* Delete confirmation */}
        {/* ============================================================ */}
        <Dialog open={Boolean(deleteConfirm)} onClose={() => setDeleteConfirm(null)} maxWidth="xs">
          <DialogTitle>Esemény törlése</DialogTitle>
          <DialogContent>
            <Typography>Biztosan törölni szeretnéd ezt az eseményt?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirm(null)}>Mégse</Button>
            <Button variant="contained" color="error" onClick={handleDelete}>
              Törlés
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar */}
        <Snackbar
          open={snack.open}
          autoHideDuration={4000}
          onClose={() => setSnack(s => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnack(s => ({ ...s, open: false }))}
            severity={snack.severity}
            variant="filled"
          >
            {snack.message}
          </Alert>
        </Snackbar>
      </Box>
  );
}

export default Calendar;
