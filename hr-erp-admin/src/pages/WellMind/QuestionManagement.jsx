import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip, Button, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, Alert, CircularProgress, Tooltip
} from '@mui/material';
import { Add, Edit, Delete, Quiz } from '@mui/icons-material';
import { wellmindAPI } from '../../services/api';
import { toast } from 'react-toastify';

const EMPTY_FORM = { question_type: 'pulse', question_text: '', question_text_en: '', response_type: 'scale_1_10', category: '', display_order: 0, is_active: true };

const QuestionManagement = () => {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [filter, setFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    try {
      setLoading(true);
      const response = await wellmindAPI.getQuestions(filter || undefined);
      setQuestions(response.data || []);
    } catch (err) {
      toast.error('Nem sikerült betölteni a kérdéseket');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const openEdit = (q) => {
    setEditId(q.id);
    setForm({ question_type: q.question_type, question_text: q.question_text, question_text_en: q.question_text_en || '', response_type: q.response_type, category: q.category || '', display_order: q.display_order || 0, is_active: q.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.question_text || !form.category) { toast.warning('Kérdés szövege és kategória kötelező'); return; }
    try {
      setSaving(true);
      if (editId) {
        await wellmindAPI.updateQuestion(editId, form);
        toast.success('Kérdés frissítve');
      } else {
        await wellmindAPI.createQuestion(form);
        toast.success('Kérdés létrehozva');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Hiba történt');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Biztosan törölni szeretnéd?')) return;
    try {
      await wellmindAPI.deleteQuestion(id);
      toast.success('Kérdés törölve/deaktiválva');
      load();
    } catch (err) {
      toast.error('Nem sikerült törölni');
    }
  };

  const typeLabel = (t) => t === 'pulse' ? 'Pulse' : 'Értékelés';
  const typeColor = (t) => t === 'pulse' ? 'primary' : 'secondary';
  const responseLabel = (r) => ({ scale_1_10: '1-10 skála', emoji_5: 'Emoji (1-5)', yes_no: 'Igen/Nem', text: 'Szöveges' }[r] || r);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          <Quiz sx={{ mr: 1, verticalAlign: 'middle' }} />
          Kérdések kezelése
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Típus szűrő</InputLabel>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} label="Típus szűrő">
              <MenuItem value="">Mind</MenuItem>
              <MenuItem value="pulse">Pulse</MenuItem>
              <MenuItem value="assessment">Értékelés</MenuItem>
            </Select>
          </FormControl>
          <Button startIcon={<Add />} variant="contained" onClick={openCreate}>Új kérdés</Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kérdés</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Válasz típus</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Sorrend</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Aktív</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {questions.map((q) => (
                <TableRow key={q.id} hover sx={{ opacity: q.is_active ? 1 : 0.5 }}>
                  <TableCell><Chip label={typeLabel(q.question_type)} color={typeColor(q.question_type)} size="small" /></TableCell>
                  <TableCell sx={{ maxWidth: 400 }}>
                    <Typography variant="body2" noWrap>{q.question_text}</Typography>
                    {q.question_text_en && <Typography variant="caption" color="text.secondary" noWrap>{q.question_text_en}</Typography>}
                  </TableCell>
                  <TableCell><Chip label={q.category} size="small" variant="outlined" /></TableCell>
                  <TableCell>{responseLabel(q.response_type)}</TableCell>
                  <TableCell>{q.display_order}</TableCell>
                  <TableCell><Chip label={q.is_active ? 'Aktív' : 'Inaktív'} color={q.is_active ? 'success' : 'default'} size="small" /></TableCell>
                  <TableCell align="right">
                    <Tooltip title="Szerkesztés"><IconButton size="small" onClick={() => openEdit(q)}><Edit fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Törlés"><IconButton size="small" color="error" onClick={() => handleDelete(q.id)}><Delete fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Kérdés szerkesztése' : 'Új kérdés'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl fullWidth>
            <InputLabel>Típus</InputLabel>
            <Select value={form.question_type} onChange={(e) => setForm(f => ({ ...f, question_type: e.target.value }))} label="Típus">
              <MenuItem value="pulse">Pulse (napi)</MenuItem>
              <MenuItem value="assessment">Értékelés (negyedéves)</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Kérdés (HU)" value={form.question_text} onChange={(e) => setForm(f => ({ ...f, question_text: e.target.value }))} multiline rows={2} required />
          <TextField label="Kérdés (EN)" value={form.question_text_en} onChange={(e) => setForm(f => ({ ...f, question_text_en: e.target.value }))} multiline rows={2} />
          <FormControl fullWidth>
            <InputLabel>Válasz típus</InputLabel>
            <Select value={form.response_type} onChange={(e) => setForm(f => ({ ...f, response_type: e.target.value }))} label="Válasz típus">
              <MenuItem value="scale_1_10">1-10 skála</MenuItem>
              <MenuItem value="emoji_5">Emoji (1-5)</MenuItem>
              <MenuItem value="yes_no">Igen/Nem</MenuItem>
              <MenuItem value="text">Szöveges</MenuItem>
            </Select>
          </FormControl>
          <TextField label="Kategória" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} placeholder="mood, stress, burnout, vigor..." required />
          <TextField label="Megjelenési sorrend" type="number" value={form.display_order} onChange={(e) => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
          {editId && (
            <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} />} label="Aktív" />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Mégse</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QuestionManagement;
