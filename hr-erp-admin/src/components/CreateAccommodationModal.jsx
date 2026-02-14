import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import { accommodationsAPI, contractorsAPI } from '../services/api';
import { toast } from 'react-toastify';

function CreateAccommodationModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [contractors, setContractors] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: 'studio',
    capacity: 1,
    current_contractor_id: '',
    status: 'available',
    monthly_rent: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      loadContractors();
    }
  }, [open]);

  const loadContractors = async () => {
    try {
      const response = await contractorsAPI.getAll({ limit: 500, is_active: 'true' });
      if (response.success) {
        setContractors(response.data.contractors);
      }
    } catch (error) {
      console.error('Alvállalkozók betöltési hiba:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Add meg a szálláshely nevét!');
      return;
    }

    const submitData = {
      ...formData,
      capacity: parseInt(formData.capacity) || 1,
      monthly_rent: formData.monthly_rent ? parseFloat(formData.monthly_rent) : null,
      current_contractor_id: formData.current_contractor_id || null,
    };

    setLoading(true);
    try {
      const response = await accommodationsAPI.create(submitData);

      if (response.success) {
        toast.success('Szálláshely sikeresen létrehozva!');
        onSuccess();
        handleClose();
      }
    } catch (error) {
      console.error('Szálláshely létrehozási hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a szálláshely létrehozásakor');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      address: '',
      type: 'studio',
      capacity: 1,
      current_contractor_id: '',
      status: 'available',
      monthly_rent: '',
      notes: '',
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Új szálláshely létrehozása
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Név / Megnevezés"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="pl. A épület 101"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Cím"
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="pl. 1052 Budapest, Példa utca 1."
            />
          </Grid>

          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Típus</InputLabel>
              <Select
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                label="Típus"
              >
                <MenuItem value="studio">Stúdió</MenuItem>
                <MenuItem value="1br">1 szobás</MenuItem>
                <MenuItem value="2br">2 szobás</MenuItem>
                <MenuItem value="3br">3 szobás</MenuItem>
                <MenuItem value="dormitory">Munkásszálló</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Kapacitás (fő)"
              type="number"
              value={formData.capacity}
              onChange={(e) => handleChange('capacity', e.target.value)}
              inputProps={{ min: 1 }}
            />
          </Grid>

          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Státusz</InputLabel>
              <Select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                label="Státusz"
              >
                <MenuItem value="available">Szabad</MenuItem>
                <MenuItem value="occupied">Foglalt</MenuItem>
                <MenuItem value="maintenance">Karbantartás</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Havi bérleti díj (Ft)"
              type="number"
              value={formData.monthly_rent}
              onChange={(e) => handleChange('monthly_rent', e.target.value)}
              placeholder="pl. 150000"
            />
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Jelenlegi alvállalkozó</InputLabel>
              <Select
                value={formData.current_contractor_id}
                onChange={(e) => handleChange('current_contractor_id', e.target.value)}
                label="Jelenlegi alvállalkozó"
              >
                <MenuItem value="">Nincs</MenuItem>
                {contractors.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Megjegyzések"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Mégse
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          sx={{
            bgcolor: '#2c5f2d',
            '&:hover': { bgcolor: '#234d24' },
          }}
        >
          {loading ? <CircularProgress size={24} /> : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateAccommodationModal;
