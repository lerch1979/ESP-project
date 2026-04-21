import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Container, Paper, Card, CardContent, Typography, Button, Stack, TextField,
  CircularProgress, Chip, IconButton, Tooltip, Switch, Slider, Alert, AlertTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  MenuItem, Select, FormControl, InputLabel, FormControlLabel, FormHelperText,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Science as ScienceIcon,
  Rule as RuleIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { classificationRulesAPI, costCentersAPI } from '../../services/api';
import { toast } from 'react-toastify';

// ============================================
// CONSTANTS
// ============================================

const RULE_TYPES = {
  partner: { label: 'Partner', color: '#1976d2', bg: '#e3f2fd' },
  settlement: { label: 'Település', color: '#2e7d32', bg: '#e8f5e9' },
  keyword: { label: 'Kulcsszó', color: '#ed6c02', bg: '#fff3e0' },
  combined: { label: 'Kombinált', color: '#7b1fa2', bg: '#f3e5f5' },
};

const priorityChipColor = (p) => {
  if (p >= 1 && p <= 3) return { bgcolor: '#ef4444', color: '#fff' };
  if (p >= 4 && p <= 6) return { bgcolor: '#f59e0b', color: '#fff' };
  return { bgcolor: '#9ca3af', color: '#fff' };
};

const emptyForm = {
  name: '',
  ruleType: 'partner',
  partnerName: '',
  settlementName: '',
  keyword: '',
  costCenterId: '',
  priority: 5,
  confidenceBoost: 20,
  isActive: true,
};

// ============================================
// MAIN PAGE
// ============================================

export default function ClassificationRules() {
  const [rules, setRules] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [modalMode, setModalMode] = useState(null); // 'create' | 'edit' | null
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Tester state
  const [testVendor, setTestVendor] = useState('');
  const [testText, setTestText] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadRules = useCallback(async () => {
    try {
      const res = await classificationRulesAPI.getAll();
      const data = Array.isArray(res) ? res : (res?.data || []);
      setRules(data);
    } catch (e) {
      toast.error('Hiba a szabályok betöltésekor');
      setError('Nem sikerült betölteni a szabályokat.');
    }
  }, []);

  const loadCostCenters = useCallback(async () => {
    try {
      const res = await costCentersAPI.getAll({ limit: 500 });
      const data = Array.isArray(res) ? res : (res?.data || []);
      setCostCenters(data);
    } catch (e) {
      toast.error('Hiba a költséghelyek betöltésekor');
      setError('Nem sikerült betölteni a költséghelyeket.');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadRules(), loadCostCenters()]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [loadRules, loadCostCenters]);

  // ============================================
  // DERIVED
  // ============================================

  // Derive settlement options from cost centers with code starting with OPR-SZALL-HS-
  const settlementOptions = useMemo(() => {
    const opts = costCenters
      .filter((cc) => typeof cc.code === 'string' && cc.code.startsWith('OPR-SZALL-HS-'))
      .map((cc) => cc.name)
      .filter(Boolean);
    return Array.from(new Set(opts)).sort((a, b) => a.localeCompare(b, 'hu'));
  }, [costCenters]);

  const costCenterById = useMemo(() => {
    const map = new Map();
    costCenters.forEach((cc) => map.set(cc.id, cc));
    return map;
  }, [costCenters]);

  // ============================================
  // MODAL HANDLERS
  // ============================================

  const openCreateModal = () => {
    setForm(emptyForm);
    setFormErrors({});
    setEditingId(null);
    setModalMode('create');
  };

  const openEditModal = (rule) => {
    setForm({
      name: rule.name || '',
      ruleType: rule.ruleType || 'partner',
      partnerName: rule.partnerName || '',
      settlementName: rule.settlementName || '',
      keyword: rule.keyword || '',
      costCenterId: rule.costCenterId || '',
      priority: rule.priority ?? 5,
      confidenceBoost: rule.confidenceBoost ?? 20,
      isActive: rule.isActive !== false,
    });
    setFormErrors({});
    setEditingId(rule.id);
    setModalMode('edit');
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
    setEditingId(null);
    setFormErrors({});
  };

  const validateForm = () => {
    const errs = {};
    if (!form.name || !form.name.trim()) errs.name = 'Kötelező mező';
    if (!form.ruleType) errs.ruleType = 'Kötelező mező';
    if (!form.costCenterId) errs.costCenterId = 'Kötelező mező';
    if ((form.ruleType === 'partner' || form.ruleType === 'combined') && !form.partnerName?.trim()) {
      errs.partnerName = 'Kötelező mező partner / kombinált típushoz';
    }
    if ((form.ruleType === 'settlement' || form.ruleType === 'combined') && !form.settlementName?.trim()) {
      errs.settlementName = 'Kötelező mező település / kombinált típushoz';
    }
    if (form.ruleType === 'keyword' && !form.keyword?.trim()) {
      errs.keyword = 'Kötelező mező kulcsszó típushoz';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = () => {
    const payload = {
      name: form.name.trim(),
      ruleType: form.ruleType,
      costCenterId: form.costCenterId,
      priority: Number(form.priority),
      confidenceBoost: Number(form.confidenceBoost),
      isActive: !!form.isActive,
    };
    // Only include relevant fields based on type
    if (form.ruleType === 'partner' || form.ruleType === 'combined') {
      payload.partnerName = form.partnerName.trim();
    }
    if (form.ruleType === 'settlement' || form.ruleType === 'combined') {
      payload.settlementName = form.settlementName.trim();
    }
    if (form.ruleType === 'keyword') {
      payload.keyword = form.keyword.trim();
    }
    return payload;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (modalMode === 'create') {
        await classificationRulesAPI.create(payload);
        toast.success('Szabály létrehozva');
      } else if (modalMode === 'edit' && editingId) {
        await classificationRulesAPI.update(editingId, payload);
        toast.success('Szabály frissítve');
      }
      await loadRules();
      setModalMode(null);
      setEditingId(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Hiba a mentéskor');
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // ROW HANDLERS
  // ============================================

  const handleToggleActive = async (rule, nextActive) => {
    try {
      await classificationRulesAPI.update(rule.id, {
        name: rule.name,
        ruleType: rule.ruleType,
        partnerName: rule.partnerName || undefined,
        settlementName: rule.settlementName || undefined,
        keyword: rule.keyword || undefined,
        costCenterId: rule.costCenterId,
        priority: rule.priority,
        confidenceBoost: rule.confidenceBoost,
        isActive: nextActive,
      });
      toast.success(nextActive ? 'Szabály aktiválva' : 'Szabály deaktiválva');
      loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Hiba a frissítéskor');
    }
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Biztosan törlöd: '${rule.name}'?`)) return;
    try {
      await classificationRulesAPI.remove(rule.id);
      toast.success('Szabály törölve');
      loadRules();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Hiba a törléskor');
    }
  };

  // ============================================
  // TESTER
  // ============================================

  const handleTest = async () => {
    if (!testVendor.trim() && !testText.trim()) {
      toast.warning('Adj meg legalább egy szállítót vagy szöveget');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const body = {};
      if (testVendor.trim()) body.vendorName = testVendor.trim();
      // Settlement + keyword rules match ONLY against `notes`. This field
      // represents what the admin would type in the Megjegyzés field on a
      // real invoice, so it must go there — not into extractedText/subject.
      if (testText.trim()) body.notes = testText.trim();
      const res = await classificationRulesAPI.test(body);
      const data = res?.data || res;
      setTestResult(data);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Hiba a teszteléskor');
    } finally {
      setTesting(false);
    }
  };

  // ============================================
  // HELPERS
  // ============================================

  const formatMatchSummary = (rule) => {
    const parts = [];
    if (rule.partnerName) parts.push(`Partner: ${rule.partnerName}`);
    if (rule.settlementName) parts.push(`Település: ${rule.settlementName}`);
    if (rule.keyword) parts.push(`Kulcsszó: ${rule.keyword}`);
    return parts.length > 0 ? parts.join(' · ') : '—';
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      {/* ==================== A) Header ==================== */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Besorolási szabályok
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Itt kezelheted a szabályokat, amelyek alapján a rendszer automatikusan költséghelyre sorolja a beérkező számlákat.
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
      )}

      {/* ==================== A2) How-it-works explainer ==================== */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <AlertTitle sx={{ fontWeight: 700 }}>Hogyan működnek a szabályok?</AlertTitle>
        <Box component="div" sx={{ '& p': { m: 0, mb: 1 }, '& p:last-child': { mb: 0 } }}>
          <Typography component="p" variant="body2">
            <strong>Partner szabályok</strong> (<Box component="code" sx={{ fontFamily: 'monospace' }}>partner</Box> vagy <Box component="code" sx={{ fontFamily: 'monospace' }}>combined</Box> típus) — a rendszer a szállító neve és az email feladója alapján illeszt. Például: ha a számla a „Rent-Haus Kft" cégtől érkezik, a szabály automatikusan hozzárendel egy költséghelyet.
          </Typography>
          <Typography component="p" variant="body2">
            <strong>Település szabályok</strong> (<Box component="code" sx={{ fontFamily: 'monospace' }}>settlement</Box> típus) — <strong>csak a kézzel megadott Megjegyzés mezőből keres!</strong> Nem a számla szövegéből, mert a központi címünk Fertődön van, ami a legtöbb számlában megjelenik — ez tévesen Fertődre sorolná a számlákat.
          </Typography>
          <Typography component="p" variant="body2">
            <strong>Kulcsszó szabályok</strong> (<Box component="code" sx={{ fontFamily: 'monospace' }}>keyword</Box> típus) — szintén csak a Megjegyzés mezőből keres.
          </Typography>
          <Typography component="p" variant="body2" sx={{ mt: 1 }}>
            <strong>Javasolt munkafolyamat:</strong> a beérkező számlát megnyitjuk az Inbox-ban, és a „Megjegyzés" mezőbe beírjuk pl. „Beled szálló — 2026 március rezsi". Az Újraosztályozás gombra kattintva a rendszer felismeri a „Beled" kulcsszót és hozzárendeli a CC-BELED költséghelyet.
          </Typography>
        </Box>
      </Alert>

      {/* ==================== B) Rules table ==================== */}
      <Paper sx={{ mb: 3, p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Szabályok ({rules.length})
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreateModal}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            Új szabály
          </Button>
        </Stack>

        {rules.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <RuleIcon sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">Nincs besorolási szabály</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Kattints az „Új szabály" gombra az első szabály létrehozásához.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Szabály neve</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Típus</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Illesztési feltétel</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Célköltséghely</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Egyezések</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center">Aktív</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 120 }} align="center">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rules.map((rule) => {
                  const typeCfg = RULE_TYPES[rule.ruleType] || RULE_TYPES.partner;
                  const pColor = priorityChipColor(rule.priority);
                  return (
                    <TableRow key={rule.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{rule.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={typeCfg.label}
                          size="small"
                          sx={{ bgcolor: typeCfg.bg, color: typeCfg.color, fontWeight: 600 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatMatchSummary(rule)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {rule.costCenterCode || '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {rule.costCenterName ? `— ${rule.costCenterName}` : ''}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={rule.priority}
                          size="small"
                          sx={{ ...pColor, fontWeight: 700, minWidth: 40 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{rule.matchCount ?? 0}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          size="small"
                          checked={!!rule.isActive}
                          onChange={(e) => handleToggleActive(rule, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Szerkesztés">
                            <IconButton size="small" onClick={() => openEditModal(rule)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Törlés">
                            <IconButton size="small" color="error" onClick={() => handleDelete(rule)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* ==================== D) Tester panel ==================== */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <ScienceIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              🧪 Szabály tesztelése
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Próbáld ki, hogy egy adott szállító vagy szöveg alapján melyik költséghelyre sorolódna a számla.
          </Typography>

          <Stack spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="Szállító neve"
              size="small"
              fullWidth
              value={testVendor}
              onChange={(e) => setTestVendor(e.target.value)}
              placeholder="pl. E.ON Energiakereskedelmi Kft."
            />
            <TextField
              label="Megjegyzés (település / kulcsszó teszt)"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="pl. Petőháza villanyszerelés · Beled rezsi · Röjtökmuzsaj karbantartás"
              helperText="A település és kulcsszó szabályok csak a Megjegyzés mezőt vizsgálják — ezért ide írd a teszt szöveget."
            />
            <Box>
              <Button
                variant="contained"
                startIcon={testing ? <CircularProgress size={16} color="inherit" /> : <ScienceIcon />}
                onClick={handleTest}
                disabled={testing}
              >
                Tesztelés
              </Button>
            </Box>
          </Stack>

          {testResult && (
            <Box sx={{ mt: 2 }}>
              {testResult.source === 'rule' && (
                <Alert severity="success" icon={<CheckCircleIcon />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Szabály találat: <Box component="span" sx={{ fontFamily: 'monospace' }}>{testResult.cost_center_code}</Box> — {testResult.cost_center_name}
                  </Typography>
                  {testResult.reason && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>{testResult.reason}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Magabiztosság: {testResult.confidence}% · {testResult.auto_approved ? 'Automatikusan jóváhagyható' : 'Kézi jóváhagyás szükséges'}
                  </Typography>
                </Alert>
              )}
              {testResult.source === 'predictor' && (
                <Alert severity="info">
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Prediktor javaslat: <Box component="span" sx={{ fontFamily: 'monospace' }}>{testResult.cost_center_code}</Box> — {testResult.cost_center_name}
                  </Typography>
                  {testResult.reason && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>{testResult.reason}</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Magabiztosság: {testResult.confidence}%
                  </Typography>
                </Alert>
              )}
              {testResult.source === 'default' && (
                <Alert severity="warning">
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Nem illeszkedik szabály, általános költséghely
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {testResult.cost_center_code} — {testResult.cost_center_name}
                  </Typography>
                  {testResult.reason && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{testResult.reason}</Typography>
                  )}
                </Alert>
              )}

              {Array.isArray(testResult.all_matches) && testResult.all_matches.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Top találatok:
                  </Typography>
                  <Stack spacing={0.5}>
                    {[...testResult.all_matches]
                      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                      .slice(0, 3)
                      .map((m, idx) => (
                        <Paper
                          key={idx}
                          variant="outlined"
                          sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {m.rule_name || m.name || `Szabály #${m.rule_id || idx + 1}`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                              {m.cost_center_code || ''} {m.cost_center_name ? `— ${m.cost_center_name}` : ''}
                            </Typography>
                          </Box>
                          <Chip
                            label={`${m.score ?? 0} pt`}
                            size="small"
                            color={idx === 0 ? 'primary' : 'default'}
                          />
                        </Paper>
                      ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ==================== C) Create/Edit modal ==================== */}
      <Dialog open={modalMode !== null} onClose={closeModal} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {modalMode === 'create' ? 'Új besorolási szabály' : 'Szabály szerkesztése'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Szabály neve"
              required
              fullWidth
              size="small"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              error={!!formErrors.name}
              helperText={formErrors.name}
            />

            <FormControl fullWidth size="small" error={!!formErrors.ruleType}>
              <InputLabel>Típus</InputLabel>
              <Select
                label="Típus"
                value={form.ruleType}
                onChange={(e) => setForm({ ...form, ruleType: e.target.value })}
              >
                {Object.entries(RULE_TYPES).map(([val, cfg]) => (
                  <MenuItem key={val} value={val}>{cfg.label}</MenuItem>
                ))}
              </Select>
              {formErrors.ruleType && <FormHelperText>{formErrors.ruleType}</FormHelperText>}
            </FormControl>

            {(form.ruleType === 'partner' || form.ruleType === 'combined') && (
              <TextField
                label="Partner neve"
                fullWidth
                size="small"
                value={form.partnerName}
                onChange={(e) => setForm({ ...form, partnerName: e.target.value })}
                error={!!formErrors.partnerName}
                helperText={formErrors.partnerName || 'A szállító nevének egy része (pl. "E.ON")'}
              />
            )}

            {(form.ruleType === 'settlement' || form.ruleType === 'combined') && (
              <FormControl fullWidth size="small" error={!!formErrors.settlementName}>
                <InputLabel>Település</InputLabel>
                <Select
                  label="Település"
                  value={form.settlementName}
                  onChange={(e) => setForm({ ...form, settlementName: e.target.value })}
                >
                  <MenuItem value=""><em>— válassz —</em></MenuItem>
                  {settlementOptions.map((name) => (
                    <MenuItem key={name} value={name}>{name}</MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {formErrors.settlementName || 'Az OPR-SZALL-HS- költséghelyekből származtatott lista.'}
                </FormHelperText>
              </FormControl>
            )}

            {form.ruleType === 'keyword' && (
              <TextField
                label="Kulcsszó"
                fullWidth
                size="small"
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                error={!!formErrors.keyword}
                helperText={formErrors.keyword || 'Egy szó vagy rövid kifejezés, amit a számla szövege / tárgya tartalmaz.'}
              />
            )}

            <FormControl fullWidth size="small" error={!!formErrors.costCenterId}>
              <InputLabel>Célköltséghely</InputLabel>
              <Select
                label="Célköltséghely"
                value={form.costCenterId}
                onChange={(e) => setForm({ ...form, costCenterId: e.target.value })}
              >
                <MenuItem value=""><em>— válassz —</em></MenuItem>
                {costCenters.map((cc) => (
                  <MenuItem key={cc.id} value={cc.id}>
                    <Box component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{cc.code}</Box>
                    — {cc.name}
                  </MenuItem>
                ))}
              </Select>
              {formErrors.costCenterId && <FormHelperText>{formErrors.costCenterId}</FormHelperText>}
            </FormControl>

            <Divider />

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Prioritás: {form.priority}
              </Typography>
              <Slider
                min={1}
                max={10}
                step={1}
                marks={[{ value: 1, label: '1 (legmagasabb)' }, { value: 10, label: '10 (legalacsonyabb)' }]}
                value={form.priority}
                onChange={(_, v) => setForm({ ...form, priority: v })}
              />
            </Box>

            <Box>
              <Tooltip title="Szabály találat esetén mennyivel emelje a pontszámot">
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, display: 'inline-block' }}>
                  Magabiztosság növelés: +{form.confidenceBoost}
                </Typography>
              </Tooltip>
              <Slider
                min={0}
                max={50}
                step={1}
                marks={[{ value: 0, label: '0' }, { value: 25, label: '25' }, { value: 50, label: '50' }]}
                value={form.confidenceBoost}
                onChange={(_, v) => setForm({ ...form, confidenceBoost: v })}
              />
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={!!form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
              }
              label="Aktív"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModal} disabled={saving}>Mégse</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Mentés
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
