import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Tooltip,
  Stack,
  Avatar,
  Badge,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Security as SecurityIcon,
  Refresh as RefreshIcon,
  PersonOff as PersonOffIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { usersAPI, permissionsAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import UserFormModal from '../../components/admin/UserFormModal';

const ROLE_COLORS = {
  superadmin: { bg: '#fef2f2', color: '#dc2626', chipColor: 'error' },
  admin: { bg: '#eff6ff', color: '#2563eb', chipColor: 'primary' },
  data_controller: { bg: '#fff7ed', color: '#ea580c', chipColor: 'warning' },
  task_owner: { bg: '#eff6ff', color: '#0891b2', chipColor: 'info' },
  contractor: { bg: '#f5f5f5', color: '#666', chipColor: 'default' },
  user: { bg: '#f5f5f5', color: '#666', chipColor: 'default' },
  accommodated_employee: { bg: '#faf5ff', color: '#7c3aed', chipColor: 'secondary' },
};

function AdminUsers() {
  const navigate = useNavigate();
  const { hasPermission, isSuperAdmin } = useAuth();
  const canCreate = hasPermission('users.create');
  const canEdit = hasPermission('users.edit');
  const canDelete = hasPermission('users.delete');
  const canManagePermissions = hasPermission('users.manage_permissions');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [roles, setRoles] = useState([]);

  // Dialogs
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;

      const response = await usersAPI.getAll(params);
      if (response.success) {
        setUsers(response.data.users || response.data || []);
        setTotalCount(response.data.count || response.data.total || 0);
      }
    } catch (error) {
      toast.error('Hiba a felhasználók betöltése során');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, roleFilter, statusFilter]);

  const loadRoles = useCallback(async () => {
    try {
      const response = await permissionsAPI.getRoles();
      if (response.success) {
        setRoles(response.data.roles || response.data || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Create
  const handleOpenCreate = () => {
    setEditingUser(null);
    setUserFormOpen(true);
  };

  // Edit
  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setUserFormOpen(true);
  };

  // Delete
  const handleOpenDelete = (user) => {
    setSelectedUser(user);
    setDeleteDialog(true);
  };

  const handleDeleteUser = async () => {
    setDeleteLoading(true);
    try {
      await usersAPI.delete(selectedUser.id);
      toast.success('Felhasználó sikeresen deaktiválva');
      setDeleteDialog(false);
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Hiba történt a deaktiválás során');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Navigate to permissions page
  const handleManagePermissions = (user) => {
    navigate(`/admin/users/${user.id}/permissions`);
  };

  const getRoleChipColor = (slug) => {
    return ROLE_COLORS[slug]?.chipColor || 'default';
  };

  const getUserInitials = (user) => {
    const f = user.first_name?.[0] || '';
    const l = user.last_name?.[0] || '';
    return (f + l).toUpperCase();
  };

  const getAvatarColor = (user) => {
    const role = user.roles?.[0]?.slug;
    return ROLE_COLORS[role]?.color || '#667eea';
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
            Felhasználók kezelése
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Felhasználók létrehozása, szerkesztése és jogosultságaik kezelése
          </Typography>
        </Box>
        {canCreate && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              px: 3,
              py: 1,
            }}
          >
            Új felhasználó
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          <TextField
            size="small"
            placeholder="Keresés név vagy email alapján..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><SearchIcon /></InputAdornment>
              ),
            }}
            sx={{ minWidth: 280, flex: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Szerepkör</InputLabel>
            <Select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
              label="Szerepkör"
            >
              <MenuItem value="">Összes szerepkör</MenuItem>
              {roles.map(role => (
                <MenuItem key={role.id} value={role.slug}>{role.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Státusz</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              label="Státusz"
            >
              <MenuItem value="">Összes</MenuItem>
              <MenuItem value="active">Aktív</MenuItem>
              <MenuItem value="inactive">Inaktív</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Frissítés">
            <IconButton onClick={loadUsers}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      {/* Stats chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Chip
          label={`Összes: ${totalCount}`}
          size="small"
          variant="outlined"
        />
        {roles.slice(0, 4).map(role => {
          const count = users.filter(u => u.roles?.some(r => r.slug === role.slug)).length;
          if (count === 0) return null;
          return (
            <Chip
              key={role.id}
              label={`${role.name}: ${count}`}
              size="small"
              color={getRoleChipColor(role.slug)}
              variant="outlined"
            />
          );
        })}
      </Stack>

      {/* Users Table */}
      <TableContainer component={Paper} sx={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ fontWeight: 700, width: 60 }}></TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Név</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Szerepkör</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Státusz</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                      <PersonOffIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
                      <Typography color="text.secondary">Nem található felhasználó</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow
                      key={user.id}
                      hover
                      sx={{
                        '&:hover': { bgcolor: '#f8fafc' },
                        opacity: user.is_active === false ? 0.6 : 1,
                      }}
                    >
                      <TableCell>
                        <Badge
                          overlap="circular"
                          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                          badgeContent={
                            user.roles?.some(r => r.slug === 'superadmin') ? (
                              <AdminIcon sx={{ fontSize: 14, color: '#dc2626' }} />
                            ) : null
                          }
                        >
                          <Avatar
                            sx={{
                              width: 38,
                              height: 38,
                              bgcolor: getAvatarColor(user),
                              fontSize: '0.85rem',
                              fontWeight: 600,
                            }}
                          >
                            {getUserInitials(user)}
                          </Avatar>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {user.first_name} {user.last_name}
                        </Typography>
                        {user.phone && (
                          <Typography variant="caption" color="text.secondary">
                            {user.phone}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{user.email}</Typography>
                      </TableCell>
                      <TableCell>
                        {user.roles?.filter(r => r.slug).map(role => (
                          <Chip
                            key={role.slug}
                            label={role.name}
                            size="small"
                            color={getRoleChipColor(role.slug)}
                            sx={{ mr: 0.5, mb: 0.5, fontWeight: 500 }}
                          />
                        ))}
                        {(!user.roles || user.roles.filter(r => r.slug).length === 0) && (
                          <Typography variant="caption" color="text.secondary">Nincs szerepkör</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={user.is_active !== false ? 'Aktív' : 'Inaktív'}
                          size="small"
                          color={user.is_active !== false ? 'success' : 'default'}
                          variant={user.is_active !== false ? 'filled' : 'outlined'}
                          sx={{ fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          {canManagePermissions && (
                            <Tooltip title="Jogosultságok kezelése">
                              <IconButton
                                size="small"
                                onClick={() => handleManagePermissions(user)}
                                sx={{
                                  color: '#7c3aed',
                                  '&:hover': { bgcolor: '#f5f3ff' },
                                }}
                              >
                                <SecurityIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canEdit && (
                            <Tooltip title="Szerkesztés">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenEdit(user)}
                                color="primary"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canDelete && user.is_active !== false && (
                            <Tooltip title="Deaktiválás">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenDelete(user)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
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

      {/* User Form Modal */}
      <UserFormModal
        open={userFormOpen}
        onClose={() => setUserFormOpen(false)}
        user={editingUser}
        onSuccess={loadUsers}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#dc2626' }}>
          Felhasználó deaktiválása
        </DialogTitle>
        <DialogContent>
          <Typography>
            Biztosan deaktiválod a következő felhasználót?
          </Typography>
          <Paper sx={{ p: 2, mt: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
            <Typography fontWeight={600}>
              {selectedUser?.first_name} {selectedUser?.last_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedUser?.email}
            </Typography>
          </Paper>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            A felhasználó nem fogja tudni bejelentkezni, de az adatai megmaradnak.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteDialog(false)} disabled={deleteLoading}>
            Mégse
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteUser}
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={18} /> : <DeleteIcon />}
          >
            Deaktiválás
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AdminUsers;
