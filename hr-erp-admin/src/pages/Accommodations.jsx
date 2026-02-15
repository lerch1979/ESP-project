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
import { accommodationsAPI, exportAPI, reportsAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateAccommodationModal from '../components/CreateAccommodationModal';
import AccommodationBulkImportModal from '../components/AccommodationBulkImportModal';
import AccommodationDetailModal from '../components/AccommodationDetailModal';
import FilterBuilder from '../components/FilterBuilder';

const ACCOMMODATION_FILTER_FIELDS = [
  { key: 'status', label: 'Állapot', type: 'preset' },
  { key: 'type', label: 'Típus', type: 'preset' },
  { key: 'contractor', label: 'Alvállalkozó', type: 'dynamic' },
];

const ACCOMMODATION_PRESET_VALUES = {
  status: [
    { value: 'available', label: 'Szabad' },
    { value: 'occupied', label: 'Foglalt' },
    { value: 'maintenance', label: 'Karbantartás' },
  ],
  type: [
    { value: 'studio', label: 'Stúdió' },
    { value: '1br', label: '1 szobás' },
    { value: '2br', label: '2 szobás' },
    { value: '3br', label: '3 szobás' },
    { value: 'dormitory', label: 'Kollégium' },
  ],
};

const STATUS_LABELS = {
  available: 'Szabad',
  occupied: 'Foglalt',
  maintenance: 'Karbantartás',
};

const STATUS_COLORS = {
  available: 'success',
  occupied: 'warning',
  maintenance: 'error',
};

const TYPE_LABELS = {
  studio: 'Stúdió',
  '1br': '1 szobás',
  '2br': '2 szobás',
  '3br': '3 szobás',
  dormitory: 'Munkásszálló',
};

function Accommodations() {
  const [loading, setLoading] = useState(true);
  const [accommodations, setAccommodations] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAccommodationId, setSelectedAccommodationId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  useEffect(() => {
    loadAccommodations();
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
      contractor: (filterOptions.accommodations?.contractors || []).map(c => ({ value: String(c.id), label: c.name })),
    };
  };

  const loadAccommodations = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (activeFilters.length > 0) params.filters = JSON.stringify(activeFilters);

      const response = await accommodationsAPI.getAll(params);

      if (response.success) {
        setAccommodations(response.data.accommodations);
        setTotalCount(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Szálláshelyek betöltési hiba:', error);
      toast.error('Hiba a szálláshelyek betöltésekor');
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
    setSelectedAccommodationId(id);
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

      const response = await exportAPI.accommodations(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'szallashelyek.xlsx');
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

  const formatRent = (rent) => {
    if (!rent) return '-';
    return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(rent);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Szálláshelyek
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
            Új szálláshely
          </Button>
        </Stack>
      </Box>

      {/* Search */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Keresés név, cím vagy megjegyzés alapján..."
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
        fields={ACCOMMODATION_FILTER_FIELDS}
        presetValues={ACCOMMODATION_PRESET_VALUES}
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
        ) : accommodations.length === 0 ? (
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
                    <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Kapacitás</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Jelenlegi alvállalkozó</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Havi díj</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {accommodations.map((acc) => (
                    <TableRow
                      key={acc.id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(44, 95, 45, 0.04)' },
                      }}
                      onClick={() => handleRowClick(acc.id)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2c5f2d' }}>
                          {acc.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {acc.address || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {TYPE_LABELS[acc.type] || acc.type}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {acc.capacity} fő
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {acc.current_contractor_name || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[acc.status] || acc.status}
                          size="small"
                          color={STATUS_COLORS[acc.status] || 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatRent(acc.monthly_rent)}
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
      <CreateAccommodationModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          loadAccommodations();
          setPage(0);
        }}
      />

      <AccommodationBulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onSuccess={() => {
          loadAccommodations();
          setPage(0);
        }}
      />

      <AccommodationDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        accommodationId={selectedAccommodationId}
        onSuccess={loadAccommodations}
      />
    </Box>
  );
}

export default Accommodations;
