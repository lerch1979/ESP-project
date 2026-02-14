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
import { employeesAPI, accommodationsAPI } from '../services/api';
import { toast } from 'react-toastify';

function CreateEmployeeModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    employee_number: '',
    position: '',
    start_date: '',
    status_id: '',
    accommodation_id: '',
  });

  useEffect(() => {
    if (open) {
      loadDropdowns();
    }
  }, [open]);

  const loadDropdowns = async () => {
    try {
      const [statusRes, accRes] = await Promise.all([
        employeesAPI.getStatuses(),
        accommodationsAPI.getAll({ limit: 500 }),
      ]);
      if (statusRes.success) setStatuses(statusRes.data.statuses);
      if (accRes.success) setAccommodations(accRes.data.accommodations);
    } catch (error) {
      console.error('Dropdown betöltési hiba:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast.error('Vezetéknév és keresztnév megadása kötelező!');
      return;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('Érvénytelen email cím!');
      return;
    }

    setLoading(true);
    try {
      const submitData = {
        ...formData,
        accommodation_id: formData.accommodation_id || null,
        status_id: formData.status_id || null,
      };

      const response = await employeesAPI.create(submitData);

      if (response.success) {
        toast.success('Munkavállaló sikeresen létrehozva!');
        onSuccess();
        handleClose();
      }
    } catch (error) {
      console.error('Munkavállaló létrehozási hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a munkavállaló létrehozásakor');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      employee_number: '',
      position: '',
      start_date: '',
      status_id: '',
      accommodation_id: '',
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Új munkavállaló létrehozása
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              required
              label="Vezetéknév"
              value={formData.last_name}
              onChange={(e) => handleChange('last_name', e.target.value)}
              placeholder="pl. Nagy"
            />
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              required
              label="Keresztnév"
              value={formData.first_name}
              onChange={(e) => handleChange('first_name', e.target.value)}
              placeholder="pl. János"
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="pl. nagy.janos@example.com"
            />
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Telefon"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="pl. +36 30 123 4567"
            />
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Törzsszám"
              value={formData.employee_number}
              onChange={(e) => handleChange('employee_number', e.target.value)}
              placeholder="Automatikus ha üres"
            />
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Munkakör"
              value={formData.position}
              onChange={(e) => handleChange('position', e.target.value)}
              placeholder="pl. Építőipari munkás"
            />
          </Grid>

          <Grid item xs={6}>
            <TextField
              fullWidth
              label="Kezdés dátuma"
              type="date"
              value={formData.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Státusz</InputLabel>
              <Select
                value={formData.status_id}
                onChange={(e) => handleChange('status_id', e.target.value)}
                label="Státusz"
              >
                <MenuItem value="">Alapértelmezett (Aktív)</MenuItem>
                {statuses.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Szálláshely</InputLabel>
              <Select
                value={formData.accommodation_id}
                onChange={(e) => handleChange('accommodation_id', e.target.value)}
                label="Szálláshely"
              >
                <MenuItem value="">Nincs</MenuItem>
                {accommodations.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
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

export default CreateEmployeeModal;
