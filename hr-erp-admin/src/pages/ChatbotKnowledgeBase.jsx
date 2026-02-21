import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, IconButton, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel, InputAdornment,
} from '@mui/material';
import { Add, Edit, Delete, Search } from '@mui/icons-material';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

export default function ChatbotKnowledgeBase() {
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
  const [formData, setFormData] = useState({
    question: '', answer: '', keywords: '', category_id: '', priority: 0, is_active: true,
  });

  const fetchEntries = async () => {
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
  };

  const fetchCategories = async () => {
    try {
      const response = await chatbotAPI.adminGetFaqCategories();
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  useEffect(() => { fetchCategories(); }, []);
  useEffect(() => { fetchEntries(); }, [page, rowsPerPage, search, categoryFilter]);

  const handleOpenModal = (entry = null) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        question: entry.question,
        answer: entry.answer,
        keywords: (entry.keywords || []).join(', '),
        category_id: entry.category_id || '',
        priority: entry.priority || 0,
        is_active: entry.is_active !== false,
      });
    } else {
      setEditingEntry(null);
      setFormData({ question: '', answer: '', keywords: '', category_id: '', priority: 0, is_active: true });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        question: formData.question,
        answer: formData.answer,
        keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
        category_id: formData.category_id || null,
        priority: parseInt(formData.priority) || 0,
        is_active: formData.is_active,
      };

      if (editingEntry) {
        await chatbotAPI.updateKnowledgeBaseEntry(editingEntry.id, data);
        toast.success('Bejegyzés frissítve');
      } else {
        await chatbotAPI.createKnowledgeBaseEntry(data);
        toast.success('Bejegyzés létrehozva');
      }
      setModalOpen(false);
      fetchEntries();
    } catch (error) {
      toast.error('Hiba a mentés közben');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Biztosan törli ezt a bejegyzést?')) return;
    try {
      await chatbotAPI.deleteKnowledgeBaseEntry(id);
      toast.success('Bejegyzés törölve');
      fetchEntries();
    } catch (error) {
      toast.error('Hiba a törlés közben');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Tudásbázis</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenModal()}>
          Új bejegyzés
        </Button>
      </Box>

      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Keresés..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
          sx={{ width: 300 }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Kategória</InputLabel>
          <Select value={categoryFilter} label="Kategória" onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">Összes</MenuItem>
            {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Kérdés</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Válasz</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Kulcsszavak</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Használat</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Státusz</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Műveletek</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id} hover>
                <TableCell sx={{ maxWidth: 250 }}>
                  <Typography variant="body2" noWrap>{entry.question}</Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 250 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>{entry.answer}</Typography>
                </TableCell>
                <TableCell>{entry.category_name || '-'}</TableCell>
                <TableCell sx={{ maxWidth: 200 }}>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {(entry.keywords || []).slice(0, 3).map((kw, i) => (
                      <Chip key={i} label={kw} size="small" variant="outlined" />
                    ))}
                    {(entry.keywords || []).length > 3 && <Chip label={`+${entry.keywords.length - 3}`} size="small" />}
                  </Box>
                </TableCell>
                <TableCell align="center">{entry.usage_count || 0}</TableCell>
                <TableCell align="center">
                  <Chip label={entry.is_active ? 'Aktív' : 'Inaktív'} size="small"
                    color={entry.is_active ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleOpenModal(entry)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(entry.id)}><Delete fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && !loading && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}>Nincs találat</TableCell></TableRow>
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

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingEntry ? 'Bejegyzés szerkesztése' : 'Új bejegyzés'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Kérdés" required multiline rows={2} value={formData.question}
            onChange={(e) => setFormData(p => ({ ...p, question: e.target.value }))} />
          <TextField label="Válasz" required multiline rows={4} value={formData.answer}
            onChange={(e) => setFormData(p => ({ ...p, answer: e.target.value }))} />
          <FormControl fullWidth>
            <InputLabel>Kategória</InputLabel>
            <Select value={formData.category_id} label="Kategória"
              onChange={(e) => setFormData(p => ({ ...p, category_id: e.target.value }))}>
              <MenuItem value="">Nincs</MenuItem>
              {categories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Kulcsszavak (vesszővel elválasztva)" value={formData.keywords}
            onChange={(e) => setFormData(p => ({ ...p, keywords: e.target.value }))}
            helperText="Pl: szabadság, pihenőnap, holiday" />
          <TextField label="Prioritás" type="number" value={formData.priority}
            onChange={(e) => setFormData(p => ({ ...p, priority: e.target.value }))} />
          <FormControlLabel control={
            <Switch checked={formData.is_active} onChange={(e) => setFormData(p => ({ ...p, is_active: e.target.checked }))} />
          } label="Aktív" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={handleSave} disabled={!formData.question || !formData.answer}>Mentés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
