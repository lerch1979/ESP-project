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
  TablePagination,
  Button,
  IconButton,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  CircularProgress,
  Alert,
  Tooltip,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormGroup,
  Divider,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Security as SecurityIcon,
  ExpandMore as ExpandMoreIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { usersAPI, permissionsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

function Users() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('users.create');
  const canEdit = hasPermission('users.edit');
  const canDelete = hasPermission('users.delete');
  const canManagePermissions = hasPermission('users.manage_permissions');

  // State
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Roles & permissions
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [permissionGroups, setPermissionGroups] = useState({});

  // Dialogs
  const [userDialog, setUserDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [permDialog, setPermDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    roleId: '',
  });
  const [formErrors, setFormErrors] = useState({});

  // Permission override form
  const [userPermData, setUserPermData] = useState({
    rolePermissions: [],
    effectivePermissions: [],
    overrides: [],
    userRoles: [],
  });
  const [permOverrides, setPermOverrides] = useState({});

  // Load data
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;

      const response = await usersAPI.getAll(params);
      if (response.success) {
        setUsers(response.data.users);
        setTotalCount(response.data.count);
      }
    } catch (error) {
      toast.error('Hiba a felhasználók betöltése során');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, roleFilter]);

  const loadRolesAndPermissions = useCallback(async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        permissionsAPI.getRoles(),
        permissionsAPI.getAll(),
      ]);
      if (rolesRes.success) setRoles(rolesRes.data.roles);
      if (permsRes.success) {
        setAllPermissions(permsRes.data.permissions);
        setPermissionGroups(permsRes.data.grouped);
      }
    } catch {
      // Permissions might not be accessible for all users
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadRolesAndPermissions();
  }, [loadRolesAndPermissions]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Create / Edit user
  const handleOpenCreate = () => {
    setSelectedUser(null);
    setFormData({ firstName: '', lastName: '', email: '', phone: '', password: '', roleId: '' });
    setFormErrors({});
    setUserDialog(true);
  };

  const handleOpenEdit = (user) => {
    setSelectedUser(user);
    setFormData({
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      phone: user.phone || '',
      password: '',
      roleId: user.roles?.[0]?.id || '',
    });
    setFormErrors({});
    setUserDialog(true);
  };

  const handleSaveUser = async () => {
    const errors = {};
    if (!formData.firstName.trim()) errors.firstName = 'Vezetéknév kötelező';
    if (!formData.lastName.trim()) errors.lastName = 'Keresztnév kötelező';
    if (!formData.email.trim()) errors.email = 'Email kötelező';
    if (!selectedUser && !formData.password.trim()) errors.password = 'Jelszó kötelező új felhasználónál';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      if (selectedUser) {
        const updateData = {
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || null,
        };
        if (formData.roleId) updateData.roleId = formData.roleId;

        await usersAPI.update(selectedUser.id, updateData);
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
      setUserDialog(false);
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    }
  };

  // Delete user
  const handleOpenDelete = (user) => {
    setSelectedUser(user);
    setDeleteDialog(true);
  };

  const handleDeleteUser = async () => {
    try {
      await usersAPI.delete(selectedUser.id);
      toast.success('Felhasználó deaktiválva');
      setDeleteDialog(false);
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt');
    }
  };

  // Permission management
  const handleOpenPermissions = async (user) => {
    setSelectedUser(user);
    try {
      const response = await permissionsAPI.getUserPermissions(user.id);
      if (response.success) {
        setUserPermData(response.data);

        // Build override map
        const overrideMap = {};
        response.data.overrides.forEach(o => {
          overrideMap[o.id] = o.granted;
        });
        setPermOverrides(overrideMap);
      }
      setPermDialog(true);
    } catch (error) {
      toast.error('Hiba a jogosultságok betöltése során');
    }
  };

  const handleTogglePermOverride = (permId, currentState) => {
    setPermOverrides(prev => {
      const updated = { ...prev };
      if (currentState === undefined) {
        // Not overridden -> set to revoked
        updated[permId] = false;
      } else if (currentState === false) {
        // Revoked -> set to granted
        updated[permId] = true;
      } else {
        // Granted -> remove override
        delete updated[permId];
      }
      return updated;
    });
  };

  const handleSavePermissions = async () => {
    try {
      const permissions = Object.entries(permOverrides).map(([permId, granted]) => ({
        permissionId: permId,
        granted,
      }));

      await permissionsAPI.updateUserPermissions(selectedUser.id, permissions);
      toast.success('Jogosultságok sikeresen frissítve');
      setPermDialog(false);
    } catch (error) {
      toast.error('Hiba a jogosultságok mentése során');
    }
  };

  const getRoleChipColor = (slug) => {
    const colors = {
      superadmin: 'error',
      data_controller: 'warning',
      admin: 'primary',
      task_owner: 'info',
      contractor: 'default',
      user: 'default',
      accommodated_employee: 'secondary',
    };
    return colors[slug] || 'default';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
          Felhasználók
        </Typography>
        {canCreate && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            Új felhasználó
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            size="small"
            placeholder="Keresés..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon /></InputAdornment>
              ),
            }}
            sx={{ minWidth: 250 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Szerepkör</InputLabel>
            <Select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
              label="Szerepkör"
            >
              <MenuItem value="">Összes</MenuItem>
              {roles.map(role => (
                <MenuItem key={role.id} value={role.slug}>{role.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton onClick={loadUsers} title="Frissítés">
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Név</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Telefon</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Szerepkör</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Státusz</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">Nem található felhasználó</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {user.first_name} {user.last_name}
                        </Typography>
                        {user.contractor_name && (
                          <Typography variant="caption" color="text.secondary">
                            {user.contractor_name}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.phone || '-'}</TableCell>
                      <TableCell>
                        {user.roles?.filter(r => r.slug).map(role => (
                          <Chip
                            key={role.slug}
                            label={role.name}
                            size="small"
                            color={getRoleChipColor(role.slug)}
                            sx={{ mr: 0.5, mb: 0.5 }}
                          />
                        ))}
                        {(!user.roles || user.roles.filter(r => r.slug).length === 0) && (
                          <Typography variant="caption" color="text.secondary">Nincs szerepkör</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={user.is_active ? 'Aktív' : 'Inaktív'}
                          size="small"
                          color={user.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {canManagePermissions && (
                          <Tooltip title="Jogosultságok">
                            <IconButton size="small" onClick={() => handleOpenPermissions(user)} color="secondary">
                              <SecurityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canEdit && (
                          <Tooltip title="Szerkesztés">
                            <IconButton size="small" onClick={() => handleOpenEdit(user)} color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canDelete && user.is_active && (
                          <Tooltip title="Deaktiválás">
                            <IconButton size="small" onClick={() => handleOpenDelete(user)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              component="div"
              count={totalCount}
              page={page}
              onPageChange={(e, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]}
              labelRowsPerPage="Sorok/oldal:"
            />
          </>
        )}
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={userDialog} onClose={() => setUserDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {selectedUser ? 'Felhasználó szerkesztése' : 'Új felhasználó'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Vezetéknév"
              value={formData.firstName}
              onChange={(e) => setFormData(p => ({ ...p, firstName: e.target.value }))}
              error={!!formErrors.firstName}
              helperText={formErrors.firstName}
              fullWidth
              required
            />
            <TextField
              label="Keresztnév"
              value={formData.lastName}
              onChange={(e) => setFormData(p => ({ ...p, lastName: e.target.value }))}
              error={!!formErrors.lastName}
              helperText={formErrors.lastName}
              fullWidth
              required
            />
            <TextField
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
              error={!!formErrors.email}
              helperText={formErrors.email}
              fullWidth
              required
            />
            <TextField
              label="Telefon"
              value={formData.phone}
              onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
              fullWidth
            />
            <TextField
              label={selectedUser ? 'Új jelszó (opcionális)' : 'Jelszó'}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
              error={!!formErrors.password}
              helperText={formErrors.password}
              fullWidth
              required={!selectedUser}
            />
            {canManagePermissions && (
              <FormControl fullWidth>
                <InputLabel>Szerepkör</InputLabel>
                <Select
                  value={formData.roleId}
                  onChange={(e) => setFormData(p => ({ ...p, roleId: e.target.value }))}
                  label="Szerepkör"
                >
                  <MenuItem value="">Nincs</MenuItem>
                  {roles.map(role => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        ({role.permissionCount} jogosultság)
                      </Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setUserDialog(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSaveUser}>
            {selectedUser ? 'Mentés' : 'Létrehozás'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Felhasználó deaktiválása</DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan deaktiválod a következő felhasználót?
          </Typography>
          <Typography fontWeight={600} sx={{ mt: 1 }}>
            {selectedUser?.first_name} {selectedUser?.last_name} ({selectedUser?.email})
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteDialog(false)}>Mégse</Button>
          <Button variant="contained" color="error" onClick={handleDeleteUser}>
            Deaktiválás
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permission Management Dialog */}
      <Dialog open={permDialog} onClose={() => setPermDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SecurityIcon color="primary" />
            Jogosultságok: {selectedUser?.first_name} {selectedUser?.last_name}
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {/* Current roles */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Szerepkörök
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {userPermData.roles?.map(role => (
                <Chip key={role.id} label={role.name} color={getRoleChipColor(role.slug)} />
              ))}
              {(!userPermData.roles || userPermData.roles.length === 0) && (
                <Typography variant="body2" color="text.secondary">Nincs szerepkör rendelve</Typography>
              )}
            </Box>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Alert severity="info" sx={{ mb: 2 }}>
            Az egyéni felülírásokkal bővítheted vagy korlátozhatod a szerepkörből származó alapjogosultságokat.
            Kattints a jogosultságra az állapot váltásához.
          </Alert>

          {/* Permission groups */}
          {Object.entries(permissionGroups).map(([module, perms]) => (
            <Accordion key={module} defaultExpanded={false}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={600} sx={{ textTransform: 'capitalize' }}>
                  {module}
                </Typography>
                <Chip
                  label={`${perms.length} jogosultság`}
                  size="small"
                  sx={{ ml: 2 }}
                />
              </AccordionSummary>
              <AccordionDetails>
                <FormGroup>
                  {perms.map((perm) => {
                    const isFromRole = userPermData.rolePermissions?.includes(perm.slug);
                    const override = permOverrides[perm.id];
                    const isEffective = override === true || (isFromRole && override !== false);

                    let statusLabel = '';
                    let statusColor = 'default';
                    if (override === true) {
                      statusLabel = 'Egyéni engedélyezés';
                      statusColor = 'success';
                    } else if (override === false) {
                      statusLabel = 'Egyéni tiltás';
                      statusColor = 'error';
                    } else if (isFromRole) {
                      statusLabel = 'Szerepkörből';
                      statusColor = 'primary';
                    }

                    return (
                      <Box
                        key={perm.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          py: 0.75,
                          px: 1,
                          borderRadius: 1,
                          '&:hover': { bgcolor: '#f5f5f5' },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                          {isEffective ? (
                            <CheckIcon fontSize="small" color="success" />
                          ) : (
                            <CloseIcon fontSize="small" color="disabled" />
                          )}
                          <Box>
                            <Typography variant="body2" fontWeight={isEffective ? 600 : 400}>
                              {perm.display_name || perm.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {perm.slug}
                            </Typography>
                          </Box>
                        </Box>
                        {statusLabel && (
                          <Chip label={statusLabel} size="small" color={statusColor} variant="outlined" sx={{ mr: 1, fontSize: '0.7rem' }} />
                        )}
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleTogglePermOverride(perm.id, override)}
                          sx={{ minWidth: 80, fontSize: '0.75rem' }}
                        >
                          {override === undefined ? 'Tiltás' : override === false ? 'Engedély' : 'Alapért.'}
                        </Button>
                      </Box>
                    );
                  })}
                </FormGroup>
              </AccordionDetails>
            </Accordion>
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setPermDialog(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSavePermissions} startIcon={<SecurityIcon />}>
            Jogosultságok mentése
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Users;
