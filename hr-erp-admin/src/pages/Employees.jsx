import React, { useState, useEffect } from 'react';
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
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { employeesAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateEmployeeModal from '../components/CreateEmployeeModal';
import EmployeeBulkImportModal from '../components/EmployeeBulkImportModal';
import EmployeeDetailModal from '../components/EmployeeDetailModal';

function Employees() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [accommodationFilter, setAccommodationFilter] = useState('all');
  const [statuses, setStatuses] = useState([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);

  useEffect(() => {
    loadStatuses();
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [page, rowsPerPage, search, statusFilter, accommodationFilter]);

  const loadStatuses = async () => {
    try {
      const response = await employeesAPI.getStatuses();
      if (response.success) {
        setStatuses(response.data.statuses);
      }
    } catch (error) {
      console.error('Státuszok betöltési hiba:', error);
    }
  };

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (statusFilter !== 'all') params.status_id = statusFilter;
      if (accommodationFilter === 'yes') params.has_accommodation = 'true';
      if (accommodationFilter === 'no') params.has_accommodation = 'false';

      const response = await employeesAPI.getAll(params);

      if (response.success) {
        setEmployees(response.data.employees);
        setTotalCount(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Munkavállalók betöltési hiba:', error);
      toast.error('Hiba a munkavállalók betöltésekor');
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

  const handleRowClick = (id) => {
    setSelectedEmployeeId(id);
    setDetailModalOpen(true);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setAccommodationFilter('all');
    setSearch('');
    setPage(0);
  };

  const hasActiveFilters = statusFilter !== 'all' || accommodationFilter !== 'all' || search;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Szállásolt munkavállalók
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setBulkModalOpen(true)}
            sx={{
              borderColor: '#2c5f2d',
              color: '#2c5f2d',
              '&:hover': { borderColor: '#234d24', bgcolor: 'rgba(44, 95, 45, 0.04)' },
            }}
          >
            Tömeges feltöltés
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
            Új munkavállaló
          </Button>
        </Stack>
      </Box>

      {/* Search & filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            fullWidth
            placeholder="Keresés név, email vagy törzsszám alapján..."
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
              <MenuItem value="all">Mind</MenuItem>
              {statuses.map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Szálláshely</InputLabel>
            <Select
              value={accommodationFilter}
              onChange={(e) => { setAccommodationFilter(e.target.value); setPage(0); }}
              label="Szálláshely"
            >
              <MenuItem value="all">Mind</MenuItem>
              <MenuItem value="yes">Van szállása</MenuItem>
              <MenuItem value="no">Nincs szállása</MenuItem>
            </Select>
          </FormControl>

          {hasActiveFilters && (
            <Button size="small" onClick={clearFilters}>
              Szűrők törlése
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress />
          </Box>
        ) : employees.length === 0 ? (
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
                    <TableCell sx={{ fontWeight: 600 }}>Törzsszám</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Telefon</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Munkakör</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Szálláshely</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Kezdés dátuma</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {employees.map((emp) => (
                    <TableRow
                      key={emp.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(44, 95, 45, 0.04)' },
                      }}
                      onClick={() => handleRowClick(emp.id)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2c5f2d' }}>
                          {emp.employee_number || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {emp.last_name && emp.first_name
                            ? `${emp.last_name} ${emp.first_name}`
                            : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {emp.email || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {emp.phone || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {emp.position || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {emp.accommodation_name || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {emp.status_name ? (
                          <Chip
                            label={emp.status_name}
                            size="small"
                            sx={{
                              bgcolor: emp.status_color ? `${emp.status_color}20` : undefined,
                              color: emp.status_color || undefined,
                              fontWeight: 600,
                            }}
                          />
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {emp.start_date
                            ? new Date(emp.start_date).toLocaleDateString('hu-HU')
                            : '-'}
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

      {/* Modals */}
      <CreateEmployeeModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          loadEmployees();
          setPage(0);
        }}
      />

      <EmployeeBulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => {
          loadEmployees();
          setPage(0);
        }}
      />

      <EmployeeDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        employeeId={selectedEmployeeId}
        onSuccess={loadEmployees}
      />
    </Box>
  );
}

export default Employees;
