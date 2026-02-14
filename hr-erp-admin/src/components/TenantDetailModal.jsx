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
} from '@mui/material';
import { tenantsAPI } from '../services/api';
import { toast } from 'react-toastify';

function TenantDetailModal({ open, onClose, tenantId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tenant, setTenant] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  useEffect(() => {
    if (open && tenantId) {
      loadTenant();
      setEditing(false);
    }
  }, [open, tenantId]);

  const loadTenant = async () => {
    setLoading(true);
    try {
      const response = await tenantsAPI.getById(tenantId);
      if (response.success) {
        setTenant(response.data.tenant);
        setFormData({
          name: response.data.tenant.name || '',
          email: response.data.tenant.email || '',
          phone: response.data.tenant.phone || '',
          address: response.data.tenant.address || '',
        });
      }
    } catch (error) {
      console.error('Bérlő betöltési hiba:', error);
      toast.error('Hiba a bérlő adatainak betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('A név megadása kötelező!');
      return;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      toast.error('Érvénytelen email cím!');
      return;
    }

    setSaving(true);
    try {
      const response = await tenantsAPI.update(tenantId, formData);
      if (response.success) {
        toast.success('Bérlő sikeresen frissítve!');
        setTenant(response.data.tenant);
        setEditing(false);
        onSuccess();
      }
    } catch (error) {
      console.error('Bérlő frissítési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a bérlő frissítésekor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Biztosan deaktiválod ezt a bérlőt?')) return;

    setSaving(true);
    try {
      const response = await tenantsAPI.delete(tenantId);
      if (response.success) {
        toast.success('Bérlő deaktiválva!');
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Bérlő deaktiválási hiba:', error);
      toast.error('Hiba a bérlő deaktiválásakor');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setEditing(false);
    setTenant(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Bérlő részletei
          </Typography>
          {tenant && (
            <Chip
              label={tenant.is_active ? 'Aktív' : 'Inaktív'}
              color={tenant.is_active ? 'success' : 'default'}
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
        ) : tenant ? (
          editing ? (
            /* Edit mode */
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  label="Név"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Telefon"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
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
            </Grid>
          ) : (
            /* View mode */
            <Box sx={{ mt: 1 }}>
              <DetailRow label="Név" value={tenant.name} />
              <DetailRow label="Slug" value={tenant.slug} />
              <DetailRow label="Email" value={tenant.email || '-'} />
              <DetailRow label="Telefon" value={tenant.phone || '-'} />
              <DetailRow label="Cím" value={tenant.address || '-'} />
              <Divider sx={{ my: 2 }} />
              <DetailRow label="Felhasználók száma" value={tenant.user_count} />
              <DetailRow
                label="Létrehozva"
                value={new Date(tenant.created_at).toLocaleString('hu-HU')}
              />
              <DetailRow
                label="Módosítva"
                value={new Date(tenant.updated_at).toLocaleString('hu-HU')}
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
            {tenant?.is_active && (
              <>
                <Button
                  onClick={handleDeactivate}
                  color="error"
                  disabled={saving}
                >
                  Deaktiválás
                </Button>
                <Button
                  onClick={() => setEditing(true)}
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

export default TenantDetailModal;
