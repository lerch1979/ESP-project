import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Button, TextField, IconButton, List, ListItem,
  ListItemButton, ListItemText, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Grid, Tooltip,
  CircularProgress, Chip, FormControlLabel, Switch, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';

const SEVERITY_OPTIONS = [
  { value: 'ok', label: 'Rendben' },
  { value: 'minor', label: 'Enyhe' },
  { value: 'major', label: 'Súlyos' },
  { value: 'critical', label: 'Kritikus' },
];

const emptyCategory = { name: '', code: '', weight: 1.0, is_active: true };
const emptyItem = {
  category_id: null,
  code: '',
  name: '',
  description: '',
  max_score: 10,
  weight: 1.0,
  is_active: true,
  default_severity: 'minor',
};

export default function InspectionTemplates() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  const [catModal, setCatModal] = useState(null);
  const [catForm, setCatForm] = useState(emptyCategory);
  const [itemModal, setItemModal] = useState(null);
  const [itemForm, setItemForm] = useState(emptyItem);

  const loadCategories = useCallback(async () => {
    setLoadingCats(true);
    try {
      const res = await inspectionsAPI.listCategories({ active: false });
      const list = res?.data || [];
      setCategories(list);
      if (list.length && !selectedCategoryId) {
        setSelectedCategoryId(list[0].id);
      }
    } catch {
      toast.error('Nem sikerült betölteni a kategóriákat');
    } finally {
      setLoadingCats(false);
    }
  }, [selectedCategoryId]);

  const loadItems = useCallback(async (catId) => {
    if (!catId) { setItems([]); return; }
    setLoadingItems(true);
    try {
      const res = await inspectionsAPI.listItems({ category_id: catId, active: false });
      setItems(res?.data || []);
    } catch {
      toast.error('Nem sikerült betölteni a tételeket');
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadItems(selectedCategoryId); }, [selectedCategoryId, loadItems]);

  // ─── Category CRUD ───
  const openCatCreate = () => { setCatForm(emptyCategory); setCatModal('create'); };
  const openCatEdit = (cat) => {
    setCatForm({
      name: cat.name || '', code: cat.code || '',
      weight: cat.weight ?? 1.0, is_active: cat.is_active ?? true,
      id: cat.id,
    });
    setCatModal('edit');
  };
  const saveCat = async () => {
    try {
      if (catModal === 'create') {
        await inspectionsAPI.createCategory(catForm);
        toast.success('Kategória létrehozva');
      } else {
        await inspectionsAPI.updateCategory(catForm.id, catForm);
        toast.success('Kategória frissítve');
      }
      setCatModal(null);
      loadCategories();
    } catch (e) {
      toast.error('Sikertelen mentés: ' + (e?.response?.data?.error || e.message));
    }
  };
  const deleteCat = async (cat) => {
    if (!window.confirm(`Biztosan törlöd a "${cat.name}" kategóriát?`)) return;
    try {
      await inspectionsAPI.deleteCategory(cat.id);
      toast.success('Kategória törölve');
      if (selectedCategoryId === cat.id) setSelectedCategoryId(null);
      loadCategories();
    } catch (e) {
      toast.error('Sikertelen törlés');
    }
  };

  // ─── Item CRUD ───
  const openItemCreate = () => {
    setItemForm({ ...emptyItem, category_id: selectedCategoryId });
    setItemModal('create');
  };
  const openItemEdit = (item) => {
    setItemForm({
      id: item.id,
      category_id: item.category_id ?? selectedCategoryId,
      code: item.code || '',
      name: item.name || '',
      description: item.description || '',
      max_score: item.max_score ?? 10,
      weight: item.weight ?? 1.0,
      is_active: item.is_active ?? true,
      default_severity: item.default_severity || 'minor',
    });
    setItemModal('edit');
  };
  const saveItem = async () => {
    try {
      if (itemModal === 'create') {
        await inspectionsAPI.createItem(itemForm);
        toast.success('Tétel létrehozva');
      } else {
        await inspectionsAPI.updateItem(itemForm.id, itemForm);
        toast.success('Tétel frissítve');
      }
      setItemModal(null);
      loadItems(selectedCategoryId);
    } catch (e) {
      toast.error('Sikertelen mentés: ' + (e?.response?.data?.error || e.message));
    }
  };
  const deleteItem = async (item) => {
    if (!window.confirm(`Biztosan törlöd a "${item.name}" tételt?`)) return;
    try {
      await inspectionsAPI.deleteItem(item.id);
      toast.success('Tétel törölve');
      loadItems(selectedCategoryId);
    } catch (e) {
      toast.error('Sikertelen törlés');
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Ellenőrzési sablonok</Typography>
        <IconButton onClick={() => { loadCategories(); loadItems(selectedCategoryId); }}><RefreshIcon /></IconButton>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Paper variant="outlined">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, borderBottom: '1px solid #e5e7eb' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Kategóriák</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={openCatCreate}>Új</Button>
            </Stack>
            {loadingCats ? (
              <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
            ) : categories.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">Nincs kategória</Typography>
              </Box>
            ) : (
              <List dense>
                {categories.map((cat) => (
                  <ListItem key={cat.id} disablePadding
                    secondaryAction={
                      <Stack direction="row">
                        <Tooltip title="Szerkesztés">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); openCatEdit(cat); }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Törlés">
                          <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); deleteCat(cat); }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    }
                  >
                    <ListItemButton selected={selectedCategoryId === cat.id} onClick={() => setSelectedCategoryId(cat.id)}>
                      <ListItemText
                        primary={cat.name}
                        secondary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="caption">{cat.code}</Typography>
                            {!cat.is_active && <Chip size="small" label="Inaktív" variant="outlined" />}
                          </Stack>
                        }
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper variant="outlined">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, borderBottom: '1px solid #e5e7eb' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Tételek {selectedCategoryId && categories.find((c) => c.id === selectedCategoryId)?.name
                  ? `— ${categories.find((c) => c.id === selectedCategoryId).name}`
                  : ''}
              </Typography>
              <Button size="small" startIcon={<AddIcon />} disabled={!selectedCategoryId} onClick={openItemCreate}>
                Új tétel
              </Button>
            </Stack>
            {loadingItems ? (
              <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
            ) : !selectedCategoryId ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">Válassz kategóriát a bal oldalról</Typography>
              </Box>
            ) : items.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">Nincs tétel</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, width: 110 }}>Kód</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Max pont</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Súly</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Aktív</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id} hover>
                        <TableCell><Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{it.code}</Typography></TableCell>
                        <TableCell>
                          <Typography variant="body2">{it.name}</Typography>
                          {it.description && (
                            <Typography variant="caption" color="text.secondary">{it.description}</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{it.max_score}</TableCell>
                        <TableCell align="right">{it.weight}</TableCell>
                        <TableCell>
                          {it.is_active ? <Chip size="small" color="success" label="Igen" /> : <Chip size="small" label="Nem" variant="outlined" />}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => openItemEdit(it)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => deleteItem(it)}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Category modal */}
      <Dialog open={Boolean(catModal)} onClose={() => setCatModal(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{catModal === 'create' ? 'Új kategória' : 'Kategória szerkesztése'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Név *" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} fullWidth size="small" />
            <TextField label="Kód" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value })} fullWidth size="small" />
            <TextField
              label="Súly" type="number" inputProps={{ step: 0.1, min: 0 }}
              value={catForm.weight} onChange={(e) => setCatForm({ ...catForm, weight: Number(e.target.value) })}
              fullWidth size="small"
            />
            <FormControlLabel
              control={<Switch checked={catForm.is_active} onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })} />}
              label="Aktív"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCatModal(null)}>Mégse</Button>
          <Button onClick={saveCat} variant="contained">Mentés</Button>
        </DialogActions>
      </Dialog>

      {/* Item modal */}
      <Dialog open={Boolean(itemModal)} onClose={() => setItemModal(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{itemModal === 'create' ? 'Új tétel' : 'Tétel szerkesztése'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Kód *" value={itemForm.code} onChange={(e) => setItemForm({ ...itemForm, code: e.target.value })} fullWidth size="small" />
            <TextField label="Név *" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} fullWidth size="small" />
            <TextField
              label="Leírás" value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              fullWidth size="small" multiline rows={2}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Max pontszám" type="number" inputProps={{ step: 0.5, min: 0 }}
                value={itemForm.max_score}
                onChange={(e) => setItemForm({ ...itemForm, max_score: Number(e.target.value) })}
                fullWidth size="small"
              />
              <TextField
                label="Súly" type="number" inputProps={{ step: 0.1, min: 0 }}
                value={itemForm.weight}
                onChange={(e) => setItemForm({ ...itemForm, weight: Number(e.target.value) })}
                fullWidth size="small"
              />
            </Stack>
            <FormControl fullWidth size="small">
              <InputLabel>Alapértelmezett súlyosság</InputLabel>
              <Select
                label="Alapértelmezett súlyosság"
                value={itemForm.default_severity || 'minor'}
                onChange={(e) => setItemForm({ ...itemForm, default_severity: e.target.value })}
              >
                {SEVERITY_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={itemForm.is_active} onChange={(e) => setItemForm({ ...itemForm, is_active: e.target.checked })} />}
              label="Aktív"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemModal(null)}>Mégse</Button>
          <Button onClick={saveItem} variant="contained">Mentés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
