import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Grid,
} from '@mui/material';
import {
  History as HistoryIcon,
  Visibility as VisibilityIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FileDownload as FileDownloadIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { activityLogAPI } from '../services/api';

const ACTION_CONFIG = {
  create: { label: 'Létrehozás', color: 'success', icon: <AddIcon sx={{ fontSize: 16 }} /> },
  update: { label: 'Módosítás', color: 'info', icon: <EditIcon sx={{ fontSize: 16 }} /> },
  delete: { label: 'Törlés', color: 'error', icon: <DeleteIcon sx={{ fontSize: 16 }} /> },
};

const ENTITY_LABELS = {
  employee: 'Munkavállaló',
  accommodation: 'Szálláshely',
  contractor: 'Alvállalkozó',
  ticket: 'Hibajegy',
};

const FIELD_LABELS = {
  first_name: 'Keresztnév',
  last_name: 'Vezetéknév',
  employee_number: 'Törzsszám',
  position: 'Munkakör',
  status_id: 'Státusz',
  accommodation_id: 'Szálláshely',
  workplace: 'Munkahely',
  room_id: 'Szoba',
  start_date: 'Kezdés',
  end_date: 'Befejezés',
  gender: 'Nem',
  birth_date: 'Születési dátum',
  visa_expiry: 'Vízum lejárat',
  marital_status: 'Családi állapot',
  name: 'Név',
  address: 'Cím',
  type: 'Típus',
  capacity: 'Kapacitás',
  status: 'Státusz',
  monthly_rent: 'Bérleti díj',
  current_contractor_id: 'Alvállalkozó',
  email: 'Email',
  phone: 'Telefon',
  is_active: 'Aktív',
};

function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [filters, setFilters] = useState({
    entity_type: '',
    action: '',
    search: '',
    date_from: '',
    date_to: '',
  });
  const [detailDialog, setDetailDialog] = useState({ open: false, log: null });
  const [exporting, setExporting] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (filters.entity_type) params.entity_type = filters.entity_type;
      if (filters.action) params.action = filters.action;
      if (filters.search) params.search = filters.search;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;

      const response = await activityLogAPI.getAll(params);
      if (response.success) {
        setLogs(response.data.logs);
        setPagination((prev) => ({ ...prev, ...response.data.pagination }));
      }
    } catch (error) {
      console.error('Activity log load error:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(loadLogs, 30000);
    return () => clearInterval(interval);
  }, [loadLogs]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (_, newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage + 1 }));
  };

  const handleRowsPerPageChange = (e) => {
    setPagination((prev) => ({ ...prev, limit: parseInt(e.target.value), page: 1 }));
  };

  const openDetail = (log) => {
    setDetailDialog({ open: true, log });
  };

  const getEntityName = (log) => {
    if (!log.metadata) return '-';
    const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    return meta.name || meta.employee_number || '-';
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filters.entity_type) params.entity_type = filters.entity_type;
      if (filters.action) params.action = filters.action;
      if (filters.search) params.search = filters.search;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;

      const response = await activityLogAPI.export(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `tevekenyseggnaplo_${dateStr}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Napló exportálva!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Export hiba');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <HistoryIcon sx={{ fontSize: 32, color: '#2c5f2d' }} />
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Tevékenységnapló
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={exporting ? <CircularProgress size={18} /> : <FileDownloadIcon />}
          onClick={handleExport}
          disabled={exporting}
          sx={{ borderColor: '#2c5f2d', color: '#2c5f2d', '&:hover': { borderColor: '#3d6b4a', bgcolor: 'rgba(44,95,45,0.04)' } }}
        >
          {exporting ? 'Exportálás...' : 'Export Excel'}
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Típus</InputLabel>
              <Select
                value={filters.entity_type}
                label="Típus"
                onChange={(e) => handleFilterChange('entity_type', e.target.value)}
              >
                <MenuItem value="">Mind</MenuItem>
                <MenuItem value="employee">Munkavállaló</MenuItem>
                <MenuItem value="accommodation">Szálláshely</MenuItem>
                <MenuItem value="contractor">Alvállalkozó</MenuItem>
                <MenuItem value="ticket">Hibajegy</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Művelet</InputLabel>
              <Select
                value={filters.action}
                label="Művelet"
                onChange={(e) => handleFilterChange('action', e.target.value)}
              >
                <MenuItem value="">Mind</MenuItem>
                <MenuItem value="create">Létrehozás</MenuItem>
                <MenuItem value="update">Módosítás</MenuItem>
                <MenuItem value="delete">Törlés</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Dátum -tól"
              value={filters.date_from}
              onChange={(e) => handleFilterChange('date_from', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              type="date"
              label="Dátum -ig"
              value={filters.date_to}
              onChange={(e) => handleFilterChange('date_to', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={4}>
            <TextField
              fullWidth
              size="small"
              label="Keresés"
              placeholder="Név, entitás..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Dátum</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Felhasználó</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Művelet</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Entitás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="center">Részletek</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">Nincs tevékenység</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => {
                      const actionCfg = ACTION_CONFIG[log.action] || { label: log.action, color: 'default' };
                      return (
                        <TableRow key={log.id} hover>
                          <TableCell>
                            <Typography variant="body2">
                              {new Date(log.created_at).toLocaleString('hu-HU')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{log.user_name}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              icon={actionCfg.icon}
                              label={actionCfg.label}
                              color={actionCfg.color}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={ENTITY_LABELS[log.entity_type] || log.entity_type}
                              size="small"
                              sx={{ bgcolor: 'rgba(44,95,45,0.1)', color: '#2c5f2d' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{getEntityName(log)}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <IconButton size="small" onClick={() => openDetail(log)}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Box>
            <TablePagination
              component="div"
              count={pagination.total}
              page={pagination.page - 1}
              onPageChange={handlePageChange}
              rowsPerPage={pagination.limit}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
              labelRowsPerPage="Sorok száma:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Detail Dialog */}
      <DetailDialog
        open={detailDialog.open}
        log={detailDialog.log}
        onClose={() => setDetailDialog({ open: false, log: null })}
      />
    </Box>
  );
}

function DetailDialog({ open, log, onClose }) {
  if (!log) return null;

  const actionCfg = ACTION_CONFIG[log.action] || { label: log.action, color: 'default' };
  const metadata = log.metadata
    ? typeof log.metadata === 'string'
      ? JSON.parse(log.metadata)
      : log.metadata
    : {};
  const changes = log.changes
    ? typeof log.changes === 'string'
      ? JSON.parse(log.changes)
      : log.changes
    : null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label={actionCfg.label} color={actionCfg.color} size="small" />
          <Chip
            label={ENTITY_LABELS[log.entity_type] || log.entity_type}
            size="small"
            sx={{ bgcolor: 'rgba(44,95,45,0.1)', color: '#2c5f2d' }}
          />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {metadata.name || ''}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {/* Changes table for updates */}
        {log.action === 'update' && changes && Object.keys(changes).length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Változások
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Mező</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Régi érték</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Új érték</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(changes).map(([field, vals]) => (
                  <TableRow key={field}>
                    <TableCell>{FIELD_LABELS[field] || field}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {vals.old !== null && vals.old !== undefined ? String(vals.old) : '-'}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>
                      {vals.new !== null && vals.new !== undefined ? String(vals.new) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {/* Metadata for create/delete */}
        {(log.action === 'create' || log.action === 'delete') && metadata && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Részletek
            </Typography>
            {Object.entries(metadata).map(([key, val]) => (
              <Typography key={key} variant="body2" sx={{ mb: 0.5 }}>
                <strong>{FIELD_LABELS[key] || key}:</strong> {String(val)}
              </Typography>
            ))}
          </Box>
        )}

        {/* Info footer */}
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #e0e0e0' }}>
          <Typography variant="body2" color="text.secondary">
            <strong>Felhasználó:</strong> {log.user_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            <strong>Időpont:</strong> {new Date(log.created_at).toLocaleString('hu-HU')}
          </Typography>
          {log.ip_address && (
            <Typography variant="body2" color="text.secondary">
              <strong>IP cím:</strong> {log.ip_address}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Bezárás</Button>
      </DialogActions>
    </Dialog>
  );
}

export default ActivityLog;
