import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  TextField,
  InputAdornment,
  Button,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Download as DownloadIcon,
  AccessTime as ClockIcon,
} from '@mui/icons-material';
import { ticketsAPI, exportAPI, reportsAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateTicketModal from '../components/CreateTicketModal';
import FilterBuilder from '../components/FilterBuilder';
import ResponsiveTable from '../components/ResponsiveTable';
import { LanguageBadge } from '../utils/languageBadges';

const TICKET_FILTER_FIELDS = [
  { key: 'status', label: 'Státusz', type: 'dynamic' },
  { key: 'category', label: 'Kategória', type: 'dynamic' },
  { key: 'priority', label: 'Prioritás', type: 'dynamic' },
  { key: 'date_range', label: 'Időszak', type: 'preset' },
  { key: 'contractor', label: 'Alvállalkozó', type: 'dynamic' },
];

const TICKET_PRESET_VALUES = {
  date_range: [
    { value: 'this_month', label: 'Ez a hónap' },
    { value: 'last_month', label: 'Múlt hónap' },
    { value: '3months', label: '3 hónap' },
    { value: '6months', label: '6 hónap' },
    { value: 'this_year', label: 'Idei év' },
  ],
};

function Tickets() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    loadTickets();
  }, [page, rowsPerPage, search, activeFilters]);

  const loadFilterOptions = async () => {
    try {
      const response = await reportsAPI.getFilterOptions();
      if (response.success) {
        setFilterOptions(response.data);
      }
    } catch (error) {
      console.error('Szűrő opciók betöltési hiba:', error);
    }
  };

  const buildDynamicOptions = () => {
    if (!filterOptions) return {};
    return {
      status: (filterOptions.tickets?.statuses || []).map(s => ({ value: s.slug, label: s.name })),
      category: (filterOptions.tickets?.categories || []).map(c => ({ value: c.name, label: c.name })),
      priority: (filterOptions.tickets?.priorities || []).map(p => ({ value: p.slug, label: p.name })),
      contractor: (filterOptions.tickets?.contractors || []).map(c => ({ value: String(c.id), label: c.name })),
    };
  };

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (activeFilters.length > 0) params.filters = JSON.stringify(activeFilters);

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

  const getDeadlineChip = (ticket) => {
    if (!ticket.sla_resolution_deadline) return null;

    const isFinal = ['completed', 'rejected', 'not_feasible'].includes(ticket.status_slug);
    if (isFinal) {
      return { label: new Date(ticket.sla_resolution_deadline).toLocaleDateString('hu-HU'), color: '#9e9e9e', bg: '#f5f5f5' };
    }

    const now = new Date();
    const deadline = new Date(ticket.sla_resolution_deadline);
    const hoursLeft = (deadline.getTime() - now.getTime()) / 3600000;

    if (hoursLeft <= 0) {
      return { label: 'Lejárt', color: '#f44336', bg: '#ffebee' };
    }
    if (hoursLeft < 4) {
      return { label: `${Math.ceil(hoursLeft)}h`, color: '#ff9800', bg: '#fff3e0' };
    }
    return { label: new Date(ticket.sla_resolution_deadline).toLocaleDateString('hu-HU'), color: '#4caf50', bg: '#e8f5e9' };
  };

  const handleRowClick = (ticketId) => {
    navigate(`/tickets/${ticketId}`);
  };

  const handleFilterChange = (newFilters) => {
    setActiveFilters(newFilters);
    setPage(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (activeFilters.length > 0) params.filters = JSON.stringify(activeFilters);

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

  return (
    <Box>
      {/* Fejléc */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 3, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
          Hibajegyek
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={18} /> : <DownloadIcon />}
            onClick={handleExport}
            disabled={exporting}
            sx={{
              borderColor: '#2563eb',
              color: '#2563eb',
              '&:hover': { borderColor: '#1d4ed8', bgcolor: 'rgba(37, 99, 235, 0.04)' },
            }}
          >
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateModalOpen(true)}
            sx={{
              bgcolor: '#2563eb',
              '&:hover': { bgcolor: '#1d4ed8' },
            }}
          >
            Új hibajegy
          </Button>
        </Stack>
      </Box>

      {/* Keresés */}
      <Paper sx={{ p: 2, mb: 3 }}>
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
      </Paper>

      {/* FilterBuilder */}
      <FilterBuilder
        fields={TICKET_FILTER_FIELDS}
        presetValues={TICKET_PRESET_VALUES}
        dynamicOptions={buildDynamicOptions()}
        onFilter={handleFilterChange}
        resultCount={totalCount}
        loading={loading}
      />

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
            <ResponsiveTable>
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
                    <TableCell sx={{ fontWeight: 600 }}>Határidő</TableCell>
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
                        '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.04)' }
                      }}
                      onClick={() => handleRowClick(ticket.id)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2563eb' }}>
                          {ticket.ticket_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {ticket.title}
                          </Typography>
                          <LanguageBadge language={ticket.language} />
                        </Box>
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
                        {(() => {
                          const chip = getDeadlineChip(ticket);
                          if (!chip) return <Typography variant="body2" color="text.secondary">-</Typography>;
                          return (
                            <Chip
                              icon={<ClockIcon sx={{ fontSize: 14 }} />}
                              label={chip.label}
                              size="small"
                              sx={{
                                bgcolor: chip.bg,
                                color: chip.color,
                                fontWeight: 600,
                                fontSize: '0.75rem',
                              }}
                            />
                          );
                        })()}
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
            </ResponsiveTable>

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
