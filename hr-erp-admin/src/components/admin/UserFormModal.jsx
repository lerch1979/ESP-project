import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { usersAPI, permissionsAPI } from '../../services/api';

function UserFormModal({ open, onClose, user, onSuccess }) {
  const isEdit = !!user;

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    roleId: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Load roles
  useEffect(() => {
    if (open) {
      loadRoles();
    }
  }, [open]);

  // Reset form when dialog opens/user changes
  useEffect(() => {
    if (open) {
      if (user) {
        setFormData({
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          email: user.email || '',
          phone: user.phone || '',
          password: '',
          roleId: user.roles?.[0]?.id || '',
        });
      } else {
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          password: '',
          roleId: '',
        });
      }
      setFormErrors({});
      setShowPassword(false);
    }
  }, [open, user]);

  const loadRoles = async () => {
    try {
      const response = await permissionsAPI.getRoles();
      if (response.success) {
        setRoles(response.data.roles || response.data || []);
      }
    } catch {
      // Roles might not be accessible
    }
  };

  const validate = () => {
    const errors = {};
    if (!formData.firstName.trim()) errors.firstName = 'Vezetéknév kötelező';
    if (!formData.lastName.trim()) errors.lastName = 'Keresztnév kötelező';
    if (!formData.email.trim()) {
      errors.email = 'Email kötelező';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Érvénytelen email cím';
    }
    if (!isEdit && !formData.password.trim()) {
      errors.password = 'Jelszó kötelező új felhasználónál';
    } else if (formData.password && formData.password.length < 6) {
      errors.password = 'A jelszónak legalább 6 karakter hosszúnak kell lennie';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      if (isEdit) {
        const updateData = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || null,
        };
        if (formData.password) updateData.password = formData.password;
        if (formData.roleId) updateData.roleId = formData.roleId;

        await usersAPI.update(user.id, updateData);
        toast.success('Felhasználó sikeresen frissítve');
      } else {
        await usersAPI.create({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || null,
          password: formData.password,
          roleId: formData.roleId || undefined,
        });
        toast.success('Felhasználó sikeresen létrehozva');
      }
      onClose();
      if (onSuccess) onSuccess();
    } catch (error) {
      const msg = error.response?.data?.message || 'Hiba történt a mentés során';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        {isEdit ? <EditIcon color="primary" /> : <PersonAddIcon color="primary" />}
        {isEdit ? 'Felhasználó szerkesztése' : 'Új felhasználó létrehozása'}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Vezetéknév"
              value={formData.firstName}
              onChange={handleChange('firstName')}
              error={!!formErrors.firstName}
              helperText={formErrors.firstName}
              fullWidth
              required
              autoFocus={!isEdit}
            />
            <TextField
              label="Keresztnév"
              value={formData.lastName}
              onChange={handleChange('lastName')}
              error={!!formErrors.lastName}
              helperText={formErrors.lastName}
              fullWidth
              required
            />
          </Stack>

          <TextField
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            error={!!formErrors.email}
            helperText={formErrors.email}
            fullWidth
            required
          />

          <TextField
            label="Telefon"
            value={formData.phone}
            onChange={handleChange('phone')}
            fullWidth
            placeholder="+36 ..."
          />

          <TextField
            label={isEdit ? 'Új jelszó (opcionális)' : 'Jelszó'}
            type={showPassword ? 'text' : 'password'}
            value={formData.password}
            onChange={handleChange('password')}
            error={!!formErrors.password}
            helperText={formErrors.password || (isEdit ? 'Hagyd üresen, ha nem akarod módosítani' : '')}
            fullWidth
            required={!isEdit}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <FormControl fullWidth>
            <InputLabel>Szerepkör</InputLabel>
            <Select
              value={formData.roleId}
              onChange={handleChange('roleId')}
              label="Szerepkör"
            >
              <MenuItem value="">
                <em>Nincs szerepkör</em>
              </MenuItem>
              {roles.map(role => (
                <MenuItem key={role.id} value={role.id}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <span>{role.name}</span>
                    {role.permissionCount !== undefined && (
                      <Typography variant="caption" color="text.secondary">
                        ({role.permissionCount} jogosultság)
                      </Typography>
                    )}
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {isEdit && (
            <Alert severity="info" variant="outlined">
              A részletes jogosultságkezeléshez használd a "Jogosultságok kezelése" gombot a felhasználók listájában.
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Mégse
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} /> : null}
          sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        >
          {isEdit ? 'Mentés' : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default UserFormModal;
