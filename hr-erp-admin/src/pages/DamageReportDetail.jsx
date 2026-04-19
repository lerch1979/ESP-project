import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  PictureAsPdf as PdfIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Edit as EditIcon,
  Person as PersonIcon,
  Home as HomeIcon,
  AttachMoney as MoneyIcon,
  History as HistoryIcon,
  Description as DescIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { damageReportsAPI, usersAPI, accommodationsAPI } from '../services/api';

const STATUS_COLORS = {
  draft: 'default',
  pending_review: 'warning',
  pending_acknowledgment: 'info',
  acknowledged: 'primary',
  in_payment: 'secondary',
  paid: 'success',
  disputed: 'error',
  cancelled: 'default',
};

export default function DamageReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const isNew = id === 'new';
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(isNew ? false : true);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({
    employee_id: '',
    incident_date: new Date().toISOString().slice(0, 10),
    description: '',
    accommodation_id: '',
    notes: '',
  });
  const [employees, setEmployees] = useState([]);
  const [accommodations, setAccommodations] = useState([]);

  useEffect(() => {
    if (isNew) {
      const loadData = async () => {
        try {
          const [usersRes, accRes] = await Promise.all([
            usersAPI.getAll({ limit: 500, is_active: true }),
            accommodationsAPI.getAll({ limit: 500 }),
          ]);
          if (usersRes.success) setEmployees(usersRes.data.users || []);
          if (accRes.success) setAccommodations(accRes.data.accommodations || []);
        } catch { /* ignore */ }
      };
      loadData();
    } else {
      loadReport();
    }
  }, [id]);

  const handleCreateSubmit = async () => {
    if (!newForm.employee_id || !newForm.description) {
      toast.error('Munkavállaló és leírás megadása kötelező!');
      return;
    }
    setCreating(true);
    try {
      const res = await damageReportsAPI.createManual(newForm);
      if (res.success) {
        toast.success('Kárigény sikeresen létrehozva!');
        navigate(`/damage-reports/${res.data.id}`);
      }
    } catch (error) {
      console.error('Create error:', error);
      toast.error('Hiba a kárigény létrehozásakor');
    } finally {
      setCreating(false);
    }
  };

  const loadReport = async () => {
    try {
      setLoading(true);
      const res = await damageReportsAPI.getById(id);
      if (res.success) {
        setReport(res.data);
      }
      // Try loading payment status
      try {
        const payRes = await damageReportsAPI.getPaymentStatus(id);
        if (payRes.success) setPaymentStatus(payRes.data);
      } catch { /* payment status optional */ }
    } catch (error) {
      console.error('Error loading damage report:', error);
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    // Open window immediately in user gesture context to avoid popup blocker
    const newTab = window.open('', '_blank');
    try {
      const blob = await damageReportsAPI.downloadPDF(id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      newTab.location.href = url;
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      toast.success('PDF letöltve');
    } catch {
      if (newTab) newTab.close();
      toast.error(t('errorOccurred'));
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('hu-HU', {
      style: 'currency',
      currency: 'HUF',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('hu-HU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isNew) {
    return (
      <Box sx={{ p: 3, maxWidth: 700, mx: 'auto' }}>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/damage-reports')} sx={{ mb: 2 }}>
          Vissza
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Új kárigény létrehozása</Typography>
        <Paper sx={{ p: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Munkavállaló</InputLabel>
                <Select
                  value={newForm.employee_id}
                  onChange={(e) => setNewForm(f => ({ ...f, employee_id: e.target.value }))}
                  label="Munkavállaló"
                >
                  {employees.map(emp => (
                    <MenuItem key={emp.id} value={emp.id}>
                      {emp.last_name} {emp.first_name} {emp.email ? `(${emp.email})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Szálláshely</InputLabel>
                <Select
                  value={newForm.accommodation_id}
                  onChange={(e) => setNewForm(f => ({ ...f, accommodation_id: e.target.value }))}
                  label="Szálláshely"
                >
                  <MenuItem value="">Nincs megadva</MenuItem>
                  {accommodations.map(acc => (
                    <MenuItem key={acc.id} value={acc.id}>{acc.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                type="date"
                label="Esemény dátuma"
                value={newForm.incident_date}
                onChange={(e) => setNewForm(f => ({ ...f, incident_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                rows={4}
                label="Leírás"
                value={newForm.description}
                onChange={(e) => setNewForm(f => ({ ...f, description: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Megjegyzés"
                value={newForm.notes}
                onChange={(e) => setNewForm(f => ({ ...f, notes: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="contained"
                onClick={handleCreateSubmit}
                disabled={creating}
                sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
              >
                {creating ? <CircularProgress size={24} /> : 'Kárigény létrehozása'}
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </Box>
    );
  }

  if (!report) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>{t('noData')}</Typography>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/damage-reports')} sx={{ mt: 2 }}>
          {t('back')}
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Button startIcon={<BackIcon />} onClick={() => navigate('/damage-reports')} sx={{ mb: 1 }}>
            {t('back')}
          </Button>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {report.report_number || `Kárigény #${id.slice(0, 8)}`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Chip
              label={report.status}
              color={STATUS_COLORS[report.status] || 'default'}
              size="small"
            />
            {report.payment_status && (
              <Chip
                label={`Fizetés: ${report.payment_status}`}
                variant="outlined"
                size="small"
              />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<PdfIcon />} onClick={handleDownloadPDF}>
            PDF
          </Button>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Main Info */}
        <Grid item xs={12} md={8}>
          {/* Employee & Location */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Munkavállaló és helyszín
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Munkavállaló</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {report.employee_name || '-'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Alvállalkozó</Typography>
                <Typography variant="body1">
                  {report.contractor_name || '-'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Szálláshely</Typography>
                <Typography variant="body1">
                  {report.accommodation_name || '-'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Szoba</Typography>
                <Typography variant="body1">
                  {report.room_number || '-'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Kár dátuma</Typography>
                <Typography variant="body1">
                  {formatDate(report.damage_date)}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="body2" color="text.secondary">Felelősség típusa</Typography>
                <Typography variant="body1">
                  {report.liability_type || '-'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>

          {/* Damage Description */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              <DescIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Kár leírása
            </Typography>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {report.damage_description || '-'}
            </Typography>
            {report.notes && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Megjegyzések
                </Typography>
                <Typography variant="body2">{report.notes}</Typography>
              </Box>
            )}
          </Paper>

          {/* Damage Items */}
          {report.damage_items && report.damage_items.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Kártételek
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Megnevezés</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Leírás</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Összeg</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.damage_items.map((item, idx) => (
                      <TableRow key={item.id || idx}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.description || '-'}</TableCell>
                        <TableCell align="right">{formatCurrency(item.cost)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Összesen</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatCurrency(report.total_cost)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}

          {/* Payment Plan */}
          {report.payment_plan && report.payment_plan.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                <MoneyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Fizetési terv (Mt. 177.§)
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Hónap</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Levonás</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Fennmaradó</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.payment_plan.map((p) => (
                      <TableRow key={p.month}>
                        <TableCell>{p.month}. hónap</TableCell>
                        <TableCell align="right">{formatCurrency(p.amount)}</TableCell>
                        <TableCell align="right">{formatCurrency(p.remaining)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Grid>

        {/* Sidebar */}
        <Grid item xs={12} md={4}>
          {/* Summary Card */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Összesítő
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">Kár összege</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: 'error.main' }}>
                  {formatCurrency(report.total_cost || report.damage_amount)}
                </Typography>
              </Box>
              <Divider />
              <Box>
                <Typography variant="body2" color="text.secondary">Felróhatóság</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {report.fault_percentage != null ? `${report.fault_percentage}%` : '-'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Fizetendő összeg</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {report.fault_percentage != null && report.total_cost
                    ? formatCurrency(report.total_cost * report.fault_percentage / 100)
                    : formatCurrency(report.total_cost)}
                </Typography>
              </Box>
              <Divider />
              <Box>
                <Typography variant="body2" color="text.secondary">Létrehozva</Typography>
                <Typography variant="body2">{formatDate(report.created_at)}</Typography>
              </Box>
              {report.creator_name && (
                <Box>
                  <Typography variant="body2" color="text.secondary">Készítette</Typography>
                  <Typography variant="body2">{report.creator_name}</Typography>
                </Box>
              )}
              {report.ticket_id && (
                <Box>
                  <Typography variant="body2" color="text.secondary">Kapcsolódó ticket</Typography>
                  <Button
                    size="small"
                    onClick={() => navigate(`/tickets/${report.ticket_id}`)}
                  >
                    #{report.ticket_id.slice(0, 8)}
                  </Button>
                </Box>
              )}
            </Box>
          </Paper>

          {/* Signatures */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Aláírások
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">Munkavállaló</Typography>
                {report.employee_signature ? (
                  <Chip label="Aláírva" size="small" color="success" variant="outlined" />
                ) : (
                  <Chip label="Nincs" size="small" variant="outlined" />
                )}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">Vezető</Typography>
                {report.manager_signature ? (
                  <Chip label="Aláírva" size="small" color="success" variant="outlined" />
                ) : (
                  <Chip label="Nincs" size="small" variant="outlined" />
                )}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">Tanú</Typography>
                {report.witness_signature ? (
                  <Chip label="Aláírva" size="small" color="success" variant="outlined" />
                ) : (
                  <Chip label="Nincs" size="small" variant="outlined" />
                )}
              </Box>
            </Box>
          </Paper>

          {/* Payment Status */}
          {paymentStatus && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Fizetési állapot
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">Kifizetett hónapok</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {paymentStatus.paid_months || 0} / {paymentStatus.total_months || 0}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">Fennmaradó összeg</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: 'warning.main' }}>
                    {formatCurrency(paymentStatus.remaining_amount)}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
