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
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Add as AddIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import { ticketsAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateTicketModal from '../components/CreateTicketModal';
import api from '../services/api';

function Tickets() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    loadTickets();
    loadEmployees();
  }, [page, rowsPerPage, search, statusFilter, employeeFilter]);

  const loadEmployees = async () => {
    try {
      const response = await api.get('/users?role=accommodated_employee');
      if (response.data.success) {
        setEmployees(response.data.data.users || []);
      }
    } catch (error) {
      console.error('Munkavállalók betöltési hiba:', error);
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
      if (employeeFilter !== 'all') params.employee = employeeFilter;

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

  return (
    <Box>
      {/* Fejléc */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Hibajegyek
        </Typography>
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
          
          {/* Munkavállaló szűrő */}
          <FormControl size="small" sx={{ minWidth: 250 }}>
            <InputLabel>Munkavállaló</InputLabel>
            <Select
              value={employeeFilter}
              onChange={(e) => { setEmployeeFilter(e.target.value); setPage(0); }}
              label="Munkavállaló"
            >
              <MenuItem value="all">Minden munkavállaló</MenuItem>
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  {emp.first_name} {emp.last_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title="Státusz szűrő">
            <IconButton onClick={(e) => setFilterAnchor(e.currentTarget)}>
              <FilterIcon />
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={filterAnchor}
            open={Boolean(filterAnchor)}
            onClose={() => setFilterAnchor(null)}
          >
            <MenuItem disabled>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                Státusz szűrés
              </Typography>
            </MenuItem>
            <MenuItem onClick={() => { setStatusFilter('all'); setFilterAnchor(null); }}>
              Minden státusz
            </MenuItem>
            <MenuItem onClick={() => { setStatusFilter('new'); setFilterAnchor(null); }}>
              Új
            </MenuItem>
            <MenuItem onClick={() => { setStatusFilter('in_progress'); setFilterAnchor(null); }}>
              Folyamatban
            </MenuItem>
            <MenuItem onClick={() => { setStatusFilter('completed'); setFilterAnchor(null); }}>
              Lezárva
            </MenuItem>
          </Menu>

          {(statusFilter !== 'all' || employeeFilter !== 'all') && (
            <Button
              size="small"
              onClick={() => {
                setStatusFilter('all');
                setEmployeeFilter('all');
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
                    <TableCell sx={{ fontWeight: 600 }}>Munkavállaló</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Felelős</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Létrehozva</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 50 }}></TableCell>
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
                          {ticket.accommodated_employee_name || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {ticket.category_name && (
                          <Chip 
                            label={ticket.category_name} 
                            size="small"
                            sx={{ bgcolor: '#e8f5e9' }}
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
                      <TableCell>
                        <IconButton size="small" onClick={(e) => {
                          e.stopPropagation();
                        }}>
                          <MoreIcon fontSize="small" />
                        </IconButton>
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
