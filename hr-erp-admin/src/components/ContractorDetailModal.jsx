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
import { contractorsAPI } from '../services/api';
import { toast } from 'react-toastify';

// contractor_roles (mig 140): multi-role tags. Authoritative for billing.
const ALL_ROLES = ['megbizo', 'szallasado', 'alvallalkozo'];
const ROLE_LABELS = { megbizo: 'Megbízó', szallasado: 'Szállásadó', alvallalkozo: 'Alvállalkozó' };
const ROLE_HELP = {
  megbizo: 'Nekünk fizető ügyfél (bevétel) — munkavállalókhoz kötve',
  szallasado: 'Bérbeadó, akinek mi fizetünk bérleti díjat (költség)',
  alvallalkozo: 'Alvállalkozó, saját hozzáféréssel',
};

function ContractorDetailModal({ open, onClose, contractorId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(false);
  const [contractor, setContractor] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
  });

  useEffect(() => {
    if (open && contractorId) {
      loadContractor();
      setEditing(false);
    }
  }, [open, contractorId]);

  const loadContractor = async () => {
    setLoading(true);
    try {
      const response = await contractorsAPI.getById(contractorId);
      if (response.success) {
        setContractor(response.data.contractor);
        setRoles(Array.isArray(response.data.contractor.roles) ? response.data.contractor.roles : []);
        setFormData({
          name: response.data.contractor.name || '',
          email: response.data.contractor.email || '',
          phone: response.data.contractor.phone || '',
          address: response.data.contractor.address || '',
        });
      }
    } catch (error) {
      console.error('Alvállalkozó betöltési hiba:', error);
      toast.error('Hiba az alvállalkozó adatainak betöltésekor');
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
      const response = await contractorsAPI.update(contractorId, formData);
      if (response.success) {
        toast.success('Alvállalkozó sikeresen frissítve!');
        setContractor(response.data.contractor);
        setEditing(false);
        onSuccess();
      }
    } catch (error) {
      console.error('Alvállalkozó frissítési hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba az alvállalkozó frissítésekor');
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = async (role) => {
    let next = roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role];
    // Mutual exclusivity: megbízó (revenue) and szállásadó (cost) can't coexist —
    // enabling one auto-clears the other. Alvállalkozó is independent.
    if (role === 'megbizo') next = next.filter(r => r !== 'szallasado');
    if (role === 'szallasado') next = next.filter(r => r !== 'megbizo');
    const prev = roles;
    setRoles(next);           // optimistic
    setSavingRoles(true);
    try {
      const response = await contractorsAPI.setRoles(contractorId, next);
      if (response.success) {
        setRoles(response.data.roles);
        onSuccess();          // refresh the list so its role chips update
      } else {
        setRoles(prev);
      }
    } catch (error) {
      setRoles(prev);         // rollback
      toast.error(error.response?.data?.message || 'Hiba a szerepkör mentésekor');
    } finally {
      setSavingRoles(false);
    }
  };

  const handleDeactivate = async () => {
    if (!window.confirm('Biztosan deaktiválod ezt az alvállalkozót?')) return;

    setSaving(true);
    try {
      const response = await contractorsAPI.delete(contractorId);
      if (response.success) {
        toast.success('Alvállalkozó deaktiválva!');
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Alvállalkozó deaktiválási hiba:', error);
      toast.error('Hiba az alvállalkozó deaktiválásakor');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setEditing(false);
    setContractor(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            Alvállalkozó részletei
          </Typography>
          {contractor && (
            <Chip
              label={contractor.is_active ? 'Aktív' : 'Inaktív'}
              color={contractor.is_active ? 'success' : 'default'}
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
        ) : contractor ? (
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
              <DetailRow label="Név" value={contractor.name} />
              <DetailRow label="Slug" value={contractor.slug} />
              <DetailRow label="Email" value={contractor.email || '-'} />
              <DetailRow label="Telefon" value={contractor.phone || '-'} />
              <DetailRow label="Cím" value={contractor.address || '-'} />
              <Divider sx={{ my: 2 }} />
              <Box sx={{ py: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Szerepkörök:
                  </Typography>
                  {savingRoles && <CircularProgress size={14} />}
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {ALL_ROLES.map((role) => {
                    const active = roles.includes(role);
                    return (
                      <Chip
                        key={role}
                        label={ROLE_LABELS[role]}
                        title={ROLE_HELP[role]}
                        onClick={() => !savingRoles && toggleRole(role)}
                        color={active ? 'primary' : 'default'}
                        variant={active ? 'filled' : 'outlined'}
                        size="small"
                        sx={active ? { bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } } : { cursor: 'pointer' }}
                      />
                    );
                  })}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Kattints egy címkére a be-/kikapcsoláshoz. A <b>megbízó</b> és <b>szállásadó</b> kizárja egymást
                  (bevétel vs. költség) — az egyik bekapcsolása kikapcsolja a másikat. Az alvállalkozó bármelyikkel kombinálható.
                </Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <DetailRow label="Felhasználók száma" value={contractor.user_count} />
              <DetailRow
                label="Létrehozva"
                value={new Date(contractor.created_at).toLocaleString('hu-HU')}
              />
              <DetailRow
                label="Módosítva"
                value={new Date(contractor.updated_at).toLocaleString('hu-HU')}
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
              sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}
            >
              {saving ? <CircularProgress size={24} /> : 'Mentés'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={handleClose}>Bezárás</Button>
            {contractor?.is_active && (
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
                  sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}
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

export default ContractorDetailModal;
