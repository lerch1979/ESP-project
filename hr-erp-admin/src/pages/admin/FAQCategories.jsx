import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Chip, Switch, CircularProgress, Tooltip,
} from '@mui/material';
import {
  Add, Edit, Delete, ArrowUpward, ArrowDownward, Refresh,
} from '@mui/icons-material';
import { chatbotAPI } from '../../services/api';
import { toast } from 'react-toastify';
import CategoryFormModal from '../../components/admin/CategoryFormModal';

export default function FAQCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

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
    setEditingCategory(cat);
    setModalOpen(true);
  };

  const handleSave = async (data) => {
    try {
      if (editingCategory) {
        await chatbotAPI.updateFaqCategory(editingCategory.id, data);
        toast.success('Kategória frissítve');
      } else {
        await chatbotAPI.createFaqCategory(data);
        toast.success('Kategória létrehozva');
      }
      fetchCategories();
    } catch (error) {
      toast.error('Hiba a mentés közben');
      throw error;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Biztosan törli ezt a kategóriát? A hozzá tartozó bejegyzések kategória nélkül maradnak.')) return;
    try {
      await chatbotAPI.deleteFaqCategory(id);
      toast.success('Kategória törölve');
      fetchCategories();
    } catch (error) {
      toast.error('Hiba a törlés közben');
    }
  };

  const handleToggleActive = async (cat) => {
    try {
      await chatbotAPI.updateFaqCategory(cat.id, { is_active: !cat.is_active });
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: !c.is_active } : c))
      );
      toast.success(cat.is_active ? 'Kategória inaktiválva' : 'Kategória aktiválva');
    } catch (error) {
      toast.error('Hiba a státusz módosítása közben');
    }
  };

  const handleReorder = async (index, direction) => {
    const newCategories = [...categories];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCategories.length) return;

    [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];
    setCategories(newCategories);

    try {
      await chatbotAPI.reorderFaqCategories(newCategories.map((c) => c.id));
    } catch (error) {
      toast.error('Hiba a sorrend mentése közben');
      fetchCategories();
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>FAQ Kategóriák</Typography>
          <Typography variant="body2" color="text.secondary">
            Kezelje a GYIK kategóriákat és azok megjelenési sorrendjét
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchCategories} disabled={loading}>
            Frissítés
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenModal()}>
            Új kategória
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#2563eb' }} />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 600, width: 80 }}>Sorrend</TableCell>
                <TableCell sx={{ fontWeight: 600, width: 40 }}>Szín</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Ikon</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Leírás</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Bejegyzések</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Státusz</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.map((cat, index) => (
                <TableRow key={cat.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Tooltip title="Felfelé">
                        <span>
                          <IconButton
                            size="small" disabled={index === 0}
                            onClick={() => handleReorder(index, 'up')}
                          >
                            <ArrowUpward fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Lefelé">
                        <span>
                          <IconButton
                            size="small" disabled={index === categories.length - 1}
                            onClick={() => handleReorder(index, 'down')}
                          >
                            <ArrowDownward fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ width: 24, height: 24, borderRadius: 1, bgcolor: cat.color || '#3b82f6' }} />
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={500}>{cat.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{cat.slug}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={cat.icon || 'help'} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {cat.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={cat.entry_count || 0} size="small" color="primary" variant="outlined" />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={cat.is_active !== false}
                      onChange={() => handleToggleActive(cat)}
                      size="small"
                      color="success"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Szerkesztés">
                      <IconButton size="small" onClick={() => handleOpenModal(cat)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Törlés">
                      <IconButton size="small" color="error" onClick={() => handleDelete(cat.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">Nincs kategória. Hozzon létre egyet az "Új kategória" gombbal.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CategoryFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingCategory(null); }}
        onSave={handleSave}
        category={editingCategory}
      />
    </Box>
  );
}
