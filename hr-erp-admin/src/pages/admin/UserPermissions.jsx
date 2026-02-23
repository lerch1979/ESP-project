import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Divider,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ArrowBack as ArrowBackIcon,
  Security as SecurityIcon,
  Save as SaveIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Remove as RemoveIcon,
  Person as PersonIcon,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { usersAPI, permissionsAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const ROLE_COLORS = {
  superadmin: { bg: '#fef2f2', color: '#dc2626', chipColor: 'error' },
  admin: { bg: '#eff6ff', color: '#2563eb', chipColor: 'primary' },
  data_controller: { bg: '#fff7ed', color: '#ea580c', chipColor: 'warning' },
  task_owner: { bg: '#eff6ff', color: '#0891b2', chipColor: 'info' },
  contractor: { bg: '#f5f5f5', color: '#666', chipColor: 'default' },
  user: { bg: '#f5f5f5', color: '#666', chipColor: 'default' },
  accommodated_employee: { bg: '#faf5ff', color: '#7c3aed', chipColor: 'secondary' },
};

const MODULE_LABELS = {
  dashboard: 'Kezdőlap',
  tickets: 'Hibajegyek',
  employees: 'Munkavállalók',
  accommodations: 'Szálláshelyek',
  documents: 'Dokumentumok',
  reports: 'Riportok',
  users: 'Felhasználók',
  settings: 'Beállítások',
  calendar: 'Naptár',
  videos: 'Videók',
  faq: 'FAQ',
};

const MODULE_ICONS = {
  dashboard: '📊',
  tickets: '🎫',
  employees: '👥',
  accommodations: '🏠',
  documents: '📄',
  reports: '📈',
  users: '👤',
  settings: '⚙️',
  calendar: '📅',
  videos: '🎥',
  faq: '❓',
};

function UserPermissions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState({});
  const [selectedRoleId, setSelectedRoleId] = useState('');

  // Permission state
  const [rolePermissions, setRolePermissions] = useState([]);
  const [permOverrides, setPermOverrides] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [userRes, rolesRes, permsRes, userPermsRes] = await Promise.all([
        usersAPI.getById(id),
        permissionsAPI.getRoles(),
        permissionsAPI.getAll(),
        permissionsAPI.getUserPermissions(id),
      ]);

      if (userRes.success) {
        setUser(userRes.data);
        setSelectedRoleId(userRes.data.roles?.[0]?.id || '');
      }

      if (rolesRes.success) {
        setRoles(rolesRes.data.roles || rolesRes.data || []);
      }

      if (permsRes.success) {
        setPermissionGroups(permsRes.data.grouped || {});
      }

      if (userPermsRes.success) {
        setRolePermissions(userPermsRes.data.rolePermissions || []);

        // Build override map from existing overrides
        const overrideMap = {};
        (userPermsRes.data.overrides || []).forEach(o => {
          overrideMap[o.id] = o.granted;
        });
        setPermOverrides(overrideMap);
      }
    } catch (error) {
      toast.error('Hiba az adatok betöltése során');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle role change
  const handleRoleChange = async (e) => {
    const newRoleId = e.target.value;
    setSelectedRoleId(newRoleId);
    setHasChanges(true);

    try {
      if (newRoleId) {
        await usersAPI.updateRole(id, newRoleId);

        // Reload user permissions after role change
        const userPermsRes = await permissionsAPI.getUserPermissions(id);
        if (userPermsRes.success) {
          setRolePermissions(userPermsRes.data.rolePermissions || []);
        }

        toast.success('Szerepkör sikeresen módosítva');
      }
    } catch (error) {
      toast.error('Hiba a szerepkör módosítása során');
    }
  };

  // Three-state toggle: undefined (inherit) -> false (deny) -> true (grant) -> undefined
  const handleTogglePermission = (permId) => {
    setPermOverrides(prev => {
      const updated = { ...prev };
      const current = updated[permId];

      if (current === undefined) {
        updated[permId] = false; // deny
      } else if (current === false) {
        updated[permId] = true; // grant
      } else {
        delete updated[permId]; // inherit from role
      }

      return updated;
    });
    setHasChanges(true);
  };

  // Save permissions
  const handleSave = async () => {
    setSaving(true);
    try {
      const permissions = Object.entries(permOverrides).map(([permId, granted]) => ({
        permissionId: permId,
        granted,
      }));

      await permissionsAPI.updateUserPermissions(id, permissions);
      toast.success('Jogosultságok sikeresen mentve');
      setHasChanges(false);
    } catch (error) {
      toast.error('Hiba a jogosultságok mentése során');
    } finally {
      setSaving(false);
    }
  };

  // Get permission state display
  const getPermissionState = (perm) => {
    const override = permOverrides[perm.id];
    const isFromRole = rolePermissions.includes(perm.slug);
    const isEffective = override === true || (isFromRole && override !== false);

    return { override, isFromRole, isEffective };
  };

  const getRoleChipColor = (slug) => ROLE_COLORS[slug]?.chipColor || 'default';

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (!user) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Alert severity="error">Felhasználó nem található</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/admin/users')}>Vissza</Button>
      </Box>
    );
  }

  const totalPermissions = Object.values(permissionGroups).flat().length;
  const grantedCount = Object.values(permissionGroups).flat().filter(p => {
    const { isEffective } = getPermissionState(p);
    return isEffective;
  }).length;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Tooltip title="Vissza a felhasználókhoz">
          <IconButton onClick={() => navigate('/admin/users')}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', md: '1.8rem' } }}>
            Jogosultságok kezelése
          </Typography>
        </Box>
        {hasChanges && (
          <Chip label="Nem mentett változások" color="warning" variant="outlined" size="small" />
        )}
      </Box>

      {/* User Info Card */}
      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }}>
          <Avatar
            sx={{
              width: 64,
              height: 64,
              bgcolor: ROLE_COLORS[user.roles?.[0]?.slug]?.color || '#667eea',
              fontSize: '1.5rem',
              fontWeight: 700,
            }}
          >
            {(user.first_name?.[0] || '') + (user.last_name?.[0] || '')}
          </Avatar>

          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={700}>
              {user.first_name} {user.last_name}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {user.email}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {user.roles?.filter(r => r.slug).map(role => (
                <Chip
                  key={role.slug}
                  label={role.name}
                  color={getRoleChipColor(role.slug)}
                  size="small"
                  icon={<ShieldIcon />}
                  sx={{ fontWeight: 500 }}
                />
              ))}
              <Chip
                label={user.is_active !== false ? 'Aktív' : 'Inaktív'}
                size="small"
                color={user.is_active !== false ? 'success' : 'default'}
                variant="outlined"
              />
            </Stack>
          </Box>

          {/* Permission stats */}
          <Paper sx={{ p: 2, minWidth: 160, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} color="primary">
              {grantedCount}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              / {totalPermissions} jogosultság aktív
            </Typography>
          </Paper>
        </Stack>
      </Paper>

      {/* Role Selector */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Szerepkör módosítása
            </Typography>
            <Typography variant="body2" color="text.secondary">
              A szerepkör módosítása az alapértelmezett jogosultságokat is változtatja.
            </Typography>
          </Box>
          <FormControl sx={{ minWidth: 250 }}>
            <InputLabel>Szerepkör</InputLabel>
            <Select
              value={selectedRoleId}
              onChange={handleRoleChange}
              label="Szerepkör"
            >
              <MenuItem value="">
                <em>Nincs szerepkör</em>
              </MenuItem>
              {roles.map(role => (
                <MenuItem key={role.id} value={role.id}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip
                      label={role.name}
                      size="small"
                      color={getRoleChipColor(role.slug)}
                      sx={{ fontWeight: 500 }}
                    />
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
        </Stack>
      </Paper>

      {/* Legend */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Jelmagyarázat
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Chip
              label="Engedélyezve"
              size="small"
              color="success"
              icon={<CheckIcon />}
              sx={{ fontWeight: 500 }}
            />
            <Typography variant="caption" color="text.secondary">Egyéni engedélyezés</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Chip
              label="Tiltva"
              size="small"
              color="error"
              icon={<CloseIcon />}
              sx={{ fontWeight: 500 }}
            />
            <Typography variant="caption" color="text.secondary">Egyéni tiltás</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Chip
              label="Role alapértelmezett"
              size="small"
              variant="outlined"
              icon={<RemoveIcon />}
              sx={{ fontWeight: 500 }}
            />
            <Typography variant="caption" color="text.secondary">Szerepkörből örökölve</Typography>
          </Stack>
        </Stack>
      </Paper>

      {/* Permission Groups */}
      {Object.entries(permissionGroups).map(([module, perms]) => {
        const moduleGranted = perms.filter(p => getPermissionState(p).isEffective).length;
        const moduleLabel = MODULE_LABELS[module] || module;

        return (
          <Accordion
            key={module}
            defaultExpanded={false}
            sx={{
              mb: 1,
              '&:before': { display: 'none' },
              borderRadius: '8px !important',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                bgcolor: '#f8fafc',
                '&:hover': { bgcolor: '#f1f5f9' },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%', pr: 2 }}>
                <Typography fontSize="1.3rem">{MODULE_ICONS[module] || '📁'}</Typography>
                <Typography fontWeight={700} sx={{ flex: 1 }}>
                  {moduleLabel}
                </Typography>
                <Chip
                  label={`${moduleGranted}/${perms.length}`}
                  size="small"
                  color={moduleGranted === perms.length ? 'success' : moduleGranted > 0 ? 'primary' : 'default'}
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {perms.map((perm, idx) => {
                const { override, isFromRole, isEffective } = getPermissionState(perm);

                let stateChip = null;
                let rowBg = 'transparent';

                if (override === true) {
                  stateChip = (
                    <Chip
                      label="Engedélyezve"
                      size="small"
                      color="success"
                      icon={<CheckIcon />}
                      sx={{ fontWeight: 500, minWidth: 130 }}
                    />
                  );
                  rowBg = '#f0fdf4';
                } else if (override === false) {
                  stateChip = (
                    <Chip
                      label="Tiltva"
                      size="small"
                      color="error"
                      icon={<CloseIcon />}
                      sx={{ fontWeight: 500, minWidth: 130 }}
                    />
                  );
                  rowBg = '#fef2f2';
                } else if (isFromRole) {
                  stateChip = (
                    <Chip
                      label="Role alapértelmezett"
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 500, minWidth: 130, color: '#666', borderColor: '#ccc' }}
                    />
                  );
                  rowBg = '#f9fafb';
                } else {
                  stateChip = (
                    <Chip
                      label="Nincs jogosultság"
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 500, minWidth: 130, color: '#999', borderColor: '#e5e7eb' }}
                    />
                  );
                }

                return (
                  <Box
                    key={perm.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 3,
                      py: 1.5,
                      bgcolor: rowBg,
                      borderBottom: idx < perms.length - 1 ? '1px solid #f0f0f0' : 'none',
                      transition: 'background-color 0.2s',
                      '&:hover': { bgcolor: override === true ? '#dcfce7' : override === false ? '#fee2e2' : '#f5f5f5' },
                    }}
                  >
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      {isEffective ? (
                        <CheckIcon fontSize="small" sx={{ color: '#22c55e' }} />
                      ) : (
                        <CloseIcon fontSize="small" sx={{ color: '#d1d5db' }} />
                      )}
                      <Box>
                        <Typography variant="body2" fontWeight={isEffective ? 600 : 400}>
                          {perm.display_name || perm.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {perm.slug}
                        </Typography>
                      </Box>
                    </Box>

                    {stateChip}

                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleTogglePermission(perm.id)}
                      sx={{
                        ml: 2,
                        minWidth: 100,
                        fontSize: '0.75rem',
                        borderColor: override === undefined ? '#e5e7eb' : override === false ? '#fca5a5' : '#86efac',
                        color: override === undefined ? '#666' : override === false ? '#dc2626' : '#16a34a',
                        '&:hover': {
                          borderColor: override === undefined ? '#d1d5db' : override === false ? '#f87171' : '#4ade80',
                        },
                      }}
                    >
                      {override === undefined ? 'Tiltás' : override === false ? 'Engedély' : 'Alapért.'}
                    </Button>
                  </Box>
                );
              })}
            </AccordionDetails>
          </Accordion>
        );
      })}

      {/* Action Buttons */}
      <Paper
        sx={{
          p: 2,
          mt: 3,
          position: 'sticky',
          bottom: 16,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 2,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
          borderRadius: 2,
        }}
      >
        <Button
          variant="outlined"
          onClick={() => navigate('/admin/users')}
          disabled={saving}
        >
          Mégse
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={18} /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || !hasChanges}
          sx={{
            background: hasChanges ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined,
            px: 4,
          }}
        >
          Jogosultságok mentése
        </Button>
      </Paper>
    </Box>
  );
}

export default UserPermissions;
