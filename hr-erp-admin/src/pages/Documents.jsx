import React, { useState, useEffect } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { documentsAPI } from '../services/api';
import { toast } from 'react-toastify';
import UploadDocumentModal from '../components/UploadDocumentModal';
import DocumentDetailModal from '../components/DocumentDetailModal';
import ResponsiveTable from '../components/ResponsiveTable';

const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Szerződés', color: '#2563eb' },
  { value: 'certificate', label: 'Bizonyítvány', color: '#16a34a' },
  { value: 'id_card', label: 'Igazolvány másolat', color: '#7c3aed' },
  { value: 'medical', label: 'Orvosi dokumentum', color: '#ec4899' },
  { value: 'permit', label: 'Engedély', color: '#f59e0b' },
  { value: 'policy', label: 'Szabályzat', color: '#06b6d4' },
  { value: 'template', label: 'Sablon', color: '#64748b' },
  { value: 'other', label: 'Egyéb', color: '#94a3b8' },
];

function getDocTypeInfo(type) {
  return DOCUMENT_TYPES.find((dt) => dt.value === type) || { label: type, color: '#94a3b8' };
}

function formatFileSize(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function Documents() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);

  useEffect(() => {
    loadDocuments();
  }, [page, rowsPerPage, search, typeFilter]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };

      if (search) params.search = search;
      if (typeFilter !== 'all') params.document_type = typeFilter;

      const response = await documentsAPI.getAll(params);

      if (response.success) {
        setDocuments(response.data.documents);
        setTotalCount(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Dokumentumok betöltési hiba:', error);
      toast.error('Hiba a dokumentumok betöltésekor');
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
    setSelectedDocumentId(id);
    setDetailModalOpen(true);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: 3, flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
          Dokumentumok
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setUploadModalOpen(true)}
            sx={{
              bgcolor: '#2563eb',
              '&:hover': { bgcolor: '#1d4ed8' },
            }}
          >
            Feltöltés
          </Button>
        </Stack>
      </Box>

      {/* Search & Filter */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            fullWidth
            placeholder="Keresés cím, leírás vagy munkavállaló alapján..."
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
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Típus</InputLabel>
            <Select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              label="Típus"
            >
              <MenuItem value="all">Összes típus</MenuItem>
              {DOCUMENT_TYPES.map((dt) => (
                <MenuItem key={dt.value} value={dt.value}>
                  {dt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
            <CircularProgress />
          </Box>
        ) : documents.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary">
              Nincs találat
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Próbálj más keresési feltételt vagy tölts fel új dokumentumot.
            </Typography>
          </Box>
        ) : (
          <>
            <ResponsiveTable>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Munkavállaló</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Méret</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Feltöltötte</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Dátum</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {documents.map((doc) => {
                    const typeInfo = getDocTypeInfo(doc.document_type);
                    return (
                      <TableRow
                        key={doc.id}
                        hover
                        sx={{
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'rgba(37, 99, 235, 0.04)' },
                        }}
                        onClick={() => handleRowClick(doc.id)}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {doc.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {doc.file_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={typeInfo.label}
                            size="small"
                            sx={{
                              bgcolor: `${typeInfo.color}20`,
                              color: typeInfo.color,
                              fontWeight: 600,
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {doc.employee_last_name
                              ? `${doc.employee_last_name} ${doc.employee_first_name}`
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {formatFileSize(doc.file_size)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {doc.uploader_last_name
                              ? `${doc.uploader_last_name} ${doc.uploader_first_name}`
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {doc.created_at
                              ? new Date(doc.created_at).toLocaleDateString('hu-HU')
                              : '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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

      {/* Modals */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => {
          loadDocuments();
          setPage(0);
        }}
      />

      <DocumentDetailModal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        documentId={selectedDocumentId}
        onSuccess={loadDocuments}
      />
    </Box>
  );
}

export default Documents;
