import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  CircularProgress,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
} from '@mui/material';
import { CloudUpload as UploadIcon } from '@mui/icons-material';
import { documentsAPI, employeesAPI } from '../services/api';
import { toast } from 'react-toastify';

const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Szerződés' },
  { value: 'certificate', label: 'Bizonyítvány' },
  { value: 'id_card', label: 'Igazolvány másolat' },
  { value: 'medical', label: 'Orvosi dokumentum' },
  { value: 'permit', label: 'Engedély' },
  { value: 'policy', label: 'Szabályzat' },
  { value: 'template', label: 'Sablon' },
  { value: 'other', label: 'Egyéb' },
];

function UploadDocumentModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [documentType, setDocumentType] = useState('other');
  const [employeeId, setEmployeeId] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      loadEmployees();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setFile(null);
    setTitle('');
    setDescription('');
    setDocumentType('other');
    setEmployeeId('');
  };

  const loadEmployees = async () => {
    try {
      const response = await employeesAPI.getAll({ limit: 500 });
      if (response.success) {
        setEmployees(response.data.employees);
      }
    } catch (error) {
      console.error('Munkavállalók betöltési hiba:', error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      if (!title) {
        setTitle(droppedFile.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSubmit = async () => {
    if (!file) {
      toast.error('Kérjük válasszon fájlt');
      return;
    }
    if (!title.trim()) {
      toast.error('Cím megadása kötelező');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      if (description) formData.append('description', description);
      formData.append('document_type', documentType);
      if (employeeId) formData.append('employee_id', employeeId);

      const response = await documentsAPI.create(formData);
      if (response.success) {
        toast.success('Dokumentum sikeresen feltöltve');
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      console.error('Feltöltési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a dokumentum feltöltésekor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Dokumentum feltöltése</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          {/* Drag & Drop area */}
          <Box
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            sx={{
              border: '2px dashed',
              borderColor: dragOver ? '#2563eb' : file ? '#2563eb' : '#ccc',
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: dragOver ? 'rgba(37, 99, 235, 0.04)' : file ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
              mb: 2,
              transition: 'all 0.2s',
              '&:hover': {
                borderColor: '#2563eb',
                bgcolor: 'rgba(37, 99, 235, 0.04)',
              },
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
            />
            <UploadIcon sx={{ fontSize: 40, color: file ? '#2563eb' : '#999', mb: 1 }} />
            {file ? (
              <>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {file.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatFileSize(file.size)}
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="body1" color="text.secondary">
                  Húzza ide a fájlt, vagy kattintson a tallózáshoz
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  PDF, képek, Word, Excel, CSV, szöveg (max. 20MB)
                </Typography>
              </>
            )}
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Cím *"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                size="small"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Leírás"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                size="small"
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Dokumentum típus</InputLabel>
                <Select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  label="Dokumentum típus"
                >
                  {DOCUMENT_TYPES.map((dt) => (
                    <MenuItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Munkavállaló (opcionális)</InputLabel>
                <Select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  label="Munkavállaló (opcionális)"
                >
                  <MenuItem value="">
                    <em>Nincs (általános dokumentum)</em>
                  </MenuItem>
                  {employees.map((emp) => (
                    <MenuItem key={emp.id} value={emp.id}>
                      {emp.last_name} {emp.first_name} {emp.employee_number ? `(${emp.employee_number})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Mégse
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading || !file || !title.trim()}
          startIcon={loading ? <CircularProgress size={18} /> : <UploadIcon />}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          Feltöltés
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default UploadDocumentModal;
