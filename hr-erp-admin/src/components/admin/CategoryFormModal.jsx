import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Switch, FormControlLabel, Box,
} from '@mui/material';

export default function CategoryFormModal({ open, onClose, onSave, category }) {
  const [formData, setFormData] = useState({
    name: '', slug: '', description: '', icon: 'help', color: '#3b82f6', sort_order: 0, is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || '',
        slug: category.slug || '',
        description: category.description || '',
        icon: category.icon || 'help',
        color: category.color || '#3b82f6',
        sort_order: category.sort_order || 0,
        is_active: category.is_active !== false,
      });
    } else {
      setFormData({ name: '', slug: '', description: '', icon: 'help', color: '#3b82f6', sort_order: 0, is_active: true });
    }
  }, [category, open]);

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave({
        ...formData,
        slug: formData.slug || formData.name.toLowerCase().replace(/[^a-z0-9áéíóöőúüű]/g, '-').replace(/-+/g, '-'),
        sort_order: parseInt(formData.sort_order) || 0,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{category ? 'Kategória szerkesztése' : 'Új kategória'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
        <TextField
          label="Név" required fullWidth value={formData.name}
          onChange={handleChange('name')}
        />
        <TextField
          label="Slug" fullWidth value={formData.slug}
          onChange={handleChange('slug')}
          helperText="Automatikusan generálódik, ha üresen hagyja"
        />
        <TextField
          label="Leírás" multiline rows={2} fullWidth value={formData.description}
          onChange={handleChange('description')}
        />
        <TextField
          label="Ikon" fullWidth value={formData.icon}
          onChange={handleChange('icon')}
          helperText="help, work, home, build, people, document, medical, info"
        />
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            label="Szín" type="color" value={formData.color} sx={{ width: 120 }}
            onChange={handleChange('color')}
          />
          <TextField
            label="Sorrend" type="number" value={formData.sort_order} sx={{ width: 120 }}
            onChange={handleChange('sort_order')}
          />
        </Box>
        <FormControlLabel
          control={<Switch checked={formData.is_active} onChange={handleChange('is_active')} />}
          label="Aktív"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!formData.name || saving}>
          {saving ? 'Mentés...' : 'Mentés'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
