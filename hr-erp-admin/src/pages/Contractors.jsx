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
} from '@mui/icons-material';
import { contractorsAPI, exportAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateContractorModal from '../components/CreateContractorModal';
import ContractorBulkImportModal from '../components/ContractorBulkImportModal';
import ContractorDetailModal from '../components/ContractorDetailModal';
import FilterBuilder from '../components/FilterBuilder';

const CONTRACTOR_FILTER_FIELDS = [
  { key: 'is_active', label: 'Állapot', type: 'preset' },
];

const CONTRACTOR_PRESET_VALUES = {
  is_active: [
    { value: 'active', label: 'Aktív' },
    { value: 'inactive', label: 'Inaktív' },
  ],
};

function Contractors() {
  const [loading, setLoading] = useState(true);
  const [contractors, setContractors] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadContractors();
  }, [page, rowsPerPage, search, activeFilters]);

  const handleFilterChange = (newFilters) => {
    setActiveFilters(newFilters);
    setPage(0);
  };

  const loadContractors = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (activeFilters.length > 0) params.filters = JSON.stringify(activeFilters);

      const response = await contractorsAPI.getAll(params);

      if (response.success) {
        setContractors(response.data.contractors);
        setTotalCount(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Alvállalkozók betöltési hiba:', error);
      toast.error('Hiba az alvállalkozók betöltésekor');
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

  const handleRowClick = (contractorId) => {
    setSelectedContractorId(contractorId);
    setDetailModalOpen(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (activeFilters.length > 0) params.filters = JSON.stringify(activeFilters);

      const response = await exportAPI.contractors(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'alvallalkozok.xlsx');
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
          Alvállalkozók
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
            Új alvállalkozó
          </Button>
        </Stack>
      </Box>

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Keresés név, email, telefon vagy cím alapján..."
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
        fields={CONTRACTOR_FILTER_FIELDS}
        presetValues={CONTRACTOR_PRESET_VALUES}
        dynamicOptions={{}}
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
        ) : contractors.length === 0 ? (
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
                    <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Telefon</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Felhasználók</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Létrehozva</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contractors.map((contractor) => (
                    <TableRow
                      key={contractor.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(44, 95, 45, 0.04)' },
                      }}
                      onClick={() => handleRowClick(contractor.id)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2c5f2d' }}>
                          {contractor.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {contractor.email || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {contractor.phone || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {contractor.address || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {contractor.user_count}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={contractor.is_active ? 'Aktív' : 'Inaktív'}
                          size="small"
                          color={contractor.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(contractor.created_at).toLocaleDateString('hu-HU')}
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
      <CreateContractorModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          loadContractors();
          setPage(0);
        }}
      />

      <ContractorBulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => {
          loadContractors();
          setPage(0);
        }}
      />

      <ContractorDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        contractorId={selectedContractorId}
        onSuccess={loadContractors}
      />
    </Box>
  );
}

export default Contractors;
