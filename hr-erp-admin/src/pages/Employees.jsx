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
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  CloudUpload as UploadIcon,
  Download as DownloadIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { employeesAPI, exportAPI, reportsAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateEmployeeModal from '../components/CreateEmployeeModal';
import EmployeeBulkImportModal from '../components/EmployeeBulkImportModal';
import EmployeeDetailModal from '../components/EmployeeDetailModal';
import BulkEmailModal from '../components/BulkEmailModal';
import FilterBuilder from '../components/FilterBuilder';

const EMPLOYEE_FILTER_FIELDS = [
  { key: 'status', label: 'Státusz', type: 'dynamic' },
  { key: 'workplace', label: 'Munkahely', type: 'dynamic' },
  { key: 'gender', label: 'Nem', type: 'preset' },
  { key: 'visa_expiry', label: 'Vízum lejárat', type: 'preset' },
  { key: 'contract_end', label: 'Szerződés lejárat', type: 'preset' },
  { key: 'marital_status', label: 'Családi állapot', type: 'preset' },
  { key: 'position', label: 'Beosztás', type: 'dynamic' },
  { key: 'country', label: 'Ország', type: 'dynamic' },
  { key: 'birth_year', label: 'Életkor', type: 'preset' },
];

const EMPLOYEE_PRESET_VALUES = {
  gender: [
    { value: 'male', label: 'Férfi' },
    { value: 'female', label: 'Nő' },
    { value: 'other', label: 'Egyéb' },
  ],
  visa_expiry: [
    { value: 'expired', label: 'Lejárt' },
    { value: '30days', label: '30 napon belül lejár' },
    { value: '60days', label: '60 napon belül lejár' },
    { value: 'valid', label: 'Érvényes' },
  ],
  contract_end: [
    { value: 'expired', label: 'Lejárt' },
    { value: '30days', label: '30 napon belül lejár' },
    { value: '60days', label: '60 napon belül lejár' },
    { value: '90days', label: '90 napon belül lejár' },
  ],
  marital_status: [
    { value: 'single', label: 'Egyedülálló' },
    { value: 'married', label: 'Házas' },
    { value: 'divorced', label: 'Elvált' },
    { value: 'widowed', label: 'Özvegy' },
  ],
  birth_year: [
    { value: 'under_25', label: '25 év alatt' },
    { value: '25_35', label: '25-35 év' },
    { value: '35_50', label: '35-50 év' },
    { value: 'over_50', label: '50 év felett' },
  ],
};

function Employees() {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    loadEmployees();
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
      status: (filterOptions.employees?.statuses || []).map(s => ({ value: s.name, label: s.name })),
      workplace: (filterOptions.employees?.workplaces || []).map(w => ({ value: w, label: w })),
      position: (filterOptions.employees?.positions || []).map(p => ({ value: p, label: p })),
      country: (filterOptions.employees?.countries || []).map(c => ({ value: c, label: c })),
    };
  };

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (activeFilters.length > 0) params.filters = JSON.stringify(activeFilters);

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

      const response = await exportAPI.employees(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'munkavallalok.xlsx');
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
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Szállásolt munkavállalók
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
            variant="outlined"
            startIcon={<EmailIcon />}
            onClick={() => setEmailModalOpen(true)}
            sx={{
              borderColor: '#2c5f2d',
              color: '#2c5f2d',
              '&:hover': { borderColor: '#234d24', bgcolor: 'rgba(44, 95, 45, 0.04)' },
            }}
          >
            Üzenet küldése
          </Button>
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

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
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
      </Paper>

      {/* FilterBuilder */}
      <FilterBuilder
        fields={EMPLOYEE_FILTER_FIELDS}
        presetValues={EMPLOYEE_PRESET_VALUES}
        dynamicOptions={buildDynamicOptions()}
        onFilter={handleFilterChange}
        resultCount={totalCount}
        loading={loading}
      />

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

      <BulkEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
      />
    </Box>
  );
}

export default Employees;
