import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Chip,
  CircularProgress,
  Box,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { documentsAPI, employeesAPI } from '../services/api';
import { toast } from 'react-toastify';

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

function fmtDate(val) {
  if (!val) return '-';
  return new Date(val).toLocaleDateString('hu-HU');
}

function DocumentDetailModal({ open, onClose, documentId, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    if (open && documentId) {
      setEditing(false);
      loadDocument();
      loadEmployees();
    }
  }, [open, documentId]);

  const loadDocument = async () => {
    setLoading(true);
    try {
      const response = await documentsAPI.getById(documentId);
      if (response.success) {
        setDocument(response.data.document);
      }
    } catch (error) {
      console.error('Dokumentum betöltési hiba:', error);
      toast.error('Hiba a dokumentum betöltésekor');
    } finally {
      setLoading(false);
    }
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

  const handleStartEdit = () => {
    setEditData({
      title: document.title || '',
      description: document.description || '',
      document_type: document.document_type || 'other',
      employee_id: document.employee_id || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!editData.title?.trim()) {
      toast.error('Cím megadása kötelező');
      return;
    }

    setSaving(true);
    try {
      const response = await documentsAPI.update(documentId, {
        title: editData.title.trim(),
        description: editData.description || null,
        document_type: editData.document_type,
        employee_id: editData.employee_id || null,
      });
      if (response.success) {
        toast.success('Dokumentum sikeresen frissítve');
        setDocument(response.data.document);
        setEditing(false);
        onSuccess?.();
      }
    } catch (error) {
      console.error('Frissítési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a dokumentum frissítésekor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Biztosan törölni szeretné ezt a dokumentumot?')) return;

    try {
      const response = await documentsAPI.delete(documentId);
      if (response.success) {
        toast.success('Dokumentum sikeresen törölve');
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      console.error('Törlési hiba:', error);
      toast.error('Hiba a dokumentum törlésekor');
    }
  };

  const handleDownload = async () => {
    try {
      const response = await documentsAPI.download(documentId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = window.document.createElement('a');
      link.href = url;
      link.setAttribute('download', document.file_name || 'document');
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Letöltési hiba:', error);
      toast.error('Hiba a dokumentum letöltésekor');
    }
  };

  const typeInfo = document ? getDocTypeInfo(document.document_type) : {};

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Dokumentum részletek
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : !document ? (
          <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            Dokumentum nem található
          </Typography>
        ) : editing ? (
          /* Edit mode */
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Cím *"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                size="small"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Leírás"
                value={editData.description}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                size="small"
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Dokumentum típus</InputLabel>
                <Select
                  value={editData.document_type}
                  onChange={(e) => setEditData({ ...editData, document_type: e.target.value })}
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
                <InputLabel>Munkavállaló</InputLabel>
                <Select
                  value={editData.employee_id}
                  onChange={(e) => setEditData({ ...editData, employee_id: e.target.value })}
                  label="Munkavállaló"
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
        ) : (
          /* View mode */
          <Box>
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                {document.title}
              </Typography>
              <Chip
                label={typeInfo.label}
                size="small"
                sx={{
                  bgcolor: `${typeInfo.color}20`,
                  color: typeInfo.color,
                  fontWeight: 600,
                }}
              />
            </Box>

            {document.description && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Leírás
                </Typography>
                <Typography variant="body2">{document.description}</Typography>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={1.5}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Fájlnév</Typography>
                <Typography variant="body2">{document.file_name}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Méret</Typography>
                <Typography variant="body2">{formatFileSize(document.file_size)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Munkavállaló</Typography>
                <Typography variant="body2">
                  {document.employee_last_name
                    ? `${document.employee_last_name} ${document.employee_first_name}`
                    : '-'}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Feltöltötte</Typography>
                <Typography variant="body2">
                  {document.uploader_last_name
                    ? `${document.uploader_last_name} ${document.uploader_first_name}`
                    : '-'}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Feltöltve</Typography>
                <Typography variant="body2">{fmtDate(document.created_at)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Módosítva</Typography>
                <Typography variant="body2">{fmtDate(document.updated_at)}</Typography>
              </Grid>
            </Grid>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        {!loading && document && !editing && (
          <>
            <Button
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDelete}
            >
              Törlés
            </Button>
            <Box>
              <Button
                startIcon={<EditIcon />}
                onClick={handleStartEdit}
                sx={{ mr: 1 }}
              >
                Szerkesztés
              </Button>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
                sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
              >
                Letöltés
              </Button>
            </Box>
          </>
        )}
        {editing && (
          <>
            <Box />
            <Box>
              <Button onClick={() => setEditing(false)} disabled={saving} sx={{ mr: 1 }}>
                Mégse
              </Button>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saving || !editData.title?.trim()}
                startIcon={saving ? <CircularProgress size={18} /> : null}
                sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
              >
                Mentés
              </Button>
            </Box>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default DocumentDetailModal;
