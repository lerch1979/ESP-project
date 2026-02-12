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
  Grid,
  CircularProgress,
  Typography,
} from '@mui/material';
import { ticketsAPI } from '../services/api';
import { toast } from 'react-toastify';
import api from '../services/api';

function CreateTicketModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [priorities, setPriorities] = useState([]);
  
  const [formData, setFormData] = useState({
    accommodated_employee_id: '',
    title: '',
    description: '',
    category_id: '',
    priority_id: '',
    assigned_to: '',
  });

  useEffect(() => {
    if (open) {
      loadFormData();
    }
  }, [open]);

  const loadFormData = async () => {
    console.log('🔄 loadFormData indult...');
    try {
      // Szállásolt munkavállalók lekérése
      console.log('Szállásolt munkavállalók lekérése...');
      const employeesRes = await api.get('/users?role=accommodated_employee');
      console.log('Employees response:', employeesRes.data);
      if (employeesRes.data.success) {
        setEmployees(employeesRes.data.data.users || []);
        console.log('✅ Employees:', employeesRes.data.data.users?.length);
      }

      // Felhasználók (felelősök) lekérése
      console.log('Felhasználók lekérése...');
      const usersRes = await api.get('/users');
      console.log('Users response:', usersRes.data);
      if (usersRes.data.success) {
        setUsers(usersRes.data.data.users || []);
        console.log('✅ Users:', usersRes.data.data.users?.length);
      }

      // Kategóriák lekérése
      console.log('Kategóriák lekérése...');
      const categoriesRes = await api.get('/categories');
      console.log('Categories response:', categoriesRes.data);
      if (categoriesRes.data.success) {
        setCategories(categoriesRes.data.data.categories || []);
        console.log('✅ Categories:', categoriesRes.data.data.categories?.length);
      }

      // Státuszok lekérése
      console.log('Státuszok lekérése...');
      const statusesRes = await api.get('/statuses');
      console.log('Statuses response:', statusesRes.data);
      if (statusesRes.data.success) {
        setStatuses(statusesRes.data.data.statuses || []);
        console.log('✅ Statuses:', statusesRes.data.data.statuses?.length);
      }

      // Prioritások lekérése
      console.log('Prioritások lekérése...');
      const prioritiesRes = await api.get('/priorities');
      console.log('Priorities response:', prioritiesRes.data);
      if (prioritiesRes.data.success) {
        setPriorities(prioritiesRes.data.data.priorities || []);
        console.log('✅ Priorities:', prioritiesRes.data.data.priorities?.length);
      }
      
      console.log('✅ Minden adat betöltve!');
    } catch (error) {
      console.error('❌ Form adatok betöltési hiba:', error);
      console.error('Error details:', error.response?.data || error.message);
      toast.error('Hiba az űrlap adatok betöltésekor: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Validálás
    if (!formData.accommodated_employee_id) {
      toast.error('Válassz munkavállalót!');
      return;
    }
    if (!formData.title.trim()) {
      toast.error('Add meg a címet!');
      return;
    }
    if (!formData.category_id) {
      toast.error('Válassz kategóriát!');
      return;
    }
    if (!formData.priority_id) {
      toast.error('Válassz prioritást!');
      return;
    }

    setLoading(true);
    try {
      const response = await ticketsAPI.create(formData);
      
      if (response.success) {
        toast.success('Hibajegy létrehozva!');
        onSuccess();
        handleClose();
      }
    } catch (error) {
      console.error('Hibajegy létrehozási hiba:', error);
      toast.error(error.response?.data?.message || 'Hiba a hibajegy létrehozásakor');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      accommodated_employee_id: '',
      title: '',
      description: '',
      category_id: '',
      priority_id: '',
      assigned_to: '',
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Új hibajegy létrehozása
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {/* Munkavállaló */}
          <Grid item xs={12}>
            <FormControl fullWidth required>
              <InputLabel>Szállásolt munkavállaló</InputLabel>
              <Select
                value={formData.accommodated_employee_id}
                onChange={(e) => handleChange('accommodated_employee_id', e.target.value)}
                label="Szállásolt munkavállaló"
              >
                <MenuItem value="">
                  <em>Válassz munkavállalót...</em>
                </MenuItem>
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name} ({emp.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Cím */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Cím"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="pl. Fűtés nem működik"
            />
          </Grid>

          {/* Leírás */}
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Részletes leírás"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="Írd le a problémát részletesen..."
            />
          </Grid>

          {/* Kategória */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Kategória</InputLabel>
              <Select
                value={formData.category_id}
                onChange={(e) => handleChange('category_id', e.target.value)}
                label="Kategória"
              >
                <MenuItem value="">
                  <em>Válassz kategóriát...</em>
                </MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Prioritás */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel>Prioritás</InputLabel>
              <Select
                value={formData.priority_id}
                onChange={(e) => handleChange('priority_id', e.target.value)}
                label="Prioritás"
              >
                <MenuItem value="">
                  <em>Válassz prioritást...</em>
                </MenuItem>
                {priorities.map((priority) => (
                  <MenuItem key={priority.id} value={priority.id}>
                    {priority.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Felelős */}
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Felelős (opcionális)</InputLabel>
              <Select
                value={formData.assigned_to}
                onChange={(e) => handleChange('assigned_to', e.target.value)}
                label="Felelős (opcionális)"
              >
                <MenuItem value="">
                  <em>Nincs kijelölve</em>
                </MenuItem>
                {users.filter(u => u.id !== formData.accommodated_employee_id).map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} - {user.role_names?.join(', ')}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={loading}>
          Mégse
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
          sx={{
            bgcolor: '#2c5f2d',
            '&:hover': { bgcolor: '#234d24' },
          }}
        >
          {loading ? <CircularProgress size={24} /> : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateTicketModal;
