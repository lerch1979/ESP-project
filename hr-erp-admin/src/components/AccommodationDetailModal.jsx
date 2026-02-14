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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';
import { accommodationsAPI, tenantsAPI } from '../services/api';
import { toast } from 'react-toastify';

const STATUS_LABELS = {
  available: 'Szabad',
  occupied: 'Foglalt',
  maintenance: 'Karbantartás',
};

const STATUS_COLORS = {
  available: 'success',
  occupied: 'warning',
  maintenance: 'error',
};

const TYPE_LABELS = {
  studio: 'Stúdió',
  '1br': '1 szobás',
  '2br': '2 szobás',
  '3br': '3 szobás',
  dormitory: 'Munkásszálló',
};

function AccommodationDetailModal({ open, onClose, accommodationId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [accommodation, setAccommodation] = useState(null);
  const [tenantHistory, setTenantHistory] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    type: 'studio',
    capacity: 1,
    current_tenant_id: '',
    status: 'available',
    monthly_rent: '',
    notes: '',
  });

  useEffect(() => {
    if (open && accommodationId) {
      loadAccommodation();
      loadTenantHistory();
      setEditing(false);
    }
  }, [open, accommodationId]);

  const loadAccommodation = async () => {
    setLoading(true);
    try {
      const response = await accommodationsAPI.getById(accommodationId);
      if (response.success) {
        const acc = response.data.accommodation;
        setAccommodation(acc);
        setFormData({
          name: acc.name || '',
          address: acc.address || '',
          type: acc.type || 'studio',
          capacity: acc.capacity || 1,
          current_tenant_id: acc.current_tenant_id || '',
          status: acc.status || 'available',
          monthly_rent: acc.monthly_rent || '',
          notes: acc.notes || '',
        });
      }
    } catch (error) {
      console.error('Szálláshely betöltési hiba:', error);
      toast.error('Hiba a szálláshely adatainak betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const loadTenantHistory = async () => {
    try {
      const response = await accommodationsAPI.getTenantHistory(accommodationId);
      if (response.success) {
        setTenantHistory(response.data.tenants);
      }
    } catch (error) {
      console.error('Bérlő történet betöltési hiba:', error);
    }
  };

  const loadTenants = async () => {
    try {
      const response = await tenantsAPI.getAll({ limit: 500, is_active: 'true' });
      if (response.success) {
        setTenants(response.data.tenants);
      }
    } catch (error) {
      console.error('Bérlők betöltési hiba:', error);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEdit = () => {
    loadTenants();
    setEditing(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('A név megadása kötelező!');
      return;
    }

    const submitData = {
      ...formData,
      capacity: parseInt(formData.capacity) || 1,
      monthly_rent: formData.monthly_rent ? parseFloat(formData.monthly_rent) : null,
      current_tenant_id: formData.current_tenant_id || null,
    };

    setSaving(true);
    try {
      const response = await accommodationsAPI.update(accommodationId, submitData);
      if (response.success) {
        toast.success('Szálláshely sikeresen frissítve!');
        setAccommodation(response.data.accommodation);
        setEditing(false);
        loadTenantHistory();
        onSuccess();
      }
    } catch (error) {
      console.error('Szálláshely frissítési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a szálláshely frissítésekor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Biztosan deaktiválod ezt a szálláshelyet?')) return;

    setSaving(true);
    try {
      const response = await accommodationsAPI.delete(accommodationId);
      if (response.success) {
        toast.success('Szálláshely deaktiválva!');
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Szálláshely deaktiválási hiba:', error);
      toast.error('Hiba a szálláshely deaktiválásakor');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setEditing(false);
    setAccommodation(null);
    setTenantHistory([]);
    onClose();
  };

  const formatRent = (rent) => {
    if (!rent) return '-';
    return new Intl.NumberFormat('hu-HU', { style: 'currency', currency: 'HUF', maximumFractionDigits: 0 }).format(rent);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Szálláshely részletei
          </Typography>
          {accommodation && (
            <Chip
              label={STATUS_LABELS[accommodation.status] || accommodation.status}
              color={STATUS_COLORS[accommodation.status] || 'default'}
              size="small"
            />
          )}
        </Box>
      </DialogTitle>

      <DialogContent>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : accommodation ? (
          editing ? (
            /* Edit mode */
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Név / Megnevezés"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
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
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Jelenlegi bérlő</InputLabel>
                  <Select
                    value={formData.current_tenant_id}
                    onChange={(e) => handleChange('current_tenant_id', e.target.value)}
                    label="Jelenlegi bérlő"
                  >
                    <MenuItem value="">Nincs</MenuItem>
                    {tenants.map((t) => (
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
          ) : (
            /* View mode */
            <Box sx={{ mt: 1 }}>
              <DetailRow label="Név" value={accommodation.name} />
              <DetailRow label="Cím" value={accommodation.address || '-'} />
              <DetailRow label="Típus" value={TYPE_LABELS[accommodation.type] || accommodation.type} />
              <DetailRow label="Kapacitás" value={`${accommodation.capacity} fő`} />
              <DetailRow label="Havi bérleti díj" value={formatRent(accommodation.monthly_rent)} />
              <DetailRow label="Jelenlegi bérlő" value={accommodation.current_tenant_name || '-'} />
              {accommodation.current_tenant_email && (
                <DetailRow label="Bérlő email" value={accommodation.current_tenant_email} />
              )}
              {accommodation.current_tenant_phone && (
                <DetailRow label="Bérlő telefon" value={accommodation.current_tenant_phone} />
              )}
              <DetailRow label="Megjegyzések" value={accommodation.notes || '-'} />
              <Divider sx={{ my: 2 }} />
              <DetailRow
                label="Létrehozva"
                value={new Date(accommodation.created_at).toLocaleString('hu-HU')}
              />
              <DetailRow
                label="Módosítva"
                value={new Date(accommodation.updated_at).toLocaleString('hu-HU')}
              />

              {/* Tenant history */}
              {tenantHistory.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Bérlő történet
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Bérlő</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Beköltözés</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Kiköltözés</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tenantHistory.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell>{h.tenant_name}</TableCell>
                            <TableCell>
                              {new Date(h.check_in).toLocaleDateString('hu-HU')}
                            </TableCell>
                            <TableCell>
                              {h.check_out
                                ? new Date(h.check_out).toLocaleDateString('hu-HU')
                                : <Chip label="Aktív" size="small" color="success" />
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
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
            {accommodation?.is_active && (
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

export default AccommodationDetailModal;
