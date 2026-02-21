import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  Switch, FormControlLabel,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

export default function ChatbotFaqCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '', slug: '', description: '', icon: 'help', color: '#3b82f6', sort_order: 0, is_active: true,
  });

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await chatbotAPI.adminGetFaqCategories();
      setCategories(response.data || []);
    } catch (error) {
      toast.error('Hiba a kategóriák betöltése közben');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const handleOpenModal = (cat = null) => {
    if (cat) {
      setEditingCategory(cat);
      setFormData({
        name: cat.name, slug: cat.slug, description: cat.description || '',
        icon: cat.icon || 'help', color: cat.color || '#3b82f6',
        sort_order: cat.sort_order || 0, is_active: cat.is_active !== false,
      });
    } else {
      setEditingCategory(null);
      setFormData({ name: '', slug: '', description: '', icon: 'help', color: '#3b82f6', sort_order: 0, is_active: true });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        ...formData,
        slug: formData.slug || formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        sort_order: parseInt(formData.sort_order) || 0,
      };
      if (editingCategory) {
        await chatbotAPI.updateFaqCategory(editingCategory.id, data);
        toast.success('Kategória frissítve');
      } else {
        await chatbotAPI.createFaqCategory(data);
        toast.success('Kategória létrehozva');
      }
      setModalOpen(false);
      fetchCategories();
    } catch (error) {
      toast.error('Hiba a mentés közben');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Biztosan törli ezt a kategóriát?')) return;
    try {
      await chatbotAPI.deleteFaqCategory(id);
      toast.success('Kategória törölve');
      fetchCategories();
    } catch (error) {
      toast.error('Hiba a törlés közben');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>GYIK Kategóriák</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenModal()}>Új kategória</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Szín</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Slug</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Leírás</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Ikon</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Sorrend</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Bejegyzések</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Státusz</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Műveletek</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {categories.map((cat) => (
              <TableRow key={cat.id} hover>
                <TableCell>
                  <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: cat.color || '#3b82f6' }} />
                </TableCell>
                <TableCell><Typography fontWeight={500}>{cat.name}</Typography></TableCell>
                <TableCell><Typography variant="body2" color="text.secondary">{cat.slug}</Typography></TableCell>
                <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{cat.description || '-'}</Typography></TableCell>
                <TableCell>{cat.icon || '-'}</TableCell>
                <TableCell align="center">{cat.sort_order || 0}</TableCell>
                <TableCell align="center">{cat.entry_count || 0}</TableCell>
                <TableCell align="center">
                  <Chip label={cat.is_active ? 'Aktív' : 'Inaktív'} size="small" color={cat.is_active ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleOpenModal(cat)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(cat.id)}><Delete fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {categories.length === 0 && !loading && (
              <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>Nincs kategória</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCategory ? 'Kategória szerkesztése' : 'Új kategória'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Név" required value={formData.name}
            onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} />
          <TextField label="Slug" value={formData.slug}
            onChange={(e) => setFormData(p => ({ ...p, slug: e.target.value }))}
            helperText="Automatikusan generálódik, ha üresen hagyja" />
          <TextField label="Leírás" multiline rows={2} value={formData.description}
            onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} />
          <TextField label="Ikon" value={formData.icon}
            onChange={(e) => setFormData(p => ({ ...p, icon: e.target.value }))}
            helperText="help, work, home, build, people, document, medical, info" />
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField label="Szín" type="color" value={formData.color} sx={{ width: 120 }}
              onChange={(e) => setFormData(p => ({ ...p, color: e.target.value }))} />
            <TextField label="Sorrend" type="number" value={formData.sort_order} sx={{ width: 120 }}
              onChange={(e) => setFormData(p => ({ ...p, sort_order: e.target.value }))} />
          </Box>
          <FormControlLabel control={
            <Switch checked={formData.is_active} onChange={(e) => setFormData(p => ({ ...p, is_active: e.target.checked }))} />
          } label="Aktív" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formData.name}>Mentés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
