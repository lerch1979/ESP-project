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

function EmployeeDetailModal({ open, onClose, employeeId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [formData, setFormData] = useState({
    employee_number: '',
    position: '',
    start_date: '',
    end_date: '',
    status_id: '',
    accommodation_id: '',
    notes: '',
  });

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
          start_date: emp.start_date ? emp.start_date.split('T')[0] : '',
          end_date: emp.end_date ? emp.end_date.split('T')[0] : '',
          status_id: emp.status_id || '',
          accommodation_id: emp.accommodation_id || '',
          notes: emp.notes || '',
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
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Törzsszám"
                  value={formData.employee_number}
                  onChange={(e) => handleChange('employee_number', e.target.value)}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Munkakör"
                  value={formData.position}
                  onChange={(e) => handleChange('position', e.target.value)}
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
                <TextField
                  fullWidth
                  label="Befejezés dátuma"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => handleChange('end_date', e.target.value)}
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
                    <MenuItem value="">Nincs</MenuItem>
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
          ) : (
            /* View mode */
            <Box sx={{ mt: 1 }}>
              <DetailRow label="Név" value={
                employee.last_name && employee.first_name
                  ? `${employee.last_name} ${employee.first_name}`
                  : '-'
              } />
              <DetailRow label="Email" value={employee.email || '-'} />
              <DetailRow label="Telefon" value={employee.phone || '-'} />
              <Divider sx={{ my: 2 }} />
              <DetailRow label="Törzsszám" value={employee.employee_number || '-'} />
              <DetailRow label="Munkakör" value={employee.position || '-'} />
              <DetailRow label="Szálláshely" value={employee.accommodation_name || '-'} />
              {employee.accommodation_address && (
                <DetailRow label="Szálláshely címe" value={employee.accommodation_address} />
              )}
              <DetailRow label="Kezdés dátuma" value={
                employee.start_date
                  ? new Date(employee.start_date).toLocaleDateString('hu-HU')
                  : '-'
              } />
              {employee.end_date && (
                <DetailRow label="Befejezés dátuma" value={
                  new Date(employee.end_date).toLocaleDateString('hu-HU')
                } />
              )}
              <DetailRow label="Megjegyzések" value={employee.notes || '-'} />
              <Divider sx={{ my: 2 }} />
              <DetailRow
                label="Létrehozva"
                value={new Date(employee.created_at).toLocaleString('hu-HU')}
              />
              <DetailRow
                label="Módosítva"
                value={new Date(employee.updated_at).toLocaleString('hu-HU')}
              />
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
