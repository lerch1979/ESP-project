import React, { useState, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Stack,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  InsertDriveFile as FileIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { employeesAPI } from '../services/api';

export default function ResidentImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'application/csv',
      ];
      if (!validTypes.includes(selected.type) && !selected.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError('Csak .xlsx, .xls vagy .csv fájlok engedélyezettek.');
        setFile(null);
        return;
      }
      setFile(selected);
      setError(null);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const response = await employeesAPI.bulkImport(file);
      setResult(response.data || response);
    } catch (err) {
      const msg = err.response?.data?.message || 'Hiba történt a feltöltés során.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      <Button
        startIcon={<BackIcon />}
        onClick={() => navigate('/employees')}
        sx={{ mb: 2 }}
      >
        Vissza a lakókhoz
      </Button>

      <Typography variant="h4" gutterBottom>
        Lakók tömeges feltöltése
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Töltsön fel egy Excel (.xlsx, .xls) vagy CSV fájlt a lakók tömeges importálásához.
      </Typography>

      {/* Upload area */}
      <Paper sx={{ p: 4, mb: 3, textAlign: 'center' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="file-upload"
        />

        {!file ? (
          <Box>
            <UploadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Válasszon fájlt a feltöltéshez
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Elfogadott formátumok: .xlsx, .xls, .csv (max 5MB)
            </Typography>
            <Button
              variant="contained"
              component="label"
              htmlFor="file-upload"
              startIcon={<UploadIcon />}
            >
              Fájl kiválasztása
            </Button>
          </Box>
        ) : (
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mb: 2 }}>
              <FileIcon color="primary" />
              <Typography variant="body1">{file.name}</Typography>
              <Chip
                label={`${(file.size / 1024).toFixed(1)} KB`}
                size="small"
                variant="outlined"
              />
            </Stack>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button
                variant="contained"
                color="primary"
                onClick={handleUpload}
                disabled={uploading}
                startIcon={<UploadIcon />}
              >
                {uploading ? 'Feltöltés...' : 'Feltöltés'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleReset}
                disabled={uploading}
              >
                Mégse
              </Button>
            </Stack>
          </Box>
        )}

        {uploading && <LinearProgress sx={{ mt: 2 }} />}
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Results */}
      {result && (
        <Paper sx={{ p: 3 }}>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Alert
              severity="success"
              icon={<SuccessIcon />}
              sx={{ flex: 1 }}
            >
              Sikeresen importálva: <strong>{result.imported}</strong> lakó
            </Alert>
            {result.errors && result.errors.length > 0 && (
              <Alert
                severity="warning"
                icon={<ErrorIcon />}
                sx={{ flex: 1 }}
              >
                Hibás sorok: <strong>{result.errors.length}</strong>
              </Alert>
            )}
          </Stack>

          {result.errors && result.errors.length > 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Hibák részletei
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Sor</TableCell>
                      <TableCell>Hiba</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.errors.map((err, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{err.row}</TableCell>
                        <TableCell>{err.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          <Button
            variant="outlined"
            onClick={handleReset}
            sx={{ mt: 2 }}
          >
            Újabb feltöltés
          </Button>
        </Paper>
      )}

      {/* Column guide */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Elfogadott oszlopok
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Az Excel fájl első sora tartalmazza az oszlopneveket. Az alábbi oszlopnevek támogatottak:
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Oszlop neve</TableCell>
                <TableCell>Leírás</TableCell>
                <TableCell>Kötelező</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                ['Név', 'Teljes név (Vezetéknév Keresztnév)', 'Igen'],
                ['E-mail cím', 'E-mail cím', 'Nem'],
                ['Telefonszám', 'Telefonszám', 'Nem'],
                ['Születési dátum', 'Születési dátum', 'Nem'],
                ['Nemzetiség', 'Nemzetiség', 'Nem'],
                ['Személyi igazolvány szám', 'Személyi igazolvány száma', 'Nem'],
                ['Vállalat', 'Vállalat / cég neve', 'Nem'],
                ['Pozíció', 'Munkakör / pozíció', 'Nem'],
                ['Szálláshely', 'Szálláshely neve (meg kell egyeznie a rendszerben lévő névvel)', 'Nem'],
              ].map(([col, desc, req]) => (
                <TableRow key={col}>
                  <TableCell><strong>{col}</strong></TableCell>
                  <TableCell>{desc}</TableCell>
                  <TableCell>
                    <Chip
                      label={req}
                      size="small"
                      color={req === 'Igen' ? 'error' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
