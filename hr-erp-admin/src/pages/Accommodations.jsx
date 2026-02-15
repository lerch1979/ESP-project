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
  Download as DownloadIcon,
} from '@mui/icons-material';
import { accommodationsAPI, exportAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateAccommodationModal from '../components/CreateAccommodationModal';
import AccommodationBulkImportModal from '../components/AccommodationBulkImportModal';
import AccommodationDetailModal from '../components/AccommodationDetailModal';

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedAccommodationId, setSelectedAccommodationId] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadAccommodations();
  }, [page, rowsPerPage, search, statusFilter, typeFilter]);

  const loadAccommodations = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;

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

  const clearFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setSearch('');
    setPage(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;

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

  const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || search;

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

      {/* Search & filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
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

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Státusz</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              label="Státusz"
            >
              <MenuItem value="all">Mind</MenuItem>
              <MenuItem value="available">Szabad</MenuItem>
              <MenuItem value="occupied">Foglalt</MenuItem>
              <MenuItem value="maintenance">Karbantartás</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Típus</InputLabel>
            <Select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              label="Típus"
            >
              <MenuItem value="all">Mind</MenuItem>
              <MenuItem value="studio">Stúdió</MenuItem>
              <MenuItem value="1br">1 szobás</MenuItem>
              <MenuItem value="2br">2 szobás</MenuItem>
              <MenuItem value="3br">3 szobás</MenuItem>
              <MenuItem value="dormitory">Munkásszálló</MenuItem>
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
