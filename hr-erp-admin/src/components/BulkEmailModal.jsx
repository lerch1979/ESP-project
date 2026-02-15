import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  CircularProgress,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Alert,
  Box,
  Stepper,
  Step,
  StepLabel,
  Chip,
  IconButton,
  Paper,
} from '@mui/material';
import {
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import { notificationsAPI } from '../services/api';
import { toast } from 'react-toastify';

const steps = ['Szűrés', 'Üzenet', 'Előnézet és Küldés'];

// Filter field definitions with Hungarian labels
const FILTER_FIELDS = [
  { key: 'status', label: 'Státusz', type: 'dynamic' },
  { key: 'workplace', label: 'Munkahely', type: 'dynamic' },
  { key: 'accommodation', label: 'Szálláshely', type: 'dynamic' },
  { key: 'visa_expiry', label: 'Vízum lejárat', type: 'preset' },
  { key: 'contract_end', label: 'Szerződés lejárat', type: 'preset' },
  { key: 'gender', label: 'Nem', type: 'preset' },
  { key: 'marital_status', label: 'Családi állapot', type: 'preset' },
  { key: 'position', label: 'Beosztás', type: 'dynamic' },
  { key: 'country', label: 'Ország', type: 'dynamic' },
  { key: 'birth_year', label: 'Életkor', type: 'preset' },
];

// Preset value options for non-dynamic fields
const PRESET_VALUES = {
  visa_expiry: [
    { value: 'expired', label: 'Lejárt' },
    { value: '30days', label: '30 napon belül lejár' },
    { value: '60days', label: '60 napon belül lejár' },
    { value: 'valid', label: 'Érvényes' },
  ],
  contract_end: [
    { value: 'expired', label: 'Lejárt' },
    { value: '30days', label: '30 napon belül lejár' },
    { value: '60days', label: '60 napon belül lejár' },
    { value: '90days', label: '90 napon belül lejár' },
  ],
  gender: [
    { value: 'male', label: 'Férfi' },
    { value: 'female', label: 'Nő' },
    { value: 'other', label: 'Egyéb' },
  ],
  marital_status: [
    { value: 'single', label: 'Egyedülálló' },
    { value: 'married', label: 'Házas' },
    { value: 'divorced', label: 'Elvált' },
    { value: 'widowed', label: 'Özvegy' },
  ],
  birth_year: [
    { value: 'under_25', label: '25 év alatt' },
    { value: '25_35', label: '25-35 év' },
    { value: '35_50', label: '35-50 év' },
    { value: 'over_50', label: '50 év felett' },
  ],
};

const MAX_FILTERS = 10;

const emptyFilter = () => ({ field: '', value: '' });

function BulkEmailModal({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Step 1 - Filter
  const [filters, setFilters] = useState([emptyFilter()]);
  const [recipients, setRecipients] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filterOptions, setFilterOptions] = useState(null);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);

  // Step 2 - Compose
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (open) {
      resetState();
      loadFilterOptions();
      loadTemplates();
    }
  }, [open]);

  const resetState = () => {
    setStep(0);
    setFilters([emptyFilter()]);
    setRecipients([]);
    setSelectedIds([]);
    setSelectedTemplate('');
    setSubject('');
    setBody('');
    setSending(false);
    setSendResult(null);
  };

  const loadFilterOptions = async () => {
    setFilterOptionsLoading(true);
    try {
      const response = await notificationsAPI.getFilterOptions();
      if (response.success) {
        setFilterOptions(response.data);
      }
    } catch (error) {
      console.error('Filter options load error:', error);
    } finally {
      setFilterOptionsLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await notificationsAPI.getTemplates();
      if (response.success) {
        setTemplates(response.data);
      }
    } catch (error) {
      console.error('Templates load error:', error);
    }
  };

  // --- Filter row management ---
  const addFilter = () => {
    if (filters.length < MAX_FILTERS) {
      setFilters([...filters, emptyFilter()]);
    }
  };

  const removeFilter = (index) => {
    if (filters.length > 1) {
      setFilters(filters.filter((_, i) => i !== index));
    } else {
      setFilters([emptyFilter()]);
    }
  };

  const updateFilter = (index, key, val) => {
    setFilters((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: val };
      // Reset value when field changes
      if (key === 'field') {
        updated[index].value = '';
      }
      return updated;
    });
  };

  // Get value options for a given filter field
  const getValueOptions = useCallback(
    (fieldKey) => {
      if (!fieldKey) return [];

      // Preset values
      if (PRESET_VALUES[fieldKey]) {
        return PRESET_VALUES[fieldKey];
      }

      // Dynamic values from backend
      if (!filterOptions) return [];

      switch (fieldKey) {
        case 'status':
          return (filterOptions.statuses || []).map((s) => ({ value: s.name, label: s.name }));
        case 'workplace':
          return (filterOptions.workplaces || []).map((w) => ({ value: w, label: w }));
        case 'accommodation':
          return (filterOptions.accommodations || []).map((a) => ({ value: a.id, label: a.name }));
        case 'position':
          return (filterOptions.positions || []).map((p) => ({ value: p, label: p }));
        case 'country':
          return (filterOptions.countries || []).map((c) => ({ value: c, label: c }));
        default:
          return [];
      }
    },
    [filterOptions]
  );

  // Get fields already used by other filter rows (to avoid duplicates)
  const getUsedFields = (excludeIndex) => {
    return filters
      .filter((_, i) => i !== excludeIndex)
      .map((f) => f.field)
      .filter(Boolean);
  };

  // --- Filter execution ---
  const handleFilter = async () => {
    setLoading(true);
    try {
      const activeFilters = filters.filter((f) => f.field && f.value);
      const response = await notificationsAPI.filterRecipients({ filters: activeFilters });
      if (response.success) {
        setRecipients(response.data);
        setSelectedIds(response.data.map((r) => r.id));
      }
    } catch (error) {
      toast.error('Hiba a címzettek szűrésekor');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedIds(recipients.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleTemplateChange = (slug) => {
    setSelectedTemplate(slug);
    if (slug) {
      const template = templates.find((t) => t.slug === slug);
      if (template && template.slug !== 'general') {
        setSubject(template.subject);
        setBody(template.body_html);
      } else if (template && template.slug === 'general') {
        setSubject('');
        setBody('');
      }
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const data = {
        recipient_ids: selectedIds,
        subject,
        body,
      };
      if (selectedTemplate) {
        data.template_slug = selectedTemplate;
      }

      const response = await notificationsAPI.sendBulk(data);
      if (response.success) {
        setSendResult(response.data);
      }
    } catch (error) {
      toast.error('Hiba a küldés során');
      setSendResult({ sent: 0, failed: selectedIds.length, errors: [{ email: '-', error: error.message }] });
    } finally {
      setSending(false);
    }
  };

  const selectedRecipients = recipients.filter((r) => selectedIds.includes(r.id));
  const hasActiveFilters = filters.some((f) => f.field && f.value);

  // --- Render helpers ---

  const renderFilterRow = (filter, index) => {
    const usedFields = getUsedFields(index);
    const valueOptions = getValueOptions(filter.field);

    return (
      <Box
        key={index}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mb: 1.5,
        }}
      >
        {/* Field selector */}
        <FormControl size="small" sx={{ minWidth: 180, flex: 1 }}>
          <InputLabel>Szűrő mező</InputLabel>
          <Select
            value={filter.field}
            onChange={(e) => updateFilter(index, 'field', e.target.value)}
            label="Szűrő mező"
          >
            <MenuItem value="">
              <em>Válasszon...</em>
            </MenuItem>
            {FILTER_FIELDS.map((f) => (
              <MenuItem
                key={f.key}
                value={f.key}
                disabled={usedFields.includes(f.key)}
              >
                {f.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Value selector */}
        <FormControl size="small" sx={{ minWidth: 220, flex: 1.4 }} disabled={!filter.field}>
          <InputLabel>Érték</InputLabel>
          <Select
            value={filter.value}
            onChange={(e) => updateFilter(index, 'value', e.target.value)}
            label="Érték"
          >
            <MenuItem value="">
              <em>Válasszon...</em>
            </MenuItem>
            {valueOptions.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Remove button */}
        <IconButton
          size="small"
          onClick={() => removeFilter(index)}
          sx={{ color: '#d32f2f' }}
        >
          <RemoveIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  };

  const renderStep1 = () => (
    <>
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
        Címzettek szűrése
      </Typography>

      {filterOptionsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {/* Dynamic filter rows */}
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: '#fafafa' }}>
            {filters.map((filter, index) => renderFilterRow(filter, index))}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={addFilter}
                disabled={filters.length >= MAX_FILTERS}
                sx={{ color: '#2c5f2d' }}
              >
                Szűrő hozzáadása
              </Button>
              <Typography variant="caption" color="text.secondary">
                {filters.length}/{MAX_FILTERS} szűrő
              </Typography>
            </Box>
          </Paper>

          {/* Search button */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Button
              variant="contained"
              onClick={handleFilter}
              disabled={loading}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
            >
              {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Szűrés'}
            </Button>
            {recipients.length > 0 && (
              <Chip
                label={`${selectedIds.length} / ${recipients.length} munkavállaló kiválasztva`}
                color="primary"
                sx={{ bgcolor: '#2c5f2d', fontWeight: 600 }}
              />
            )}
          </Box>

          {/* Results */}
          {recipients.length > 0 && (
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedIds.length === recipients.length && recipients.length > 0}
                        indeterminate={selectedIds.length > 0 && selectedIds.length < recipients.length}
                        onChange={handleSelectAll}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Név</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Munkahely</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Szálláshely</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recipients.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.includes(r.id)}
                          onChange={() => handleSelectOne(r.id)}
                        />
                      </TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.workplace || '-'}</TableCell>
                      <TableCell>{r.accommodation || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {recipients.length === 0 && !loading && (
            <Typography variant="body2" color="text.secondary">
              {hasActiveFilters
                ? 'Kattintson a "Szűrés" gombra a címzettek kereséséhez.'
                : 'Adjon hozzá szűrőket, majd kattintson a "Szűrés" gombra. Szűrők nélkül minden emailcímmel rendelkező munkavállaló megjelenik.'}
            </Typography>
          )}
        </>
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
        Üzenet összeállítása
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <FormControl fullWidth size="small">
            <InputLabel>Sablon (opcionális)</InputLabel>
            <Select
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
              label="Sablon (opcionális)"
            >
              <MenuItem value="">Nincs sablon</MenuItem>
              {templates.map((t) => (
                <MenuItem key={t.slug} value={t.slug}>{t.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Tárgy"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Üzenet"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            rows={8}
          />
        </Grid>
        <Grid item xs={12}>
          <Typography variant="caption" color="text.secondary">
            Használható változók: {'{{name}}'}, {'{{workplace}}'}, {'{{accommodation}}'}, {'{{visa_expiry}}'}, {'{{contract_end}}'}
          </Typography>
        </Grid>
      </Grid>
    </>
  );

  const renderStep3 = () => (
    <>
      {sendResult ? (
        <Box>
          <Alert severity={sendResult.failed === 0 ? 'success' : 'warning'} sx={{ mb: 2 }}>
            Küldés befejezve: <strong>{sendResult.sent}</strong> sikeres, <strong>{sendResult.failed}</strong> sikertelen
          </Alert>
          {sendResult.errors && sendResult.errors.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="error" sx={{ mb: 1 }}>Hibák:</Typography>
              {sendResult.errors.map((err, i) => (
                <Typography key={i} variant="body2" color="error">
                  {err.email}: {err.error}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      ) : (
        <>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
            Előnézet
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Címzettek száma:</strong> {selectedRecipients.length}
            </Typography>
            <Typography variant="body2">
              <strong>Tárgy:</strong> {subject}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              <strong>Üzenet előnézet:</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {body && body.length > 200 ? body.substring(0, 200) + '...' : body}
            </Typography>
          </Box>

          <Typography variant="subtitle2" sx={{ mb: 1 }}>Címzettek:</Typography>
          <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
            {selectedRecipients.map((r) => (
              <Chip
                key={r.id}
                label={`${r.name} (${r.email})`}
                size="small"
                sx={{ mr: 0.5, mb: 0.5 }}
              />
            ))}
          </Box>
        </>
      )}
    </>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Tömeges üzenet küldése</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3, mt: 1 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {step === 0 && renderStep1()}
        {step === 1 && renderStep2()}
        {step === 2 && renderStep3()}
      </DialogContent>
      <DialogActions>
        {step === 0 && (
          <>
            <Button onClick={onClose}>Mégse</Button>
            <Button
              variant="contained"
              disabled={selectedIds.length === 0}
              onClick={() => setStep(1)}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
            >
              Tovább ({selectedIds.length} címzett)
            </Button>
          </>
        )}
        {step === 1 && (
          <>
            <Button onClick={() => setStep(0)}>Vissza</Button>
            <Button
              variant="contained"
              disabled={!subject || !body}
              onClick={() => setStep(2)}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
            >
              Tovább
            </Button>
          </>
        )}
        {step === 2 && !sendResult && (
          <>
            <Button onClick={() => setStep(1)} disabled={sending}>Vissza</Button>
            <Button
              variant="contained"
              onClick={handleSend}
              disabled={sending}
              sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
            >
              {sending ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
              {sending ? 'Küldés...' : 'Küldés'}
            </Button>
          </>
        )}
        {step === 2 && sendResult && (
          <Button
            variant="contained"
            onClick={onClose}
            sx={{ bgcolor: '#2c5f2d', '&:hover': { bgcolor: '#234d24' } }}
          >
            Bezárás
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default BulkEmailModal;
