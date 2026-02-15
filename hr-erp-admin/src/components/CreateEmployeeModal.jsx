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
  Divider,
} from '@mui/material';
import { employeesAPI, accommodationsAPI } from '../services/api';
import { toast } from 'react-toastify';

const initialFormData = {
  first_name: '',
  last_name: '',
  gender: '',
  birth_date: '',
  birth_place: '',
  mothers_name: '',
  marital_status: '',
  tax_id: '',
  passport_number: '',
  social_security_number: '',
  visa_expiry: '',
  employee_number: '',
  position: '',
  workplace: '',
  arrival_date: '',
  start_date: '',
  status_id: '',
  accommodation_id: '',
  room_number: '',
  permanent_address_zip: '',
  permanent_address_country: '',
  permanent_address_county: '',
  permanent_address_city: '',
  permanent_address_street: '',
  permanent_address_number: '',
  company_name: '',
  company_email: '',
  company_phone: '',
  bank_account: '',
  email: '',
  phone: '',
  notes: '',
};

function CreateEmployeeModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [formData, setFormData] = useState({ ...initialFormData });

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
    setFormData({ ...initialFormData });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Új munkavállaló létrehozása
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>

          {/* 1. Személyes adatok */}
          <Grid item xs={12}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Személyes adatok</Typography>
            <Divider />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth required label="Vezetéknév" value={formData.last_name}
              onChange={(e) => handleChange('last_name', e.target.value)} placeholder="pl. Nagy" />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth required label="Keresztnév" value={formData.first_name}
              onChange={(e) => handleChange('first_name', e.target.value)} placeholder="pl. János" />
          </Grid>
          <Grid item xs={6} md={4}>
            <FormControl fullWidth>
              <InputLabel>Nem</InputLabel>
              <Select value={formData.gender} onChange={(e) => handleChange('gender', e.target.value)} label="Nem">
                <MenuItem value="">-</MenuItem>
                <MenuItem value="male">Férfi</MenuItem>
                <MenuItem value="female">Nő</MenuItem>
                <MenuItem value="other">Egyéb</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Születési dátum" type="date" value={formData.birth_date}
              onChange={(e) => handleChange('birth_date', e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Születési hely" value={formData.birth_place}
              onChange={(e) => handleChange('birth_place', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Anyja neve" value={formData.mothers_name}
              onChange={(e) => handleChange('mothers_name', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <FormControl fullWidth>
              <InputLabel>Családi állapot</InputLabel>
              <Select value={formData.marital_status} onChange={(e) => handleChange('marital_status', e.target.value)} label="Családi állapot">
                <MenuItem value="">-</MenuItem>
                <MenuItem value="single">Egyedülálló</MenuItem>
                <MenuItem value="married">Házas</MenuItem>
                <MenuItem value="divorced">Elvált</MenuItem>
                <MenuItem value="widowed">Özvegy</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* 2. Okmányok */}
          <Grid item xs={12} sx={{ mt: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Okmányok</Typography>
            <Divider />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Adóazonosító" value={formData.tax_id}
              onChange={(e) => handleChange('tax_id', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Útlevélszám" value={formData.passport_number}
              onChange={(e) => handleChange('passport_number', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="TAJ szám" value={formData.social_security_number}
              onChange={(e) => handleChange('social_security_number', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Vízum lejárat" type="date" value={formData.visa_expiry}
              onChange={(e) => handleChange('visa_expiry', e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>

          {/* 3. Munka adatok */}
          <Grid item xs={12} sx={{ mt: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Munka adatok</Typography>
            <Divider />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Törzsszám" value={formData.employee_number}
              onChange={(e) => handleChange('employee_number', e.target.value)} placeholder="Automatikus ha üres" />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Munkakör" value={formData.position}
              onChange={(e) => handleChange('position', e.target.value)} placeholder="pl. Építőipari munkás" />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Munkahely" value={formData.workplace}
              onChange={(e) => handleChange('workplace', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Érkezés dátuma" type="date" value={formData.arrival_date}
              onChange={(e) => handleChange('arrival_date', e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Kezdés dátuma" type="date" value={formData.start_date}
              onChange={(e) => handleChange('start_date', e.target.value)} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={6} md={4}>
            <FormControl fullWidth>
              <InputLabel>Státusz</InputLabel>
              <Select value={formData.status_id} onChange={(e) => handleChange('status_id', e.target.value)} label="Státusz">
                <MenuItem value="">Alapértelmezett (Aktív)</MenuItem>
                {statuses.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* 4. Szálláshely */}
          <Grid item xs={12} sx={{ mt: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Szálláshely</Typography>
            <Divider />
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Szálláshely</InputLabel>
              <Select value={formData.accommodation_id} onChange={(e) => handleChange('accommodation_id', e.target.value)} label="Szálláshely">
                <MenuItem value="">Nincs</MenuItem>
                {accommodations.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <TextField fullWidth label="Szobaszám" value={formData.room_number}
              onChange={(e) => handleChange('room_number', e.target.value)} />
          </Grid>

          {/* 5. Állandó lakcím */}
          <Grid item xs={12} sx={{ mt: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Állandó lakcím</Typography>
            <Divider />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Irányítószám" value={formData.permanent_address_zip}
              onChange={(e) => handleChange('permanent_address_zip', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Ország" value={formData.permanent_address_country}
              onChange={(e) => handleChange('permanent_address_country', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Megye" value={formData.permanent_address_county}
              onChange={(e) => handleChange('permanent_address_county', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Város" value={formData.permanent_address_city}
              onChange={(e) => handleChange('permanent_address_city', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Utca" value={formData.permanent_address_street}
              onChange={(e) => handleChange('permanent_address_street', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Házszám" value={formData.permanent_address_number}
              onChange={(e) => handleChange('permanent_address_number', e.target.value)} />
          </Grid>

          {/* 6. Cég adatok */}
          <Grid item xs={12} sx={{ mt: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Cég adatok</Typography>
            <Divider />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Cégnév" value={formData.company_name}
              onChange={(e) => handleChange('company_name', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Céges email" value={formData.company_email}
              onChange={(e) => handleChange('company_email', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Céges telefon" value={formData.company_phone}
              onChange={(e) => handleChange('company_phone', e.target.value)} />
          </Grid>

          {/* 7. Egyéb */}
          <Grid item xs={12} sx={{ mt: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Egyéb</Typography>
            <Divider />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Bankszámlaszám" value={formData.bank_account}
              onChange={(e) => handleChange('bank_account', e.target.value)} />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Email" type="email" value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)} placeholder="pl. nagy.janos@example.com" />
          </Grid>
          <Grid item xs={6} md={4}>
            <TextField fullWidth label="Telefon" value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)} placeholder="pl. +36 30 123 4567" />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={2} label="Megjegyzések" value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)} />
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
