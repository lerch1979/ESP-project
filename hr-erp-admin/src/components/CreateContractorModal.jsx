import React, { useState } from 'react';
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
import { contractorsAPI } from '../services/api';
import { toast } from 'react-toastify';

function CreateContractorModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    type: 'service_provider',
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Add meg az alvállalkozó nevét!');
      return;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('Érvénytelen email cím!');
      return;
    }

    setLoading(true);
    try {
      const response = await contractorsAPI.create(formData);

      if (response.success) {
        toast.success('Alvállalkozó sikeresen létrehozva!');
        onSuccess();
        handleClose();
      }
    } catch (error) {
      console.error('Alvállalkozó létrehozási hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba az alvállalkozó létrehozásakor');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ name: '', email: '', phone: '', address: '', type: 'service_provider' });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Új alvállalkozó létrehozása
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Név"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="pl. Housing Solutions Kft."
            />
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Típus</InputLabel>
              <Select
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
                label="Típus"
              >
                <MenuItem value="property_owner">Ingatlan tulajdonos</MenuItem>
                <MenuItem value="service_provider">Szolgáltató</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="pl. info@example.com"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Telefon"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="pl. +36 1 234 5678"
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
            bgcolor: '#2563eb',
            '&:hover': { bgcolor: '#1d4ed8' },
          }}
        >
          {loading ? <CircularProgress size={24} /> : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateContractorModal;
