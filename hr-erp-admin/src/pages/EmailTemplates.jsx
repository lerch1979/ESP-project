import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Grid,
  Tab,
  Tabs,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Description as DescriptionIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { toast } from 'react-toastify';
import { notificationsAPI } from '../services/api';
import Layout from '../components/Layout';

const EVENT_TYPES = [
  { value: 'contract_expiry', label: 'Szerződés lejárat' },
  { value: 'visa_expiry', label: 'Vízum lejárat' },
  { value: 'accommodation_survey', label: 'Szállás felmérés' },
  { value: 'general', label: 'Általános' },
  { value: 'custom', label: 'Egyéni' },
];

const STANDARD_VARIABLES = ['name', 'workplace', 'accommodation', 'visa_expiry', 'contract_end', 'subject', 'body'];

const SAMPLE_VARIABLES = {
  name: 'Teszt Felhasználó',
  workplace: 'Budapest - Központi iroda',
  accommodation: 'Lakás A1',
  visa_expiry: '2026-06-30',
  contract_end: '2026-12-31',
  subject: 'Teszt tárgy',
  body: 'Ez egy minta üzenet a sablon előnézetéhez.',
};

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link', 'image'],
    ['clean'],
  ],
};

const emptyTemplate = {
  name: '',
  slug: '',
  subject: '',
  body_html: '',
  body_text: '',
  event_type: 'custom',
  available_variables: [],
  is_active: true,
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/[ű]/g, 'u')
    .replace(/[ő]/g, 'o')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [form, setForm] = useState({ ...emptyTemplate });
  const [dialogTab, setDialogTab] = useState(0);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customVar, setCustomVar] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const quillRef = useRef(null);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await notificationsAPI.getTemplates();
      setTemplates(res.data || []);
    } catch (error) {
      toast.error('Hiba a sablonok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setForm({ ...emptyTemplate });
    setDialogTab(0);
    setPreviewHtml('');
    setDialogOpen(true);
  };

  const handleOpenEdit = async (template) => {
    setEditingTemplate(template);
    setForm({
      name: template.name || '',
      slug: template.slug || '',
      subject: template.subject || '',
      body_html: template.body_html || '',
      body_text: template.body_text || '',
      event_type: template.event_type || 'custom',
      available_variables: template.available_variables || [],
      is_active: template.is_active !== false,
    });
    setDialogTab(0);
    setPreviewHtml('');
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    setForm({ ...emptyTemplate });
  };

  const handleNameChange = (e) => {
    const name = e.target.value;
    setForm((prev) => ({
      ...prev,
      name,
      slug: editingTemplate ? prev.slug : slugify(name),
    }));
  };

  const handleSave = async () => {
    if (!form.name || !form.slug || !form.subject) {
      toast.error('Név, slug és tárgy kötelező');
      return;
    }
    try {
      setSaving(true);
      if (editingTemplate) {
        await notificationsAPI.updateTemplate(editingTemplate.id, form);
        toast.success('Sablon frissítve');
      } else {
        await notificationsAPI.createTemplate(form);
        toast.success('Sablon létrehozva');
      }
      handleClose();
      loadTemplates();
    } catch (error) {
      const msg = error.response?.data?.message || 'Hiba a mentéskor';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsAPI.deleteTemplate(id);
      toast.success('Sablon törölve');
      setDeleteConfirm(null);
      loadTemplates();
    } catch (error) {
      toast.error('Hiba a törléskor');
    }
  };

  const handlePreview = async () => {
    setDialogTab(1);
    setPreviewLoading(true);
    try {
      const vars = {};
      (form.available_variables || []).forEach((v) => {
        vars[v] = SAMPLE_VARIABLES[v] || `[${v}]`;
      });
      const res = await notificationsAPI.previewTemplate(form.body_html, vars);
      setPreviewHtml(res.data?.html || form.body_html);
    } catch {
      setPreviewHtml(form.body_html);
    } finally {
      setPreviewLoading(false);
    }
  };

  const insertVariable = (varName) => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      const range = editor.getSelection(true);
      editor.insertText(range.index, `{{${varName}}}`);
      editor.setSelection(range.index + varName.length + 4);
    }
  };

  const addCustomVariable = () => {
    const v = customVar.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!v) return;
    if (!form.available_variables.includes(v)) {
      setForm((prev) => ({
        ...prev,
        available_variables: [...prev.available_variables, v],
      }));
    }
    setCustomVar('');
  };

  const removeVariable = (varName) => {
    setForm((prev) => ({
      ...prev,
      available_variables: prev.available_variables.filter((v) => v !== varName),
    }));
  };

  const toggleVariable = (varName) => {
    if (form.available_variables.includes(varName)) {
      removeVariable(varName);
    } else {
      setForm((prev) => ({
        ...prev,
        available_variables: [...prev.available_variables, varName],
      }));
    }
  };

  return (
    <Layout>
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DescriptionIcon sx={{ fontSize: 28, color: '#2c5f2d' }} />
            <Typography variant="h5" fontWeight={700}>
              Email sablonok
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate} sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#1e3f1f' } }}>
            Új sablon
          </Button>
        </Box>

        {/* Table */}
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Slug</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Esemény típus</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Aktív</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Műveletek</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nincsenek sablonok
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>
                      <Chip label={t.slug} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      {EVENT_TYPES.find((et) => et.value === t.event_type)?.label || t.event_type}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={t.is_active ? 'Aktív' : 'Inaktív'}
                        size="small"
                        color={t.is_active ? 'success' : 'error'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Szerkesztés">
                        <IconButton size="small" onClick={() => handleOpenEdit(t)} color="primary">
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Törlés">
                        <IconButton size="small" onClick={() => setDeleteConfirm(t.id)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Delete confirmation dialog */}
        <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
          <DialogTitle>Sablon törlése</DialogTitle>
          <DialogContent>
            <Typography>Biztosan törölni szeretnéd ezt a sablont? Ez a művelet nem vonható vissza.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirm(null)}>Mégse</Button>
            <Button onClick={() => handleDelete(deleteConfirm)} color="error" variant="contained">
              Törlés
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit/Create Dialog */}
        <Dialog open={dialogOpen} onClose={handleClose} fullWidth maxWidth="lg">
          <DialogTitle>
            {editingTemplate ? 'Sablon szerkesztése' : 'Új sablon létrehozása'}
          </DialogTitle>
          <DialogContent dividers>
            <Tabs value={dialogTab} onChange={(_, v) => (v === 1 ? handlePreview() : setDialogTab(v))} sx={{ mb: 2 }}>
              <Tab label="Szerkesztés" />
              <Tab label="Előnézet" />
            </Tabs>

            {dialogTab === 0 && (
              <Grid container spacing={2}>
                {/* Left side: Form */}
                <Grid item xs={12} md={7}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      label="Név"
                      value={form.name}
                      onChange={handleNameChange}
                      fullWidth
                      required
                      size="small"
                    />
                    <TextField
                      label="Slug"
                      value={form.slug}
                      onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                      fullWidth
                      required
                      size="small"
                      helperText="Egyedi azonosító (automatikusan generálva a névből)"
                    />
                    <TextField
                      label="Tárgy"
                      value={form.subject}
                      onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                      fullWidth
                      required
                      size="small"
                    />
                    <FormControl fullWidth size="small">
                      <InputLabel>Esemény típus</InputLabel>
                      <Select
                        value={form.event_type}
                        label="Esemény típus"
                        onChange={(e) => setForm((prev) => ({ ...prev, event_type: e.target.value }))}
                      >
                        {EVENT_TYPES.map((et) => (
                          <MenuItem key={et.value} value={et.value}>
                            {et.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.is_active}
                          onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                          color="success"
                        />
                      }
                      label="Aktív"
                    />
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        HTML tartalom
                      </Typography>
                      <ReactQuill
                        ref={quillRef}
                        theme="snow"
                        value={form.body_html}
                        onChange={(value) => setForm((prev) => ({ ...prev, body_html: value }))}
                        modules={QUILL_MODULES}
                        style={{ minHeight: 200 }}
                      />
                    </Box>
                    <TextField
                      label="Szöveges tartalom (fallback)"
                      value={form.body_text}
                      onChange={(e) => setForm((prev) => ({ ...prev, body_text: e.target.value }))}
                      fullWidth
                      multiline
                      rows={3}
                      size="small"
                      helperText="Egyszerű szöveges verzió email kliensek számára amelyek nem támogatják a HTML-t"
                    />
                  </Box>
                </Grid>

                {/* Right side: Variable palette */}
                <Grid item xs={12} md={5}>
                  <Paper sx={{ p: 2, bgcolor: '#f8fafc', height: '100%' }}>
                    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                      Elérhető változók
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Kattints egy változóra a beszúráshoz a szerkesztőbe, vagy jelöld ki/töröld a sablonhoz tartozó változókat.
                    </Typography>

                    <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                      Standard változók
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                      {STANDARD_VARIABLES.map((v) => (
                        <Chip
                          key={v}
                          label={`{{${v}}}`}
                          size="small"
                          variant={form.available_variables.includes(v) ? 'filled' : 'outlined'}
                          color={form.available_variables.includes(v) ? 'primary' : 'default'}
                          onClick={() => insertVariable(v)}
                          onDelete={() => toggleVariable(v)}
                          deleteIcon={
                            form.available_variables.includes(v) ? (
                              <DeleteIcon fontSize="small" />
                            ) : (
                              <AddIcon fontSize="small" />
                            )
                          }
                          sx={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Box>

                    {/* Custom variables from the template */}
                    {form.available_variables.filter((v) => !STANDARD_VARIABLES.includes(v)).length > 0 && (
                      <>
                        <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                          Egyéni változók
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                          {form.available_variables
                            .filter((v) => !STANDARD_VARIABLES.includes(v))
                            .map((v) => (
                              <Chip
                                key={v}
                                label={`{{${v}}}`}
                                size="small"
                                color="secondary"
                                onClick={() => insertVariable(v)}
                                onDelete={() => removeVariable(v)}
                                sx={{ cursor: 'pointer' }}
                              />
                            ))}
                        </Box>
                      </>
                    )}

                    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                      <TextField
                        size="small"
                        placeholder="Új változó neve"
                        value={customVar}
                        onChange={(e) => setCustomVar(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCustomVariable()}
                        sx={{ flex: 1 }}
                      />
                      <Button size="small" variant="outlined" onClick={addCustomVariable}>
                        Hozzáadás
                      </Button>
                    </Box>

                    <Box sx={{ mt: 3, p: 1.5, bgcolor: '#fff', borderRadius: 1, border: '1px solid #e0e0e0' }}>
                      <Typography variant="caption" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <CopyIcon fontSize="small" /> Tipp
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        A {'{{változó}}'} szintaxissal dinamikus tartalmat szúrhatsz be. A változók értékei az email küldésekor automatikusan kitöltődnek a címzett adataival.
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
              </Grid>
            )}

            {dialogTab === 1 && (
              <Box>
                {previewLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress />
                  </Box>
                ) : (
                  <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, overflow: 'hidden' }}>
                    <Box sx={{ bgcolor: '#f5f5f5', px: 2, py: 1, borderBottom: '1px solid #e0e0e0' }}>
                      <Typography variant="body2">
                        <strong>Tárgy:</strong> {form.subject}
                      </Typography>
                    </Box>
                    <iframe
                      title="Email előnézet"
                      srcDoc={previewHtml}
                      style={{ width: '100%', minHeight: 400, border: 'none' }}
                      sandbox="allow-same-origin"
                    />
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Mégse</Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#1e3f1f' } }}
            >
              {saving ? <CircularProgress size={20} /> : editingTemplate ? 'Mentés' : 'Létrehozás'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}

export default EmailTemplates;
