import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  CircularProgress,
} from '@mui/material';
import { videosAPI } from '../services/api';
import { toast } from 'react-toastify';

const CATEGORIES = [
  { value: 'munkabiztonság', label: 'Munkabiztonság' },
  { value: 'beilleszkedés', label: 'Beilleszkedés' },
  { value: 'nyelvi_kurzus', label: 'Nyelvi kurzus' },
  { value: 'adminisztráció', label: 'Adminisztráció' },
  { value: 'szakmai_kepzes', label: 'Szakmai képzés' },
  { value: 'ceg_info', label: 'Céginformáció' },
];

function CreateVideoModal({ open, onClose, onSuccess, editData }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    url: '',
    thumbnail_url: '',
    category: 'ceg_info',
    duration: '',
  });
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(editData);

  useEffect(() => {
    if (editData) {
      setFormData({
        title: editData.title || '',
        description: editData.description || '',
        url: editData.url || '',
        thumbnail_url: editData.thumbnail_url || '',
        category: editData.category || 'ceg_info',
        duration: editData.duration ? String(editData.duration) : '',
      });
    } else {
      setFormData({
        title: '',
        description: '',
        url: '',
        thumbnail_url: '',
        category: 'ceg_info',
        duration: '',
      });
    }
  }, [editData, open]);

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.url.trim()) {
      toast.error('Cím és URL megadása kötelező');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        duration: parseInt(formData.duration) || 0,
      };

      if (isEdit) {
        await videosAPI.update(editData.id, payload);
        toast.success('Videó sikeresen frissítve');
      } else {
        await videosAPI.create(payload);
      }
      onSuccess();
    } catch (error) {
      toast.error(isEdit ? 'Videó frissítése sikertelen' : 'Videó létrehozása sikertelen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {isEdit ? 'Videó szerkesztése' : 'Új videó hozzáadása'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="Cím *"
            value={formData.title}
            onChange={handleChange('title')}
            fullWidth
          />
          <TextField
            label="Leírás"
            value={formData.description}
            onChange={handleChange('description')}
            fullWidth
            multiline
            rows={3}
          />
          <TextField
            label="Videó URL *"
            value={formData.url}
            onChange={handleChange('url')}
            fullWidth
            placeholder="https://www.youtube.com/watch?v=..."
            helperText="YouTube vagy Vimeo link"
          />
          <TextField
            label="Borítókép URL"
            value={formData.thumbnail_url}
            onChange={handleChange('thumbnail_url')}
            fullWidth
            placeholder="https://..."
            helperText="Opcionális - YouTube esetén automatikusan betöltődik"
          />
          <FormControl fullWidth>
            <InputLabel>Kategória</InputLabel>
            <Select
              value={formData.category}
              onChange={handleChange('category')}
              label="Kategória"
            >
              {CATEGORIES.map((cat) => (
                <MenuItem key={cat.value} value={cat.value}>
                  {cat.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Időtartam (másodperc)"
            value={formData.duration}
            onChange={handleChange('duration')}
            type="number"
            fullWidth
            placeholder="pl. 300 (= 5 perc)"
            helperText="Videó hossza másodpercben"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Mégse
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          {saving ? <CircularProgress size={24} /> : isEdit ? 'Mentés' : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateVideoModal;
