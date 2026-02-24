import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Tooltip,
  Stack,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Alert,
  Divider,
  AvatarGroup,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Shield as ShieldIcon,
  Lock as LockIcon,
  Save as SaveIcon,
  People as PeopleIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxBlankIcon,
  IndeterminateCheckBox as IndeterminateIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { permissionsAPI, usersAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';

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

function Roles() {
  const { hasPermission } = useAuth();

  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  // Create role dialog
  const [createDialog, setCreateDialog] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleSlug, setNewRoleSlug] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Edit permissions dialog
  const [editDialog, setEditDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [rolePerms, setRolePerms] = useState({});
  const [saveLoading, setSaveLoading] = useState(false);

  // Users by role dialog
  const [usersDialog, setUsersDialog] = useState(false);
  const [roleUsers, setRoleUsers] = useState([]);
  const [selectedRoleForUsers, setSelectedRoleForUsers] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes, usersRes] = await Promise.all([
        permissionsAPI.getRoles(),
        permissionsAPI.getAll(),
        usersAPI.getAll({ limit: 1000 }),
      ]);

      if (rolesRes.success) {
        setRoles(rolesRes.data.roles || rolesRes.data || []);
      }

      if (permsRes.success) {
        setAllPermissions(permsRes.data.permissions || []);
        setPermissionGroups(permsRes.data.grouped || {});
      }

      if (usersRes.success) {
        setUsers(usersRes.data.users || usersRes.data || []);
      }
    } catch (error) {
      toast.error('Hiba az adatok betöltése során');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Count users per role
  const getUserCountForRole = (roleSlug) => {
    return users.filter(u => u.roles?.some(r => r.slug === roleSlug)).length;
  };

  const getUsersForRole = (roleSlug) => {
    return users.filter(u => u.roles?.some(r => r.slug === roleSlug));
  };

  // Create role
  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      toast.error('A szerepkör neve kötelező');
      return;
    }

    setCreateLoading(true);
    try {
      await permissionsAPI.createRole({
        name: newRoleName,
        slug: newRoleSlug || newRoleName.toLowerCase().replace(/\s+/g, '_'),
        description: newRoleDescription,
      });
      toast.success('Szerepkör sikeresen létrehozva');
      setCreateDialog(false);
      setNewRoleName('');
      setNewRoleSlug('');
      setNewRoleDescription('');
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba a szerepkör létrehozása során');
    } finally {
      setCreateLoading(false);
    }
  };

  // Edit role permissions
  const handleOpenEditPermissions = (role) => {
    setSelectedRole(role);

    // Build permission map from role's current permissions
    const permMap = {};
    (role.permissions || []).forEach(slug => {
      const perm = allPermissions.find(p => p.slug === slug);
      if (perm) permMap[perm.id] = true;
    });
    setRolePerms(permMap);
    setEditDialog(true);
  };

  const handleToggleRolePerm = (permId) => {
    setRolePerms(prev => {
      const updated = { ...prev };
      if (updated[permId]) {
        delete updated[permId];
      } else {
        updated[permId] = true;
      }
      return updated;
    });
  };

  const handleToggleModuleAll = (modulePerms) => {
    const allChecked = modulePerms.every(p => rolePerms[p.id]);
    setRolePerms(prev => {
      const updated = { ...prev };
      modulePerms.forEach(p => {
        if (allChecked) {
          delete updated[p.id];
        } else {
          updated[p.id] = true;
        }
      });
      return updated;
    });
  };

  const handleSaveRolePermissions = async () => {
    setSaveLoading(true);
    try {
      const permissionIds = Object.keys(rolePerms).filter(id => rolePerms[id]);
      await permissionsAPI.updateRolePermissions(selectedRole.id, permissionIds);
      toast.success('Szerepkör jogosultságai sikeresen mentve');
      setEditDialog(false);
      loadData();
    } catch (error) {
      toast.error('Hiba a jogosultságok mentése során');
    } finally {
      setSaveLoading(false);
    }
  };

  // Show users
  const handleShowUsers = (role) => {
    setSelectedRoleForUsers(role);
    setRoleUsers(getUsersForRole(role.slug));
    setUsersDialog(true);
  };

  const getRoleChipColor = (slug) => ROLE_COLORS[slug]?.chipColor || 'default';

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
            Szerepkörök kezelése
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Szerepkörök és az azokhoz tartozó jogosultságok kezelése
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialog(true)}
          sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        >
          Új szerepkör
        </Button>
      </Box>

      {/* Roles Table */}
      <TableContainer component={Paper} sx={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell sx={{ fontWeight: 700 }}>Szerepkör</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Leírás</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">Jogosultságok</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="center">Felhasználók</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Típus</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Műveletek</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <ShieldIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
                  <Typography color="text.secondary">Nincsenek szerepkörök</Typography>
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => {
                const userCount = getUserCountForRole(role.slug);
                const roleUsersList = getUsersForRole(role.slug);
                return (
                  <TableRow key={role.id} hover>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={1.5}>
                        <ShieldIcon sx={{ color: ROLE_COLORS[role.slug]?.color || '#667eea' }} />
                        <Box>
                          <Chip
                            label={role.name}
                            color={getRoleChipColor(role.slug)}
                            size="small"
                            sx={{ fontWeight: 600 }}
                          />
                          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
                            {role.slug}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {role.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={role.permissionCount !== undefined ? role.permissionCount : (role.permissions?.length || 0)}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                        <Chip
                          label={userCount}
                          size="small"
                          icon={<PeopleIcon />}
                          variant="outlined"
                          onClick={() => handleShowUsers(role)}
                          sx={{ cursor: 'pointer', fontWeight: 600 }}
                        />
                        {roleUsersList.length > 0 && (
                          <AvatarGroup max={3} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: '0.75rem' } }}>
                            {roleUsersList.slice(0, 3).map(u => (
                              <UserAvatar key={u.id} user={u} size="xs" tooltip={true} />
                            ))}
                          </AvatarGroup>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {role.is_system ? (
                        <Chip
                          label="Rendszer"
                          size="small"
                          icon={<LockIcon />}
                          variant="outlined"
                          color="warning"
                          sx={{ fontWeight: 500 }}
                        />
                      ) : (
                        <Chip
                          label="Egyéni"
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 500 }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Jogosultságok szerkesztése">
                        <IconButton
                          size="small"
                          onClick={() => handleOpenEditPermissions(role)}
                          sx={{ color: '#7c3aed', '&:hover': { bgcolor: '#f5f3ff' } }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Role Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldIcon color="primary" />
          Új szerepkör létrehozása
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Szerepkör neve"
              value={newRoleName}
              onChange={(e) => {
                setNewRoleName(e.target.value);
                if (!newRoleSlug) {
                  setNewRoleSlug(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                }
              }}
              fullWidth
              required
              placeholder="pl. Projekt vezető"
            />
            <TextField
              label="Slug (azonosító)"
              value={newRoleSlug}
              onChange={(e) => setNewRoleSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              fullWidth
              placeholder="pl. projekt_vezeto"
              helperText="Egyedi azonosító, csak kisbetű, szám és alulvonás"
            />
            <TextField
              label="Leírás"
              value={newRoleDescription}
              onChange={(e) => setNewRoleDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="A szerepkör rövid leírása..."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCreateDialog(false)} disabled={createLoading}>
            Mégse
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateRole}
            disabled={createLoading || !newRoleName.trim()}
            startIcon={createLoading ? <CircularProgress size={18} /> : <AddIcon />}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            Létrehozás
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Role Permissions Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldIcon color="primary" />
          Jogosultságok: {selectedRole?.name}
          {selectedRole?.is_system && (
            <Chip label="Rendszer szerepkör" size="small" color="warning" variant="outlined" sx={{ ml: 1 }} />
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Jelöld be azokat a jogosultságokat, amelyeket ez a szerepkör alapértelmezetten megkapjon.
            A felhasználók egyéni jogosultságai felülírhatják ezeket.
          </Alert>

          {Object.entries(permissionGroups).map(([module, perms]) => {
            const checkedCount = perms.filter(p => rolePerms[p.id]).length;
            const allChecked = checkedCount === perms.length;
            const someChecked = checkedCount > 0 && !allChecked;
            const moduleLabel = MODULE_LABELS[module] || module;

            return (
              <Accordion key={module} defaultExpanded={false} sx={{ mb: 0.5 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ bgcolor: '#f8fafc' }}>
                  <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%', pr: 2 }}>
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={() => handleToggleModuleAll(perms)}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                    />
                    <Typography fontWeight={700} sx={{ flex: 1 }}>
                      {moduleLabel}
                    </Typography>
                    <Chip
                      label={`${checkedCount}/${perms.length}`}
                      size="small"
                      color={allChecked ? 'success' : someChecked ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <FormGroup>
                    {perms.map((perm) => (
                      <Box
                        key={perm.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          py: 0.5,
                          px: 1,
                          borderRadius: 1,
                          '&:hover': { bgcolor: '#f5f5f5' },
                        }}
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={!!rolePerms[perm.id]}
                              onChange={() => handleToggleRolePerm(perm.id)}
                              size="small"
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2" fontWeight={rolePerms[perm.id] ? 600 : 400}>
                                {perm.display_name || perm.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                {perm.slug}
                              </Typography>
                            </Box>
                          }
                          sx={{ flex: 1, m: 0 }}
                        />
                      </Box>
                    ))}
                  </FormGroup>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {Object.keys(rolePerms).filter(id => rolePerms[id]).length} jogosultság kiválasztva
          </Typography>
          <Button onClick={() => setEditDialog(false)} disabled={saveLoading}>
            Mégse
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveRolePermissions}
            disabled={saveLoading}
            startIcon={saveLoading ? <CircularProgress size={18} /> : <SaveIcon />}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            Mentés
          </Button>
        </DialogActions>
      </Dialog>

      {/* Users in Role Dialog */}
      <Dialog open={usersDialog} onClose={() => setUsersDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PeopleIcon color="primary" />
            <span>{selectedRoleForUsers?.name} - Felhasználók</span>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {roleUsers.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 3 }}>
              Nincsenek felhasználók ezzel a szerepkörrel
            </Typography>
          ) : (
            <Stack spacing={1}>
              {roleUsers.map(user => (
                <Paper key={user.id} sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <UserAvatar user={user} size="small" tooltip={false} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {user.first_name} {user.last_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {user.email}
                    </Typography>
                  </Box>
                  <Chip
                    label={user.is_active !== false ? 'Aktív' : 'Inaktív'}
                    size="small"
                    color={user.is_active !== false ? 'success' : 'default'}
                    variant="outlined"
                  />
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setUsersDialog(false)}>Bezárás</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Roles;
