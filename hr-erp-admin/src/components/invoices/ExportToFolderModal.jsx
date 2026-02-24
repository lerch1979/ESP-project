import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, CircularProgress, Divider, Chip,
  RadioGroup, Radio, FormControlLabel, FormControl, FormLabel,
  Select, MenuItem, InputLabel, Checkbox, FormGroup, LinearProgress,
  Alert, Paper,
} from '@mui/material';
import {
  FolderZip as ZipIcon, CalendarMonth as MonthIcon,
  AccountTree as CostCenterIcon, DateRange as DateRangeIcon,
  Description as ExcelIcon, InsertDriveFile as FileIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { costCentersAPI } from '../../services/api';
import CostCenterSelector from './CostCenterSelector';

const MONTHS_HU = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

const FILE_NAMING_FORMATS = [
  { value: 'detailed', label: '001_KoltseghelyNev_SzamlaNum.pdf', desc: 'Sorszám + Költséghely + Számlaszám' },
  { value: 'vendor', label: 'SzamlaNum_Szallito.pdf', desc: 'Számlaszám + Szállító neve' },
  { value: 'date', label: 'Datum_SzamlaNum.pdf', desc: 'Dátum + Számlaszám' },
];

function generateFolderName(mode, year, month, costCenterName) {
  if (mode === 'monthly') {
    const monthStr = String(month).padStart(2, '0');
    const monthName = MONTHS_HU[month - 1] || '';
    return `Szamlak_${year}_${monthStr}_${monthName.toLowerCase()}`;
  }
  if (mode === 'cost_center') {
    const safeName = (costCenterName || 'KoltseghelyNev')
      .replace(/[^a-zA-Z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, '')
      .substring(0, 30);
    return `${safeName}_${year}`;
  }
  return `Szamlak_export_${new Date().toISOString().substring(0, 10)}`;
}

export default function ExportToFolderModal({
  open, onClose,
  costCenters = [], costCenterTree = [],
}) {
  // Export mode
  const [mode, setMode] = useState('monthly');

  // Monthly mode
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // Cost center mode
  const [costCenterId, setCostCenterId] = useState('');
  const [costCenterYear, setCostCenterYear] = useState(now.getFullYear());

  // Custom date range mode
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Options
  const [includeFiles, setIncludeFiles] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [fileNamingFormat, setFileNamingFormat] = useState('detailed');

  // State
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Get selected cost center name for preview
  const selectedCCName = useMemo(() => {
    if (!costCenterId) return '';
    const cc = costCenters.find((c) => c.id === costCenterId);
    return cc ? cc.name : '';
  }, [costCenterId, costCenters]);

  // Folder name preview
  const folderName = useMemo(() => {
    if (mode === 'monthly') return generateFolderName('monthly', year, month);
    if (mode === 'cost_center') return generateFolderName('cost_center', costCenterYear, null, selectedCCName);
    return generateFolderName('custom', year);
  }, [mode, year, month, costCenterYear, selectedCCName]);

  // Years for picker
  const years = useMemo(() => {
    const currentYear = now.getFullYear();
    const arr = [];
    for (let y = currentYear; y >= currentYear - 5; y--) arr.push(y);
    return arr;
  }, []);

  const canExport = () => {
    if (!includeFiles && !includeSummary) return false;
    if (mode === 'cost_center' && !costCenterId) return false;
    if (mode === 'custom' && (!dateFrom || !dateTo)) return false;
    return true;
  };

  const handleExport = async () => {
    if (!canExport()) return;

    setExporting(true);
    setProgress(10);

    try {
      const payload = {
        mode,
        includeFiles,
        includeSummary,
        fileNamingFormat,
      };

      if (mode === 'monthly') {
        payload.year = year;
        payload.month = month;
      } else if (mode === 'cost_center') {
        payload.costCenterId = costCenterId;
        payload.year = costCenterYear;
      } else if (mode === 'custom') {
        payload.dateFrom = dateFrom;
        payload.dateTo = dateTo;
      }

      setProgress(30);

      const response = await costCentersAPI.exportToFolder(payload);

      setProgress(80);

      // Download the ZIP file
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProgress(100);
      toast.success('Export sikeres! A ZIP fájl letöltése megkezdődött.');

      setTimeout(() => {
        onClose();
        setProgress(0);
      }, 1000);
    } catch (error) {
      const message = error.response?.status === 404
        ? 'Nincs számla a megadott szűrőknek megfelelően'
        : error.response?.data?.message || 'Hiba az export során';
      toast.error(message);
      setProgress(0);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={exporting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
        <ZipIcon color="primary" />
        Számlák mappába exportálása
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Export mode selection */}
          <FormControl component="fieldset">
            <FormLabel sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 1 }}>Export mód</FormLabel>
            <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
              <Paper variant="outlined" sx={{
                p: 1.5, mb: 1, cursor: 'pointer',
                border: mode === 'monthly' ? '2px solid #2563eb' : undefined,
                bgcolor: mode === 'monthly' ? 'rgba(37, 99, 235, 0.04)' : undefined,
              }} onClick={() => setMode('monthly')}>
                <FormControlLabel
                  value="monthly"
                  control={<Radio size="small" />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MonthIcon fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>Havi elszámolás</Typography>
                        <Typography variant="caption" color="text.secondary">Adott hónap összes számlája</Typography>
                      </Box>
                    </Box>
                  }
                />
                {mode === 'monthly' && (
                  <Stack direction="row" spacing={2} sx={{ mt: 1.5, ml: 4 }}>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <InputLabel>Év</InputLabel>
                      <Select value={year} onChange={(e) => setYear(e.target.value)} label="Év">
                        {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>Hónap</InputLabel>
                      <Select value={month} onChange={(e) => setMonth(e.target.value)} label="Hónap">
                        {MONTHS_HU.map((name, idx) => (
                          <MenuItem key={idx} value={idx + 1}>{name}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                )}
              </Paper>

              <Paper variant="outlined" sx={{
                p: 1.5, mb: 1, cursor: 'pointer',
                border: mode === 'cost_center' ? '2px solid #2563eb' : undefined,
                bgcolor: mode === 'cost_center' ? 'rgba(37, 99, 235, 0.04)' : undefined,
              }} onClick={() => setMode('cost_center')}>
                <FormControlLabel
                  value="cost_center"
                  control={<Radio size="small" />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CostCenterIcon fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>Költséghely szerint</Typography>
                        <Typography variant="caption" color="text.secondary">Egy költséghely összes számlája</Typography>
                      </Box>
                    </Box>
                  }
                />
                {mode === 'cost_center' && (
                  <Stack direction="row" spacing={2} sx={{ mt: 1.5, ml: 4 }}>
                    <Box sx={{ flex: 1 }}>
                      <CostCenterSelector
                        value={costCenterId}
                        onChange={setCostCenterId}
                        costCenters={costCenters}
                        costCenterTree={costCenterTree}
                        label="Költséghely"
                      />
                    </Box>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <InputLabel>Év</InputLabel>
                      <Select value={costCenterYear} onChange={(e) => setCostCenterYear(e.target.value)} label="Év">
                        {years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Stack>
                )}
              </Paper>

              <Paper variant="outlined" sx={{
                p: 1.5, cursor: 'pointer',
                border: mode === 'custom' ? '2px solid #2563eb' : undefined,
                bgcolor: mode === 'custom' ? 'rgba(37, 99, 235, 0.04)' : undefined,
              }} onClick={() => setMode('custom')}>
                <FormControlLabel
                  value="custom"
                  control={<Radio size="small" />}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DateRangeIcon fontSize="small" color="primary" />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>Egyedi időszak</Typography>
                        <Typography variant="caption" color="text.secondary">Tetszőleges dátumtartomány</Typography>
                      </Box>
                    </Box>
                  }
                />
                {mode === 'custom' && (
                  <Stack direction="row" spacing={2} sx={{ mt: 1.5, ml: 4 }}>
                    <TextField
                      size="small" type="date" label="Dátumtól" value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      InputLabelProps={{ shrink: true }} sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small" type="date" label="Dátumig" value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      InputLabelProps={{ shrink: true }} sx={{ flex: 1 }}
                    />
                  </Stack>
                )}
              </Paper>
            </RadioGroup>
          </FormControl>

          <Divider />

          {/* Options */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
              Export beállítások
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={<Checkbox checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} size="small" />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileIcon fontSize="small" color="action" />
                    <Typography variant="body2">Számla fájlok mappába (PDF/kép)</Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={<Checkbox checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} size="small" />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ExcelIcon fontSize="small" color="action" />
                    <Typography variant="body2">Excel összesítő generálás</Typography>
                  </Box>
                }
              />
            </FormGroup>
          </Box>

          {/* File naming format */}
          {includeFiles && (
            <FormControl size="small" fullWidth>
              <InputLabel>Fájlnevek formátuma</InputLabel>
              <Select
                value={fileNamingFormat}
                onChange={(e) => setFileNamingFormat(e.target.value)}
                label="Fájlnevek formátuma"
              >
                {FILE_NAMING_FORMATS.map((fmt) => (
                  <MenuItem key={fmt.value} value={fmt.value}>
                    <Box>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {fmt.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{fmt.desc}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <Divider />

          {/* Folder name preview */}
          <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Letöltés neve:
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ZipIcon sx={{ color: '#f59e0b' }} />
              <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                {folderName}.zip
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {includeFiles && <Chip label="Számla fájlok" size="small" icon={<FileIcon />} variant="outlined" />}
              {includeSummary && <Chip label="Excel összesítő" size="small" icon={<ExcelIcon />} variant="outlined" />}
            </Stack>
          </Box>

          {/* Validation warning */}
          {!canExport() && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              {!includeFiles && !includeSummary
                ? 'Legalább egy export opciót válasszon ki'
                : mode === 'cost_center' && !costCenterId
                  ? 'Válasszon költséghelyet'
                  : 'Adja meg a dátum tartományt'}
            </Alert>
          )}

          {/* Progress */}
          {exporting && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">Export folyamatban...</Typography>
                <Typography variant="caption" color="text.secondary">{progress}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1 }} />
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={exporting}>Mégse</Button>
        <Button
          variant="contained"
          onClick={handleExport}
          disabled={exporting || !canExport()}
          startIcon={exporting ? <CircularProgress size={18} /> : <DownloadIcon />}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          {exporting ? 'Exportálás...' : 'Letöltés ZIP-ben'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
