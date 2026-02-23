import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, IconButton, Chip, Switch, CircularProgress,
  TextField, FormControl, InputLabel, Select, MenuItem, InputAdornment, Checkbox,
  Tooltip, Menu,
} from '@mui/material';
import {
  Add, Edit, Delete, Search, Refresh, MoreVert, DeleteSweep,
  ToggleOn, ToggleOff, Category as CategoryIcon,
} from '@mui/icons-material';
import { chatbotAPI } from '../../services/api';
import { toast } from 'react-toastify';
import FAQEntryFormModal from '../../components/admin/FAQEntryFormModal';

export default function FAQKnowledgeBase() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulkMenuAnchor, setBulkMenuAnchor] = useState(null);
  const [bulkCategoryMenuAnchor, setBulkCategoryMenuAnchor] = useState(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page: page + 1, limit: rowsPerPage };
      if (search) params.search = search;
      if (categoryFilter) params.category_id = categoryFilter;
      const response = await chatbotAPI.getKnowledgeBase(params);
      setEntries(response.data || []);
      setTotalCount(response.pagination?.total || 0);
    } catch (error) {
      toast.error('Hiba a tudásbázis betöltése közben');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, categoryFilter]);

  const fetchCategories = async () => {
    try {
      const response = await chatbotAPI.adminGetFaqCategories();
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleOpenModal = (entry = null) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const handleSave = async (data) => {
    try {
      if (editingEntry) {
        await chatbotAPI.updateKnowledgeBaseEntry(editingEntry.id, data);
        toast.success('Bejegyzés frissítve');
      } else {
        await chatbotAPI.createKnowledgeBaseEntry(data);
        toast.success('Bejegyzés létrehozva');
      }
      fetchEntries();
    } catch (error) {
      toast.error('Hiba a mentés közben');
      throw error;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Biztosan törli ezt a bejegyzést?')) return;
    try {
      await chatbotAPI.deleteKnowledgeBaseEntry(id);
      toast.success('Bejegyzés törölve');
      setSelected((prev) => prev.filter((s) => s !== id));
      fetchEntries();
    } catch (error) {
      toast.error('Hiba a törlés közben');
    }
  };

  const handleToggleActive = async (entry) => {
    try {
      await chatbotAPI.updateKnowledgeBaseEntry(entry.id, { is_active: !entry.is_active });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, is_active: !e.is_active } : e))
      );
    } catch (error) {
      toast.error('Hiba a státusz módosítása közben');
    }
  };

  // Selection
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelected(entries.map((e) => e.id));
    } else {
      setSelected([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  // Bulk actions
  const handleBulkAction = async (action, extraData = {}) => {
    if (selected.length === 0) return;
    const confirmMsg = {
      delete: `Biztosan törli a kiválasztott ${selected.length} bejegyzést?`,
      activate: `Aktiválja a kiválasztott ${selected.length} bejegyzést?`,
      deactivate: `Inaktiválja a kiválasztott ${selected.length} bejegyzést?`,
      change_category: `Módosítja a kiválasztott ${selected.length} bejegyzés kategóriáját?`,
    };
    if (!window.confirm(confirmMsg[action] || 'Végrehajtja a műveletet?')) return;

    try {
      await chatbotAPI.bulkActionKnowledgeBase(action, selected, extraData);
      toast.success(`Tömeges művelet végrehajtva: ${selected.length} bejegyzés`);
      setSelected([]);
      setBulkMenuAnchor(null);
      setBulkCategoryMenuAnchor(null);
      fetchEntries();
    } catch (error) {
      toast.error('Hiba a tömeges művelet közben');
    }
  };

  const getCategoryName = (catId) => {
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.name : '-';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Tudásbázis</Typography>
          <Typography variant="body2" color="text.secondary">
            Kezelje a GYIK kérdéseket és válaszokat
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<Refresh />} onClick={fetchEntries} disabled={loading}>
            Frissítés
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenModal()}>
            Új bejegyzés
          </Button>
        </Box>
      </Box>

      {/* Search & Filter Bar */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="Keresés kérdésben és válaszban..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
          sx={{ width: 300 }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Kategória szűrő</InputLabel>
          <Select value={categoryFilter} label="Kategória szűrő" onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">Összes kategória</MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>

        {/* Bulk Actions */}
        {selected.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto', alignItems: 'center' }}>
            <Chip label={`${selected.length} kiválasztva`} color="primary" size="small" />
            <Tooltip title="Tömeges törlés">
              <IconButton color="error" onClick={() => handleBulkAction('delete')}>
                <DeleteSweep />
              </IconButton>
            </Tooltip>
            <Tooltip title="Aktiválás">
              <IconButton color="success" onClick={() => handleBulkAction('activate')}>
                <ToggleOn />
              </IconButton>
            </Tooltip>
            <Tooltip title="Inaktiválás">
              <IconButton onClick={() => handleBulkAction('deactivate')}>
                <ToggleOff />
              </IconButton>
            </Tooltip>
            <Tooltip title="Kategória módosítása">
              <IconButton onClick={(e) => setBulkCategoryMenuAnchor(e.currentTarget)}>
                <CategoryIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={bulkCategoryMenuAnchor}
              open={Boolean(bulkCategoryMenuAnchor)}
              onClose={() => setBulkCategoryMenuAnchor(null)}
            >
              {categories.map((c) => (
                <MenuItem key={c.id} onClick={() => handleBulkAction('change_category', { category_id: c.id })}>
                  {c.name}
                </MenuItem>
              ))}
            </Menu>
          </Box>
        )}
      </Paper>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#2563eb' }} />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < entries.length}
                    checked={entries.length > 0 && selected.length === entries.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kérdés</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kulcsszavak</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Használat</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Státusz</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} hover selected={selected.includes(entry.id)} sx={{ '&:last-child td': { border: 0 } }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(entry.id)}
                      onChange={() => handleSelectOne(entry.id)}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 350 }}>
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                      {entry.question}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                      {entry.answer}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {entry.category_id ? (
                      <Chip
                        label={entry.category_name || getCategoryName(entry.category_id)}
                        size="small"
                        sx={{
                          bgcolor: categories.find((c) => c.id === entry.category_id)?.color + '20' || '#e3f2fd',
                          color: categories.find((c) => c.id === entry.category_id)?.color || '#1976d2',
                          fontWeight: 500,
                        }}
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {(entry.keywords || []).slice(0, 3).map((kw, i) => (
                        <Chip key={i} label={kw} size="small" variant="outlined" />
                      ))}
                      {(entry.keywords || []).length > 3 && (
                        <Chip label={`+${entry.keywords.length - 3}`} size="small" color="default" />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={entry.usage_count || 0}
                      size="small"
                      variant="outlined"
                      color={entry.usage_count > 10 ? 'success' : entry.usage_count > 0 ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={entry.is_active !== false}
                      onChange={() => handleToggleActive(entry)}
                      size="small"
                      color="success"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Szerkesztés">
                      <IconButton size="small" onClick={() => handleOpenModal(entry)}>
                        <Edit fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Törlés">
                      <IconButton size="small" color="error" onClick={() => handleDelete(entry.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {search || categoryFilter
                        ? 'Nincs találat a megadott szűrőkkel.'
                        : 'Nincs bejegyzés. Hozzon létre egyet az "Új bejegyzés" gombbal.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div" count={totalCount} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(e, p) => setPage(p)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="Sorok oldalanként:"
          />
        </TableContainer>
      )}

      <FAQEntryFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingEntry(null); }}
        onSave={handleSave}
        entry={editingEntry}
        categories={categories}
      />
    </Box>
  );
}
