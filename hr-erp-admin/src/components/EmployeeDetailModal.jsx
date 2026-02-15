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
} from '@mui/material';
import { employeesAPI, accommodationsAPI } from '../services/api';
import { toast } from 'react-toastify';

const GENDER_LABELS = { male: 'Férfi', female: 'Nő', other: 'Egyéb' };
const MARITAL_LABELS = { single: 'Egyedülálló', married: 'Házas', divorced: 'Elvált', widowed: 'Özvegy' };

function fmtDate(val) {
  if (!val) return '-';
  return new Date(val).toLocaleDateString('hu-HU');
}

function splitDate(val) {
  if (!val) return '';
  return val.split('T')[0];
}

function EmployeeDetailModal({ open, onClose, employeeId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (open && employeeId) {
      loadEmployee();
      setEditing(false);
    }
  }, [open, employeeId]);

  const loadEmployee = async () => {
    setLoading(true);
    try {
      const response = await employeesAPI.getById(employeeId);
      if (response.success) {
        const emp = response.data.employee;
        setEmployee(emp);
        setFormData({
          employee_number: emp.employee_number || '',
          position: emp.position || '',
          workplace: emp.workplace || '',
          start_date: splitDate(emp.start_date),
          end_date: splitDate(emp.end_date),
          arrival_date: splitDate(emp.arrival_date),
          status_id: emp.status_id || '',
          accommodation_id: emp.accommodation_id || '',
          room_number: emp.room_number || '',
          notes: emp.notes || '',
          first_name: emp.first_name || '',
          last_name: emp.last_name || '',
          gender: emp.gender || '',
          birth_date: splitDate(emp.birth_date),
          birth_place: emp.birth_place || '',
          mothers_name: emp.mothers_name || '',
          marital_status: emp.marital_status || '',
          tax_id: emp.tax_id || '',
          passport_number: emp.passport_number || '',
          social_security_number: emp.social_security_number || '',
          visa_expiry: splitDate(emp.visa_expiry),
          bank_account: emp.bank_account || '',
          permanent_address_zip: emp.permanent_address_zip || '',
          permanent_address_country: emp.permanent_address_country || '',
          permanent_address_county: emp.permanent_address_county || '',
          permanent_address_city: emp.permanent_address_city || '',
          permanent_address_street: emp.permanent_address_street || '',
          permanent_address_number: emp.permanent_address_number || '',
          company_name: emp.company_name || '',
          company_email: emp.company_email || '',
          company_phone: emp.company_phone || '',
        });
      }
    } catch (error) {
      console.error('Munkavállaló betöltési hiba:', error);
      toast.error('Hiba a munkavállaló adatainak betöltésekor');
    } finally {
      setLoading(false);
    }
  };

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

  const handleEdit = () => {
    loadDropdowns();
    setEditing(true);
  };

  const handleSave = async () => {
    const submitData = {
      ...formData,
      accommodation_id: formData.accommodation_id || null,
      status_id: formData.status_id || null,
    };

    setSaving(true);
    try {
      const response = await employeesAPI.update(employeeId, submitData);
      if (response.success) {
        toast.success('Munkavállaló sikeresen frissítve!');
        setEditing(false);
        loadEmployee();
        onSuccess();
      }
    } catch (error) {
      console.error('Munkavállaló frissítési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a munkavállaló frissítésekor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Biztosan deaktiválod ezt a munkavállalót?')) return;

    setSaving(true);
    try {
      const response = await employeesAPI.delete(employeeId);
      if (response.success) {
        toast.success('Munkavállaló deaktiválva!');
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Munkavállaló deaktiválási hiba:', error);
      toast.error('Hiba a munkavállaló deaktiválásakor');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setEditing(false);
    setEmployee(null);
    onClose();
  };

  const buildAddress = () => {
    const parts = [
      employee.permanent_address_zip,
      employee.permanent_address_country,
      employee.permanent_address_county,
      employee.permanent_address_city,
      employee.permanent_address_street,
      employee.permanent_address_number,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '-';
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Munkavállaló részletei
          </Typography>
          {employee && employee.status_name && (
            <Chip
              label={employee.status_name}
              size="small"
              sx={{
                bgcolor: employee.status_color ? `${employee.status_color}20` : undefined,
                color: employee.status_color || undefined,
                fontWeight: 600,
              }}
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : employee ? (
          editing ? (
            /* Edit mode */
            <Grid container spacing={2} sx={{ mt: 1 }}>

              {/* 1. Személyes adatok */}
              <Grid item xs={12}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Személyes adatok</Typography>
                <Divider />
              </Grid>
              <Grid item xs={6} md={4}>
                <TextField fullWidth label="Vezetéknév" value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)} />
              </Grid>
              <Grid item xs={6} md={4}>
                <TextField fullWidth label="Keresztnév" value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)} />
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
                  onChange={(e) => handleChange('employee_number', e.target.value)} />
              </Grid>
              <Grid item xs={6} md={4}>
                <TextField fullWidth label="Munkakör" value={formData.position}
                  onChange={(e) => handleChange('position', e.target.value)} />
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
                <TextField fullWidth label="Befejezés dátuma" type="date" value={formData.end_date}
                  onChange={(e) => handleChange('end_date', e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={6} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Státusz</InputLabel>
                  <Select value={formData.status_id} onChange={(e) => handleChange('status_id', e.target.value)} label="Státusz">
                    <MenuItem value="">Nincs</MenuItem>
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
              <Grid item xs={12}>
                <TextField fullWidth multiline rows={2} label="Megjegyzések" value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)} />
              </Grid>
            </Grid>
          ) : (
            /* View mode */
            <Box sx={{ mt: 1 }}>

              {/* 1. Személyes adatok */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 1 }}>Személyes adatok</Typography>
              <Divider sx={{ mb: 1 }} />
              <DetailRow label="Név" value={
                employee.last_name && employee.first_name
                  ? `${employee.last_name} ${employee.first_name}`
                  : '-'
              } />
              <DetailRow label="Nem" value={GENDER_LABELS[employee.gender] || '-'} />
              <DetailRow label="Születési dátum" value={fmtDate(employee.birth_date)} />
              <DetailRow label="Születési hely" value={employee.birth_place || '-'} />
              <DetailRow label="Anyja neve" value={employee.mothers_name || '-'} />
              <DetailRow label="Családi állapot" value={MARITAL_LABELS[employee.marital_status] || '-'} />

              {/* 2. Okmányok */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Okmányok</Typography>
              <Divider sx={{ mb: 1 }} />
              <DetailRow label="Adóazonosító" value={employee.tax_id || '-'} />
              <DetailRow label="Útlevélszám" value={employee.passport_number || '-'} />
              <DetailRow label="TAJ szám" value={employee.social_security_number || '-'} />
              <DetailRow label="Vízum lejárat" value={fmtDate(employee.visa_expiry)} />

              {/* 3. Munka adatok */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Munka adatok</Typography>
              <Divider sx={{ mb: 1 }} />
              <DetailRow label="Törzsszám" value={employee.employee_number || '-'} />
              <DetailRow label="Munkakör" value={employee.position || '-'} />
              <DetailRow label="Munkahely" value={employee.workplace || '-'} />
              <DetailRow label="Email" value={employee.email || '-'} />
              <DetailRow label="Telefon" value={employee.phone || '-'} />
              <DetailRow label="Érkezés dátuma" value={fmtDate(employee.arrival_date)} />
              <DetailRow label="Kezdés dátuma" value={fmtDate(employee.start_date)} />
              {employee.end_date && (
                <DetailRow label="Befejezés dátuma" value={fmtDate(employee.end_date)} />
              )}

              {/* 4. Szálláshely */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Szálláshely</Typography>
              <Divider sx={{ mb: 1 }} />
              <DetailRow label="Szálláshely" value={employee.accommodation_name || '-'} />
              {employee.accommodation_address && (
                <DetailRow label="Szálláshely címe" value={employee.accommodation_address} />
              )}
              <DetailRow label="Szobaszám" value={employee.room_number || '-'} />

              {/* 5. Állandó lakcím */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Állandó lakcím</Typography>
              <Divider sx={{ mb: 1 }} />
              <DetailRow label="Cím" value={buildAddress()} />

              {/* 6. Cég adatok */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Cég adatok</Typography>
              <Divider sx={{ mb: 1 }} />
              <DetailRow label="Cégnév" value={employee.company_name || '-'} />
              <DetailRow label="Céges email" value={employee.company_email || '-'} />
              <DetailRow label="Céges telefon" value={employee.company_phone || '-'} />

              {/* 7. Egyéb */}
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 2 }}>Egyéb</Typography>
              <Divider sx={{ mb: 1 }} />
              <DetailRow label="Bankszámlaszám" value={employee.bank_account || '-'} />
              <DetailRow label="Megjegyzések" value={employee.notes || '-'} />

              <Divider sx={{ my: 2 }} />
              <DetailRow label="Létrehozva" value={new Date(employee.created_at).toLocaleString('hu-HU')} />
              <DetailRow label="Módosítva" value={new Date(employee.updated_at).toLocaleString('hu-HU')} />
            </Box>
          )
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {editing ? (
          <>
            <Button onClick={() => setEditing(false)} disabled={saving}>
              Mégse
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
            >
              {saving ? <CircularProgress size={24} /> : 'Mentés'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleClose}>Bezárás</Button>
            {employee && !employee.end_date && (
              <>
                <Button
                  onClick={handleDeactivate}
                  color="error"
                  disabled={saving}
                >
                  Deaktiválás
                </Button>
                <Button
                  onClick={handleEdit}
                  variant="contained"
                  sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
                >
                  Szerkesztés
                </Button>
              </>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function DetailRow({ label, value }) {
  return (
    <Box sx={{ display: 'flex', py: 0.75 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160, fontWeight: 500 }}>
        {label}:
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

export default EmployeeDetailModal;
