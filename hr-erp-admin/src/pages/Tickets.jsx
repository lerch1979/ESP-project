import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  TextField,
  InputAdornment,
  Button,
  Stack,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { ticketsAPI, exportAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateTicketModal from '../components/CreateTicketModal';

function Tickets() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [statuses, setStatuses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadTickets();
  }, [page, rowsPerPage, search, statusFilter, categoryFilter, priorityFilter]);

  const loadLookups = async () => {
    const [statusesRes, categoriesRes, prioritiesRes] = await Promise.allSettled([
      ticketsAPI.getStatuses(),
      ticketsAPI.getCategories(),
      ticketsAPI.getPriorities(),
    ]);

    if (statusesRes.status === 'fulfilled' && statusesRes.value.success) {
      setStatuses(statusesRes.value.data.statuses || []);
    }
    if (categoriesRes.status === 'fulfilled' && categoriesRes.value.success) {
      setCategories(categoriesRes.value.data.categories || []);
    }
    if (prioritiesRes.status === 'fulfilled' && prioritiesRes.value.success) {
      setPriorities(prioritiesRes.value.data.priorities || []);
    }
  };

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;

      const response = await ticketsAPI.getAll(params);

      if (response.success) {
        setTickets(response.data.tickets);
        setTotalCount(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Hibajegyek betöltési hiba:', error);
      toast.error('Hiba a hibajegyek betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (event) => {
    setSearch(event.target.value);
    setPage(0);
  };

  const getStatusColor = (slug) => {
    const colors = {
      new: 'info',
      in_progress: 'warning',
      completed: 'success',
      rejected: 'error',
      waiting: 'default',
      waiting_material: 'warning',
      invoicing: 'info',
      payment_pending: 'warning',
      transferred: 'info',
      not_feasible: 'default',
    };
    return colors[slug] || 'default';
  };

  const getPriorityColor = (slug) => {
    const colors = {
      low: 'success',
      normal: 'default',
      urgent: 'warning',
      critical: 'error',
    };
    return colors[slug] || 'default';
  };

  const handleRowClick = (ticketId) => {
    navigate(`/tickets/${ticketId}`);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;

      const response = await exportAPI.tickets(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'hibajegyek.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export hiba:', error);
      toast.error('Hiba az exportálás során');
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = statusFilter !== 'all' || categoryFilter !== 'all' || priorityFilter !== 'all';

  return (
    <Box>
      {/* Fejléc */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Hibajegyek
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={18} /> : <DownloadIcon />}
            onClick={handleExport}
            disabled={exporting}
            sx={{
              borderColor: '#2c5f2d',
              color: '#2c5f2d',
              '&:hover': { borderColor: '#234d24', bgcolor: 'rgba(44, 95, 45, 0.04)' },
            }}
          >
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateModalOpen(true)}
            sx={{
              bgcolor: '#2c5f2d',
              '&:hover': { bgcolor: '#234d24' },
            }}
          >
            Új hibajegy
          </Button>
        </Stack>
      </Box>

      {/* Keresés és szűrők */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            fullWidth
            placeholder="Keresés címben vagy leírásban..."
            value={search}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            size="small"
          />

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Státusz</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              label="Státusz"
            >
              <MenuItem value="all">Minden státusz</MenuItem>
              {statuses.map((s) => (
                <MenuItem key={s.id} value={s.slug}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Kategória</InputLabel>
            <Select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
              label="Kategória"
            >
              <MenuItem value="all">Minden kategória</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.slug}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Prioritás</InputLabel>
            <Select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setPage(0); }}
              label="Prioritás"
            >
              <MenuItem value="all">Minden prioritás</MenuItem>
              {priorities.map((p) => (
                <MenuItem key={p.id} value={p.slug}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {hasActiveFilters && (
            <Button
              size="small"
              onClick={() => {
                setStatusFilter('all');
                setCategoryFilter('all');
                setPriorityFilter('all');
              }}
            >
              Szűrők törlése
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Táblázat */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress />
          </Box>
        ) : tickets.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              Nincs találat
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Próbálj más keresési feltételt vagy töröld a szűrőket.
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Azonosító</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Beküldő</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Felelős</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Létrehozva</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(44, 95, 45, 0.04)' }
                      }}
                      onClick={() => handleRowClick(ticket.id)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2c5f2d' }}>
                          {ticket.ticket_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {ticket.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {ticket.created_by_name || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {ticket.category_name && (
                          <Chip
                            label={ticket.category_name}
                            size="small"
                            sx={{
                              bgcolor: ticket.category_color || '#e8f5e9',
                              color: '#fff',
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={ticket.status_name}
                          size="small"
                          color={getStatusColor(ticket.status_slug)}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={ticket.priority_name}
                          size="small"
                          color={getPriorityColor(ticket.priority_slug)}
                          variant={ticket.priority_slug === 'critical' ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {ticket.assigned_to_name || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(ticket.created_at).toLocaleDateString('hu-HU')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={totalCount}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[10, 20, 50, 100]}
              labelRowsPerPage="Sorok oldalanként:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Új hibajegy modal */}
      <CreateTicketModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          loadTickets();
          setPage(0);
        }}
      />
    </Box>
  );
}

export default Tickets;
