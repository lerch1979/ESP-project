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
  Autocomplete,
} from '@mui/material';
import { ticketsAPI, employeesAPI } from '../services/api';
import { toast } from 'react-toastify';
import api from '../services/api';

function CreateTicketModal({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category_id: '',
    priority_id: '',
    assigned_to: '',
    linked_employee_id: '',
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
        // Prefer hierarchical tree when present (post-migration 102),
        // otherwise fall back to the flat list for back-compat.
        const data = categoriesRes.value.data;
        setCategories(data.tree?.length ? data.tree : (data.categories || []));
      }

      if (prioritiesRes.status === 'fulfilled' && prioritiesRes.value.success) {
        setPriorities(prioritiesRes.value.data.priorities || []);
      }

      // Employees for the "linked employee" autocomplete — large list so
      // we pull a bounded page; the Autocomplete does client-side search.
      setEmployeesLoading(true);
      try {
        const empRes = await employeesAPI.getAll({ limit: 1000 });
        if (empRes?.success) {
          setEmployees(empRes.data?.employees || []);
        }
      } finally {
        setEmployeesLoading(false);
      }
    } catch (error) {
      console.error('Form adatok betöltési hiba:', error);
      toast.error('Hiba az űrlap adatok betöltésekor');
    }
  };

  const handleChange = (field, value) => {
    // Coerce undefined → '' so MUI Select stays "controlled" — without this,
    // a value transitioning to undefined triggers the controlled/uncontrolled
    // console warning.
    setFormData(prev => ({ ...prev, [field]: value ?? '' }));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim()) {
      toast.error('Add meg a címet!');
      return;
    }

    setLoading(true);
    try {
      const payload = { title: formData.title, description: formData.description };
      if (formData.category_id)       payload.category_id = formData.category_id;
      if (formData.priority_id)       payload.priority_id = formData.priority_id;
      if (formData.assigned_to)       payload.assigned_to = formData.assigned_to;
      if (formData.linked_employee_id) payload.linked_employee_id = formData.linked_employee_id;

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
      linked_employee_id: '',
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, fontSize: '1.5rem' }}>
        Új hibajegy létrehozása
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

          {/* Kategória — 2-szintű, ListSubheader-rel csoportosítva.
              A tree-re fallback: ha a categories[0].children létezik, hierarchikusan
              renderelünk; egyébként sima lista (régi, lapos válasz). */}
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
                {categories.flatMap((cat) => {
                  if (Array.isArray(cat.children) && cat.children.length > 0) {
                    return [
                      // Parent rendered as a disabled MenuItem so MUI sets
                      // aria-disabled and screen readers announce it as a
                      // non-selectable group header. The explicit value (parent
                      // id) is required so MUI's Select doesn't see a child
                      // with value=undefined and complain about controlled →
                      // uncontrolled transitions.
                      <MenuItem
                        key={`p-${cat.id}`}
                        value={`__parent_${cat.id}`}
                        disabled
                        sx={{ bgcolor: '#f8fafc', fontWeight: 700, opacity: '1 !important' }}
                      >
                        {cat.icon} {cat.name}
                      </MenuItem>,
                      ...cat.children.map((c) => (
                        <MenuItem key={c.id} value={c.id} sx={{ pl: 4 }}>
                          {c.icon} {c.name}
                        </MenuItem>
                      )),
                    ];
                  }
                  // Legacy flat row — still selectable (parent has no children
                  // in the data, e.g. someone added an isolated category).
                  return [
                    <MenuItem key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </MenuItem>,
                  ];
                })}
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

          {/* Linked employee (autocomplete) */}
          <Grid item xs={12}>
            <Autocomplete
              options={employees}
              loading={employeesLoading}
              value={employees.find(e => e.id === formData.linked_employee_id) || null}
              onChange={(_, val) => handleChange('linked_employee_id', val?.id || '')}
              getOptionLabel={(e) => {
                // For ticket flow we care WHERE THE PERSON LIVES, not where
                // they work — that's where the maintenance / fault actually is.
                const name = [e.first_name, e.last_name].filter(Boolean).join(' ');
                const room = e.room_number ? `${e.room_number}. szoba` : null;
                const where = [e.accommodation_name, room].filter(Boolean).join(', ');
                return where ? `${name} (${where})` : name;
              }}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Kapcsolódó dolgozó (opcionális)"
                  placeholder="Keress név vagy szállás alapján"
                />
              )}
              noOptionsText="Nincs találat"
              clearText="Törlés"
            />
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
            bgcolor: '#2563eb',
            '&:hover': { bgcolor: '#1d4ed8' },
          }}
        >
          {loading ? <CircularProgress size={24} /> : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateTicketModal;
