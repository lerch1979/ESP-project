import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TablePagination,
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
  InputAdornment,
  Stack,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Email as EmailIcon,
  ContentCopy as CopyIcon,
  Search as SearchIcon,
  Visibility as PreviewIcon,
  FileCopy as DuplicateIcon,
  Close as CloseIcon,
  Code as CodeIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { emailTemplatesAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

// ─── Constants ────────────────────────────────────────────────────────────────

const TEMPLATE_TYPES = [
  { value: 'welcome', label: 'Üdvözlő', color: '#10b981' },
  { value: 'ticket_created', label: 'Hibajegy létrehozva', color: '#3b82f6' },
  { value: 'ticket_status_changed', label: 'Hibajegy státusz', color: '#6366f1' },
  { value: 'password_reset', label: 'Jelszó visszaállítás', color: '#f59e0b' },
  { value: 'accommodation_assigned', label: 'Szállás hozzárendelés', color: '#8b5cf6' },
  { value: 'document_uploaded', label: 'Dokumentum feltöltés', color: '#14b8a6' },
  { value: 'employment_terminated', label: 'Munkaviszony megszűnés', color: '#ef4444' },
  { value: 'leave_approved', label: 'Szabadság jóváhagyás', color: '#f97316' },
  { value: 'custom', label: 'Egyéni', color: '#64748b' },
];

const SAMPLE_VARIABLES = {
  employee_name: 'Teszt Felhasználó',
  employee_email: 'teszt@example.com',
  employee_number: 'EMP-0042',
  company_name: 'ABC Kereskedelmi Kft.',
  start_date: '2026-03-01',
  position: 'Gépkezelő',
  workplace: 'Budapest - Váci út irodaház',
  ticket_number: '#1234',
  ticket_title: 'Csőtörés az A épületben',
  category: 'Technikai',
  priority: 'Sürgős',
  description: 'Ez egy minta leírás a teszteléshez.',
  old_status: 'Új',
  new_status: 'Folyamatban',
  comment: 'Foglalkozunk a problémával.',
  reset_link: 'https://app.example.com/reset/abc123',
  expiry_hours: '24',
  accommodation_name: 'A épület',
  accommodation_address: '1138 Budapest, Váci út 15.',
  room_number: '101',
  check_in_date: '2026-03-01',
  document_type: 'Útlevél',
  file_name: 'passport_scan.pdf',
  uploaded_by: 'Kiss János',
  upload_date: '2026-02-23',
  end_date: '2026-06-30',
  settlement_date: '2026-07-15',
  leave_start: '2026-04-01',
  leave_end: '2026-04-05',
  leave_type: 'Fizetett szabadság',
  approved_by: 'Kiss János',
};

const emptyForm = {
  name: '',
  slug: '',
  subject: '',
  body: '',
  template_type: 'custom',
  variables: [],
  is_active: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôöő]/g, 'o')
    .replace(/[úùûüű]/g, 'u')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function getTypeInfo(typeValue) {
  return TEMPLATE_TYPES.find((t) => t.value === typeValue) || { label: typeValue, color: '#64748b' };
}

// ─── Component ────────────────────────────────────────────────────────────────

function EmailTemplates() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('settings.edit') || hasPermission('employees.create');

  // List state
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const searchTimeout = useRef(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState(0);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [customVar, setCustomVar] = useState('');

  // Preview state
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Duplicate dialog
  const [duplicateDialog, setDuplicateDialog] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateSlug, setDuplicateSlug] = useState('');
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };
      if (search) params.search = search;
      if (filterType) params.template_type = filterType;
      if (filterActive) params.is_active = filterActive;

      const res = await emailTemplatesAPI.getAll(params);
      setTemplates(res.data?.templates || []);
      setTotalCount(res.data?.pagination?.total || 0);
    } catch (error) {
      toast.error('Hiba a sablonok betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, filterType, filterActive]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Debounced search
  const handleSearchChange = (e) => {
    const value = e.target.value;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearch(value);
      setPage(0);
    }, 400);
  };

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setForm({ ...emptyForm });
    setDialogTab(0);
    setPreviewData(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (template) => {
    setEditingTemplate(template);
    setForm({
      name: template.name || '',
      slug: template.slug || '',
      subject: template.subject || '',
      body: template.body || '',
      template_type: template.template_type || 'custom',
      variables: template.variables || [],
      is_active: template.is_active !== false,
    });
    setDialogTab(0);
    setPreviewData(null);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    setForm({ ...emptyForm });
    setPreviewData(null);
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
    if (!form.name.trim()) {
      toast.error('A sablon neve kötelező');
      return;
    }
    if (!form.slug.trim()) {
      toast.error('A slug kötelező');
      return;
    }
    if (!form.subject.trim()) {
      toast.error('Az email tárgy kötelező');
      return;
    }
    if (!form.body.trim()) {
      toast.error('Az email törzs kötelező');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        subject: form.subject.trim(),
        body: form.body.trim(),
        template_type: form.template_type,
        variables: form.variables,
        is_active: form.is_active,
      };

      if (editingTemplate) {
        await emailTemplatesAPI.update(editingTemplate.id, payload);
        toast.success('Sablon sikeresen frissítve');
      } else {
        await emailTemplatesAPI.create(payload);
        toast.success('Sablon sikeresen létrehozva');
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
      setDeleteLoading(true);
      await emailTemplatesAPI.delete(id);
      toast.success('Sablon sikeresen törölve');
      setDeleteConfirm(null);
      loadTemplates();
    } catch (error) {
      toast.error('Hiba a törléskor');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!editingTemplate?.id && !form.body) {
      setDialogTab(1);
      return;
    }

    setDialogTab(1);
    setPreviewLoading(true);

    try {
      // Build sample variables for preview
      const vars = {};
      (form.variables || []).forEach((v) => {
        vars[v] = SAMPLE_VARIABLES[v] || `[${v}]`;
      });

      if (editingTemplate?.id) {
        const res = await emailTemplatesAPI.preview(editingTemplate.id, vars);
        setPreviewData(res.data);
      } else {
        // For new templates, do client-side preview
        let subject = form.subject;
        let body = form.body;
        for (const [key, value] of Object.entries(vars)) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          subject = subject.replace(regex, value);
          body = body.replace(regex, value);
        }
        setPreviewData({ subject, body, unresolved_variables: [] });
      }
    } catch {
      // Fallback: show raw template
      setPreviewData({ subject: form.subject, body: form.body, unresolved_variables: [] });
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Duplicate ─────────────────────────────────────────────────────────────

  const handleOpenDuplicate = (template) => {
    setDuplicateDialog(template);
    setDuplicateName(`${template.name} (másolat)`);
    setDuplicateSlug(`${template.slug}_copy`);
  };

  const handleDuplicate = async () => {
    if (!duplicateName.trim() || !duplicateSlug.trim()) {
      toast.error('Név és slug kötelező');
      return;
    }
    try {
      setDuplicateLoading(true);
      await emailTemplatesAPI.duplicate(duplicateDialog.id, {
        name: duplicateName.trim(),
        slug: duplicateSlug.trim(),
      });
      toast.success('Sablon sikeresen duplikálva');
      setDuplicateDialog(null);
      loadTemplates();
    } catch (error) {
      const msg = error.response?.data?.message || 'Hiba a duplikáláskor';
      toast.error(msg);
    } finally {
      setDuplicateLoading(false);
    }
  };

  // ── Variable management ───────────────────────────────────────────────────

  const insertVariable = (varName) => {
    // Insert variable at cursor in body textarea
    const tag = `{{${varName}}}`;
    setForm((prev) => ({
      ...prev,
      body: prev.body + tag,
    }));
  };

  const addCustomVariable = () => {
    const v = customVar.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!v) return;
    if (!form.variables.includes(v)) {
      setForm((prev) => ({
        ...prev,
        variables: [...prev.variables, v],
      }));
    }
    setCustomVar('');
  };

  const removeVariable = (varName) => {
    setForm((prev) => ({
      ...prev,
      variables: prev.variables.filter((v) => v !== varName),
    }));
  };

  const toggleVariable = (varName) => {
    if (form.variables.includes(varName)) {
      removeVariable(varName);
    } else {
      setForm((prev) => ({
        ...prev,
        variables: [...prev.variables, varName],
      }));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <Box>
        {/* ── Header ── */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            mb: 3,
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmailIcon sx={{ fontSize: 28, color: '#2563eb' }} />
            <Typography variant="h5" fontWeight={700}>
              Email sablonok
            </Typography>
            <Chip label={`${totalCount} sablon`} size="small" sx={{ ml: 1 }} />
          </Box>
          {canEdit && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenCreate}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              Új sablon
            </Button>
          )}
        </Box>

        {/* ── Filters ── */}
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ sm: 'center' }}
          >
            <TextField
              placeholder="Keresés név, slug vagy tárgy alapján..."
              size="small"
              onChange={handleSearchChange}
              sx={{ minWidth: 280 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Típus</InputLabel>
              <Select
                value={filterType}
                label="Típus"
                onChange={(e) => {
                  setFilterType(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">Összes típus</MenuItem>
                {TEMPLATE_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Státusz</InputLabel>
              <Select
                value={filterActive}
                label="Státusz"
                onChange={(e) => {
                  setFilterActive(e.target.value);
                  setPage(0);
                }}
              >
                <MenuItem value="">Összes</MenuItem>
                <MenuItem value="true">Aktív</MenuItem>
                <MenuItem value="false">Inaktív</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>

        {/* ── Table ── */}
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Slug</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', md: 'table-cell' } }}>
                  Tárgy
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: 'none', sm: 'table-cell' } }}>
                  Változók
                </TableCell>
                {canEdit && (
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Műveletek
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <EmailIcon sx={{ fontSize: 48, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="body1" color="text.secondary">
                      Nincsenek email sablonok
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {search || filterType
                        ? 'Próbálj más keresési feltételt.'
                        : 'Hozz létre egy új sablont a kezdéshez.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => {
                  const typeInfo = getTypeInfo(t.template_type);
                  return (
                    <TableRow key={t.id} hover sx={{ cursor: canEdit ? 'pointer' : 'default' }}>
                      <TableCell onClick={() => canEdit && handleOpenEdit(t)}>
                        <Typography variant="body2" fontWeight={600}>
                          {t.name}
                        </Typography>
                      </TableCell>
                      <TableCell onClick={() => canEdit && handleOpenEdit(t)}>
                        <Chip
                          label={t.slug}
                          size="small"
                          variant="outlined"
                          icon={<CodeIcon sx={{ fontSize: 14 }} />}
                          sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell
                        sx={{ display: { xs: 'none', md: 'table-cell' }, maxWidth: 250 }}
                        onClick={() => canEdit && handleOpenEdit(t)}
                      >
                        <Typography variant="body2" noWrap title={t.subject}>
                          {t.subject}
                        </Typography>
                      </TableCell>
                      <TableCell onClick={() => canEdit && handleOpenEdit(t)}>
                        <Chip
                          label={typeInfo.label}
                          size="small"
                          sx={{
                            bgcolor: `${typeInfo.color}15`,
                            color: typeInfo.color,
                            fontWeight: 500,
                            border: `1px solid ${typeInfo.color}30`,
                          }}
                        />
                      </TableCell>
                      <TableCell onClick={() => canEdit && handleOpenEdit(t)}>
                        <Chip
                          icon={t.is_active ? <ActiveIcon /> : <InactiveIcon />}
                          label={t.is_active ? 'Aktív' : 'Inaktív'}
                          size="small"
                          color={t.is_active ? 'success' : 'default'}
                          variant={t.is_active ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        <Typography variant="caption" color="text.secondary">
                          {Array.isArray(t.variables) ? t.variables.length : 0} db
                        </Typography>
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Tooltip title="Szerkesztés">
                            <IconButton size="small" onClick={() => handleOpenEdit(t)} color="primary">
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Duplikálás">
                            <IconButton size="small" onClick={() => handleOpenDuplicate(t)} sx={{ color: '#8b5cf6' }}>
                              <DuplicateIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Törlés">
                            <IconButton size="small" onClick={() => setDeleteConfirm(t)} color="error">
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="Sorok/oldal:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
          />
        </TableContainer>

        {/* ── Delete Confirmation Dialog ── */}
        <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Sablon törlése</DialogTitle>
          <DialogContent>
            <Typography>
              Biztosan törölni szeretnéd a <strong>{deleteConfirm?.name}</strong> sablont?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              A sablon inaktiválásra kerül (nem véglegesen törlődik).
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>
              Mégse
            </Button>
            <Button
              onClick={() => handleDelete(deleteConfirm?.id)}
              color="error"
              variant="contained"
              disabled={deleteLoading}
            >
              {deleteLoading ? <CircularProgress size={20} /> : 'Törlés'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Duplicate Dialog ── */}
        <Dialog open={!!duplicateDialog} onClose={() => setDuplicateDialog(null)} maxWidth="sm" fullWidth>
          <DialogTitle>Sablon duplikálása</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              A(z) <strong>{duplicateDialog?.name}</strong> sablon másolata készül.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Új sablon neve"
                value={duplicateName}
                onChange={(e) => {
                  setDuplicateName(e.target.value);
                  setDuplicateSlug(slugify(e.target.value));
                }}
                fullWidth
                size="small"
                required
              />
              <TextField
                label="Új slug"
                value={duplicateSlug}
                onChange={(e) => setDuplicateSlug(e.target.value)}
                fullWidth
                size="small"
                required
                helperText="Egyedi azonosító (csak kisbetűk, számok, _ és -)"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDuplicateDialog(null)} disabled={duplicateLoading}>
              Mégse
            </Button>
            <Button
              onClick={handleDuplicate}
              variant="contained"
              disabled={duplicateLoading}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              {duplicateLoading ? <CircularProgress size={20} /> : 'Duplikálás'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Create/Edit Dialog ── */}
        <Dialog
          open={dialogOpen}
          onClose={handleClose}
          fullWidth
          maxWidth="lg"
          fullScreen={isMobile}
        >
          <DialogTitle
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmailIcon sx={{ color: '#2563eb' }} />
              <Typography variant="h6" fontWeight={600}>
                {editingTemplate ? 'Sablon szerkesztése' : 'Új sablon létrehozása'}
              </Typography>
            </Box>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>

          <Divider />

          <DialogContent sx={{ p: 0 }}>
            <Tabs
              value={dialogTab}
              onChange={(_, v) => (v === 1 ? handlePreview() : setDialogTab(v))}
              sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab label="Szerkesztés" icon={<EditIcon />} iconPosition="start" />
              <Tab label="Előnézet" icon={<PreviewIcon />} iconPosition="start" />
            </Tabs>

            {/* ── Edit Tab ── */}
            {dialogTab === 0 && (
              <Box sx={{ p: 3 }}>
                <Grid container spacing={3}>
                  {/* Left: Form fields */}
                  <Grid item xs={12} md={7}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        label="Sablon neve"
                        value={form.name}
                        onChange={handleNameChange}
                        fullWidth
                        required
                        size="small"
                        placeholder="pl. Új munkavállaló üdvözlő"
                      />
                      <TextField
                        label="Slug (egyedi azonosító)"
                        value={form.slug}
                        onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                        fullWidth
                        required
                        size="small"
                        helperText="Automatikusan generálva a névből. Csak kisbetűk, számok, _ és -"
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <CodeIcon fontSize="small" color="action" />
                            </InputAdornment>
                          ),
                        }}
                      />

                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <FormControl fullWidth size="small">
                            <InputLabel>Sablon típus</InputLabel>
                            <Select
                              value={form.template_type}
                              label="Sablon típus"
                              onChange={(e) => setForm((prev) => ({ ...prev, template_type: e.target.value }))}
                            >
                              {TEMPLATE_TYPES.map((t) => (
                                <MenuItem key={t.value} value={t.value}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box
                                      sx={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        bgcolor: t.color,
                                      }}
                                    />
                                    {t.label}
                                  </Box>
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={form.is_active}
                                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                                color="success"
                              />
                            }
                            label="Aktív"
                            sx={{ mt: 0.5 }}
                          />
                        </Grid>
                      </Grid>

                      <Divider />

                      <TextField
                        label="Email tárgy"
                        value={form.subject}
                        onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                        fullWidth
                        required
                        size="small"
                        placeholder="pl. Üdvözöljük a {{company_name}} csapatában!"
                        helperText="Használhatsz {{változó}} szintaxist"
                      />

                      <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Email törzs *
                        </Typography>
                        <TextField
                          value={form.body}
                          onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                          fullWidth
                          multiline
                          rows={14}
                          size="small"
                          placeholder={'Kedves {{employee_name}}!\n\nÖrömmel értesítünk...\n\nÜdvözlettel,\n{{company_name}}'}
                          sx={{
                            '& .MuiInputBase-root': {
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                              lineHeight: 1.6,
                            },
                          }}
                        />
                      </Box>
                    </Box>
                  </Grid>

                  {/* Right: Variable palette */}
                  <Grid item xs={12} md={5}>
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 2,
                        position: { md: 'sticky' },
                        top: { md: 16 },
                      }}
                    >
                      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                        Változók
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Kattints egy változóra a beszúráshoz. Jelöld ki a sablonhoz tartozó változókat.
                      </Typography>

                      {/* Active variables in this template */}
                      {form.variables.length > 0 && (
                        <>
                          <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block', color: '#2563eb' }}>
                            Sablon változói ({form.variables.length})
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                            {form.variables.map((v) => (
                              <Chip
                                key={v}
                                label={`{{${v}}}`}
                                size="small"
                                color="primary"
                                onClick={() => insertVariable(v)}
                                onDelete={() => removeVariable(v)}
                                sx={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.75rem' }}
                              />
                            ))}
                          </Box>
                          <Divider sx={{ my: 1.5 }} />
                        </>
                      )}

                      <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                        Elérhető változók
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                        {Object.keys(SAMPLE_VARIABLES).map((v) => (
                          <Chip
                            key={v}
                            label={`{{${v}}}`}
                            size="small"
                            variant={form.variables.includes(v) ? 'filled' : 'outlined'}
                            color={form.variables.includes(v) ? 'primary' : 'default'}
                            onClick={() => insertVariable(v)}
                            onDelete={() => toggleVariable(v)}
                            deleteIcon={
                              form.variables.includes(v) ? (
                                <DeleteIcon fontSize="small" />
                              ) : (
                                <AddIcon fontSize="small" />
                              )
                            }
                            sx={{
                              cursor: 'pointer',
                              fontFamily: 'monospace',
                              fontSize: '0.7rem',
                            }}
                          />
                        ))}
                      </Box>

                      {/* Add custom variable */}
                      <Divider sx={{ my: 1.5 }} />
                      <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>
                        Egyéni változó hozzáadása
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                          size="small"
                          placeholder="valtozo_nev"
                          value={customVar}
                          onChange={(e) => setCustomVar(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addCustomVariable()}
                          sx={{ flex: 1 }}
                        />
                        <Button size="small" variant="outlined" onClick={addCustomVariable}>
                          +
                        </Button>
                      </Box>

                      {/* Tip */}
                      <Box
                        sx={{
                          mt: 2,
                          p: 1.5,
                          bgcolor: '#fff',
                          borderRadius: 1,
                          border: '1px solid #e0e0e0',
                        }}
                      >
                        <Typography
                          variant="caption"
                          fontWeight={600}
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
                        >
                          <CopyIcon fontSize="small" /> Tipp
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          A {'{{változó}}'} szintaxissal dinamikus tartalmat szúrhatsz be. Az email küldésekor
                          a változók automatikusan kitöltődnek a címzett adataival.
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            )}

            {/* ── Preview Tab ── */}
            {dialogTab === 1 && (
              <Box sx={{ p: 3 }}>
                {previewLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                    <CircularProgress />
                  </Box>
                ) : previewData ? (
                  <Paper
                    variant="outlined"
                    sx={{ borderRadius: 2, overflow: 'hidden' }}
                  >
                    {/* Email header */}
                    <Box sx={{ bgcolor: '#f1f5f9', px: 3, py: 2, borderBottom: '1px solid #e2e8f0' }}>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Feladó:</strong> noreply@hr-erp.com
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        <strong>Címzett:</strong> teszt@example.com
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        <strong>Tárgy:</strong> {previewData.subject}
                      </Typography>
                    </Box>

                    {/* Email body */}
                    <Box
                      sx={{
                        px: 3,
                        py: 3,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'inherit',
                        lineHeight: 1.8,
                        fontSize: '0.9rem',
                        minHeight: 300,
                      }}
                    >
                      {previewData.body}
                    </Box>

                    {/* Unresolved variables warning */}
                    {previewData.unresolved_variables?.length > 0 && (
                      <Box
                        sx={{
                          px: 3,
                          py: 1.5,
                          bgcolor: '#fef3c7',
                          borderTop: '1px solid #fcd34d',
                        }}
                      >
                        <Typography variant="caption" color="#92400e">
                          Nem feloldott változók:{' '}
                          {previewData.unresolved_variables.map((v) => `{{${v}}}`).join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 5 }}>
                    <Typography color="text.secondary">
                      Nincs előnézeti adat. Írj tartalmat a sablon szerkesztésnél.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={handleClose} disabled={saving}>
              Mégse
            </Button>
            <Button
              onClick={handleSave}
              variant="contained"
              disabled={saving}
              sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
            >
              {saving ? (
                <CircularProgress size={20} sx={{ color: 'white' }} />
              ) : editingTemplate ? (
                'Mentés'
              ) : (
                'Létrehozás'
              )}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
}

export default EmailTemplates;
