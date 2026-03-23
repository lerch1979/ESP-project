import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Button,
  TextField,
  MenuItem,
  InputAdornment,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Visibility as ViewIcon,
  PictureAsPdf as PdfIcon,
  Add as AddIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { damageReportsAPI } from '../services/api';

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

const PAYMENT_COLORS = {
  unpaid: 'error',
  partial: 'warning',
  paid: 'success',
  waived: 'default',
};

export default function DamageReports() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const res = await damageReportsAPI.getAll(params);
      if (res.success) {
        setReports(res.data?.reports || res.data || []);
        setTotal(res.data?.pagination?.total || res.data?.length || 0);
      }
    } catch (error) {
      console.error('Error loading damage reports:', error);
      toast.error(t('errorOccurred'));
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, statusFilter, t]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleDownloadPDF = async (id, e) => {
    e.stopPropagation();
    // Open window immediately in user gesture context to avoid popup blocker
    const newTab = window.open('', '_blank');
    try {
      const blob = await damageReportsAPI.downloadPDF(id);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      newTab.location.href = url;
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
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
    return new Date(dateStr).toLocaleDateString('hu-HU');
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {t('damageReports')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('nav.damageReportsSubtitle', 'Kárigény jegyzőkönyvek kezelése')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/damage-reports/new')}
        >
          {t('create')}
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterIcon color="action" />
        <TextField
          size="small"
          placeholder={t('search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 220 }}
        />
        <TextField
          select
          size="small"
          label={t('status')}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">{t('all')}</MenuItem>
          <MenuItem value="draft">Piszkozat</MenuItem>
          <MenuItem value="pending_review">Felülvizsgálatra vár</MenuItem>
          <MenuItem value="pending_acknowledgment">Tudomásulvételre vár</MenuItem>
          <MenuItem value="acknowledged">Tudomásul véve</MenuItem>
          <MenuItem value="in_payment">Fizetés alatt</MenuItem>
          <MenuItem value="paid">Kifizetve</MenuItem>
          <MenuItem value="disputed">Vitatott</MenuItem>
          <MenuItem value="cancelled">Törölve</MenuItem>
        </TextField>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Jegyzőkönyv szám</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Munkavállaló</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t('accommodation')}</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Összeg</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t('status')}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Fizetés</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{t('date')}</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">{t('actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : reports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">{t('noData')}</Typography>
                </TableCell>
              </TableRow>
            ) : (
              reports.map((report) => (
                <TableRow
                  key={report.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/damage-reports/${report.id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {report.report_number || `KJ-${report.id?.slice(0, 8)}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {report.employee_name || report.user?.full_name || '-'}
                  </TableCell>
                  <TableCell>
                    {report.accommodation_name || report.accommodation?.name || '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontWeight: 600 }}>
                      {formatCurrency(report.total_cost || report.damage_amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={report.status || 'draft'}
                      size="small"
                      color={STATUS_COLORS[report.status] || 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={report.payment_status || 'unpaid'}
                      size="small"
                      color={PAYMENT_COLORS[report.payment_status] || 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {formatDate(report.damage_date || report.created_at)}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={t('view')}>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); navigate(`/damage-reports/${report.id}`); }}
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="PDF">
                      <IconButton
                        size="small"
                        onClick={(e) => handleDownloadPDF(report.id, e)}
                      >
                        <PdfIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage={t('rowsPerPage', 'Sorok/oldal')}
        />
      </TableContainer>
    </Box>
  );
}
