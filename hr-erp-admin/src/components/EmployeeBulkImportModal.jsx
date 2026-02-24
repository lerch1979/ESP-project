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
import { CloudUpload as UploadIcon, Download as DownloadIcon } from '@mui/icons-material';
import { employeesAPI } from '../services/api';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';

function EmployeeBulkImportModal({ open, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const downloadTemplate = () => {
    const headers = [
      'Vezetéknév', 'Keresztnév', 'Nem', 'Születési dátum', 'Születési hely',
      'Anyja neve', 'Családi állapot', 'Adóazonosító', 'Útlevélszám', 'TAJ szám',
      'Email', 'Telefon', 'Munkakör', 'Törzsszám', 'Munkahely',
      'Érkezés dátuma', 'Vízum lejárat', 'Szálláshely', 'Szobaszám',
      'Bankszámlaszám', 'Irányítószám', 'Ország', 'Megye', 'Város',
      'Utca', 'Házszám', 'Cégnév', 'Céges email', 'Céges telefon',
    ];

    const exampleRow = [
      'Kovács', 'János', 'Férfi', '1990-05-15', 'Budapest',
      'Nagy Mária', 'Nős', '8461234567', 'BA1234567', '123 456 789',
      'kovacs.janos@example.com', '+36301234567', 'Villanyszerelő', 'EMP-0001', 'Budapest központ',
      '2026-01-15', '2027-01-15', 'Fő utca szálló', '101',
      'HU12 1234 5678 9012 3456 7890 1234', '1011', 'Magyarország', 'Pest', 'Budapest',
      'Fő utca', '12/A', 'Housing Solutions Kft', 'kovacs@housingsolutions.hu', '+3612345678',
    ];

    // Data sheet
    const dataSheet = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

    // Column widths
    dataSheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));

    // Instructions sheet
    const instructions = [
      ['Munkavállaló importálás - Útmutató'],
      [],
      ['Általános szabályok:'],
      ['- Az első sor (fejléc) NE legyen módosítva'],
      ['- A 2. sorban egy minta adat található, azt töröld ki és írd be a sajátodat'],
      ['- Minimum a Vezetéknév VAGY Keresztnév megadása kötelező'],
      ['- A dátumok formátuma: ÉÉÉÉ-HH-NN (pl. 2026-01-15)'],
      ['- A Nem mező értékei: Férfi, Nő'],
      ['- A Szálláshely mező a rendszerben létező szálláshely nevét várja'],
      [],
      ['Oszlop magyarázatok:'],
      ['Vezetéknév', 'Munkavállaló vezetékneve (kötelező)'],
      ['Keresztnév', 'Munkavállaló keresztneve (kötelező)'],
      ['Nem', 'Férfi vagy Nő'],
      ['Születési dátum', 'Formátum: ÉÉÉÉ-HH-NN'],
      ['Születési hely', 'Település neve'],
      ['Anyja neve', 'Teljes név'],
      ['Családi állapot', 'Pl. Egyedülálló, Házas, Nős, Elvált'],
      ['Adóazonosító', '10 számjegyű adóazonosító jel'],
      ['Útlevélszám', 'Útlevél száma'],
      ['TAJ szám', 'Társadalombiztosítási Azonosító Jel (XXX XXX XXX)'],
      ['Email', 'Személyes email cím'],
      ['Telefon', 'Telefonszám (+36...)'],
      ['Munkakör', 'Betöltött pozíció/munkakör'],
      ['Törzsszám', 'Alkalmazotti azonosító (ha üres, automatikusan generálódik)'],
      ['Munkahely', 'Munkavégzés helye'],
      ['Érkezés dátuma', 'Munkába állás dátuma (ÉÉÉÉ-HH-NN)'],
      ['Vízum lejárat', 'Vízum lejárati dátuma (ÉÉÉÉ-HH-NN)'],
      ['Szálláshely', 'A rendszerben létező szálláshely neve'],
      ['Szobaszám', 'Szobaszám a szálláshelyen'],
      ['Bankszámlaszám', 'IBAN vagy bankszámlaszám'],
      ['Irányítószám', 'Állandó lakcím irányítószáma'],
      ['Ország', 'Állandó lakcím országa'],
      ['Megye', 'Állandó lakcím megyéje'],
      ['Város', 'Állandó lakcím városa'],
      ['Utca', 'Állandó lakcím utcája'],
      ['Házszám', 'Állandó lakcím házszáma'],
      ['Cégnév', 'Foglalkoztató cég neve'],
      ['Céges email', 'Munkahelyi email cím'],
      ['Céges telefon', 'Munkahelyi telefonszám'],
    ];
    const guideSheet = XLSX.utils.aoa_to_sheet(instructions);
    guideSheet['!cols'] = [{ wch: 25 }, { wch: 55 }];

    // Build workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Munkavállalók');
    XLSX.utils.book_append_sheet(wb, guideSheet, 'Útmutató');

    XLSX.writeFile(wb, 'munkavallakok_sablon.xlsx');
    toast.success('Sablon letöltve!');
  };

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
      const response = await employeesAPI.bulkImport(file);

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
          Tömeges munkavállaló importálás
        </Typography>
      </DialogTitle>

      <DialogContent>
        {/* Template download */}
        {!result && (
          <Box sx={{ mb: 3, p: 2, bgcolor: '#f0f7ff', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Sablon letöltése
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Töltsd le a sablont, töltsd ki, majd töltsd fel itt
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadTemplate}
              sx={{
                borderColor: '#2563eb',
                color: '#2563eb',
                '&:hover': { borderColor: '#1d4ed8', bgcolor: 'rgba(37, 99, 235, 0.04)' },
              }}
            >
              .xlsx sablon
            </Button>
          </Box>
        )}

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
              '&:hover': { borderColor: '#2563eb', bgcolor: 'rgba(37, 99, 235, 0.04)' },
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
              Oszlopok: Vezetéknév, Keresztnév, Nem, Születési dátum, Születési hely, Anyja neve, Családi állapot, Adóazonosító, Útlevélszám, TAJ szám, Email, Telefon, Munkakör, Törzsszám, Munkahely, Érkezés dátuma, Vízum lejárat, Szálláshely, Szobaszám, Bankszámlaszám, Irányítószám, Ország, Megye, Város, Utca, Házszám, Cégnév, Céges email, Céges telefon
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
              {result.imported} munkavállaló sikeresen importálva
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
              bgcolor: '#2563eb',
              '&:hover': { bgcolor: '#1d4ed8' },
            }}
          >
            {loading ? <CircularProgress size={24} /> : 'Importálás'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default EmployeeBulkImportModal;
