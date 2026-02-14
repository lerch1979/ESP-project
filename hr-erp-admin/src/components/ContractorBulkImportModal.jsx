import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { contractorsAPI } from '../services/api';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

function ContractorBulkImportModal({ open, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setResult(null);

    // Client-side parse for preview
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        if (rows.length > 0) {
          setHeaders(Object.keys(rows[0]));
          setPreview(rows.slice(0, 10));
        } else {
          toast.error('A fájl üres');
          setFile(null);
        }
      } catch {
        toast.error('Nem sikerült a fájl beolvasása');
        setFile(null);
      }
    };
    reader.readAsArrayBuffer(selectedFile);
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const response = await contractorsAPI.bulkImport(file);

      if (response.success) {
        setResult(response.data);
        toast.success(response.message);
        onSuccess();
      }
    } catch (error) {
      console.error('Import hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba az importálás közben');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Tömeges alvállalkozó importálás
        </Typography>
      </DialogTitle>

      <DialogContent>
        {/* File drop zone */}
        {!file && (
          <Box
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: '2px dashed #ccc',
              borderRadius: 2,
              p: 5,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': { borderColor: '#2c5f2d', bgcolor: 'rgba(44, 95, 45, 0.04)' },
            }}
          >
            <UploadIcon sx={{ fontSize: 48, color: '#999', mb: 1 }} />
            <Typography variant="h6" color="text.secondary">
              Kattints vagy húzd ide a fájlt
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Támogatott formátumok: .xlsx, .xls, .csv
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Oszlopok: Név, Email, Telefon, Cím
            </Typography>
          </Box>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* Preview table */}
        {preview.length > 0 && !result && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Előnézet ({file.name}) - Első {preview.length} sor:
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {headers.map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 600 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.map((row, idx) => (
                    <TableRow key={idx}>
                      {headers.map((h) => (
                        <TableCell key={h}>{row[h]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Import result */}
        {result && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              {result.imported} alvállalkozó sikeresen importálva
            </Alert>

            {result.errors && result.errors.length > 0 && (
              <Alert severity="warning" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {result.errors.length} hiba történt:
                </Typography>
                <List dense>
                  {result.errors.map((err, idx) => (
                    <ListItem key={idx} sx={{ py: 0 }}>
                      <ListItemText
                        primary={`Sor ${err.row}: ${err.message}`}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          {result ? 'Bezárás' : 'Mégse'}
        </Button>
        {!result && (
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={loading || !file}
            sx={{
              bgcolor: '#2c5f2d',
              '&:hover': { bgcolor: '#234d24' },
            }}
          >
            {loading ? <CircularProgress size={24} /> : 'Importálás'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ContractorBulkImportModal;
