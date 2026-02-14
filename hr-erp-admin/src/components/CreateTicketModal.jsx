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
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);

  const [formData, setFormData] = useState({
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
    try {
      const [usersRes, categoriesRes, prioritiesRes] = await Promise.allSettled([
        api.get('/users'),
        ticketsAPI.getCategories(),
        ticketsAPI.getPriorities(),
      ]);

      if (usersRes.status === 'fulfilled' && usersRes.value.data.success) {
        setUsers(usersRes.value.data.data.users || []);
      }

      if (categoriesRes.status === 'fulfilled' && categoriesRes.value.success) {
        setCategories(categoriesRes.value.data.categories || []);
      }

      if (prioritiesRes.status === 'fulfilled' && prioritiesRes.value.success) {
        setPriorities(prioritiesRes.value.data.priorities || []);
      }
    } catch (error) {
      console.error('Form adatok betöltési hiba:', error);
      toast.error('Hiba az űrlap adatok betöltésekor');
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error('Add meg a címet!');
      return;
    }

    setLoading(true);
    try {
      const payload = { title: formData.title, description: formData.description };
      if (formData.category_id) payload.category_id = formData.category_id;
      if (formData.priority_id) payload.priority_id = formData.priority_id;
      if (formData.assigned_to) payload.assigned_to = formData.assigned_to;

      const response = await ticketsAPI.create(payload);

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
            <FormControl fullWidth>
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
            <FormControl fullWidth>
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
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
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
