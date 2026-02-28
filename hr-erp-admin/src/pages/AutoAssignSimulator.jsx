import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Stack,
  Collapse,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  Science as SimulateIcon,
  CheckCircle as MatchIcon,
  Cancel as NoMatchIcon,
  Person as PersonIcon,
  ArrowForward as ArrowIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Shuffle as RandomIcon,
  TrendingDown as LeastBusyIcon,
  Loop as RoundRobinIcon,
  Psychology as SkillMatchIcon,
  AdminPanelSettings as FallbackIcon,
  Speed as WorkloadIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import Layout from '../components/Layout';
import { assignmentRulesAPI } from '../services/api';

const TICKET_FIELDS = [
  { key: 'status_slug', label: 'Státusz', examples: 'new, open, in_progress, resolved, closed' },
  { key: 'category_slug', label: 'Kategória', examples: 'maintenance, cleaning, complaint, request' },
  { key: 'priority_slug', label: 'Prioritás', examples: 'low, medium, high, urgent' },
  { key: 'accommodation_id', label: 'Szálláshely ID', examples: 'UUID' },
  { key: 'contractor_id', label: 'Alvállalkozó ID', examples: 'UUID' },
];

const TASK_FIELDS = [
  { key: 'status', label: 'Státusz', examples: 'pending, in_progress, completed, cancelled' },
  { key: 'priority', label: 'Prioritás', examples: 'low, medium, high, urgent' },
  { key: 'project_id', label: 'Projekt ID', examples: 'UUID' },
  { key: 'contractor_id', label: 'Alvállalkozó ID', examples: 'UUID' },
];

const STRATEGY_INFO = {
  round_robin: { label: 'Round Robin', icon: <RoundRobinIcon />, color: 'primary' },
  least_busy: { label: 'Legkevésbé terhelt', icon: <LeastBusyIcon />, color: 'success' },
  skill_match: { label: 'Képesség alapú', icon: <SkillMatchIcon />, color: 'secondary' },
  random: { label: 'Véletlenszerű', icon: <RandomIcon />, color: 'warning' },
  direct_user: { label: 'Közvetlen kijelölés', icon: <PersonIcon />, color: 'info' },
  fallback_admin: { label: 'Fallback (Admin)', icon: <FallbackIcon />, color: 'error' },
};

const AutoAssignSimulator = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [type, setType] = useState('ticket');
  const [fields, setFields] = useState([{ key: '', value: '' }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showEvaluatedRules, setShowEvaluatedRules] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);

  const availableFields = type === 'ticket' ? TICKET_FIELDS : TASK_FIELDS;

  const handleAddField = () => {
    setFields([...fields, { key: '', value: '' }]);
  };

  const handleRemoveField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index, prop, value) => {
    const updated = [...fields];
    updated[index][prop] = value;
    setFields(updated);
  };

  const handleTypeChange = (newType) => {
    setType(newType);
    setFields([{ key: '', value: '' }]);
    setResult(null);
    setError(null);
  };

  const handleReset = () => {
    setFields([{ key: '', value: '' }]);
    setResult(null);
    setError(null);
  };

  const handleSimulate = async () => {
    const item = {};
    for (const field of fields) {
      if (field.key && field.value) {
        item[field.key] = field.value;
      }
    }

    if (Object.keys(item).length === 0) {
      toast.warning('Legalább egy mezőt ki kell tölteni a szimulációhoz');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await assignmentRulesAPI.simulate({ type, item });
      setResult(response.data.simulation);
    } catch (err) {
      setError(err.response?.data?.message || 'Szimuláció hiba');
      toast.error('Szimuláció hiba');
    } finally {
      setLoading(false);
    }
  };

  const getWorkloadSeverity = (total) => {
    if (total === 0) return { label: 'Szabad', color: 'success' };
    if (total <= 3) return { label: 'Alacsony', color: 'info' };
    if (total <= 7) return { label: 'Közepes', color: 'warning' };
    return { label: 'Magas', color: 'error' };
  };

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SimulateIcon sx={{ fontSize: 28, color: 'primary.main' }} />
            <Typography variant="h5" fontWeight="bold">
              Auto-kiosztás Szimulátor
            </Typography>
          </Box>
          <Chip
            label="Nem ment adatot"
            color="info"
            variant="outlined"
            icon={<InfoIcon />}
            size="small"
          />
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          A szimulátor teszteli, hogy egy adott ticket vagy feladat esetén melyik kiosztási szabály illeszkedne,
          és ki lenne kijelölve. Nem módosít semmit az adatbázisban.
        </Alert>

        <Grid container spacing={3}>
          {/* Left: Input Form */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Szimulált elem
              </Typography>

              {/* Type selector */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Típus</InputLabel>
                <Select
                  value={type}
                  label="Típus"
                  onChange={(e) => handleTypeChange(e.target.value)}
                >
                  <MenuItem value="ticket">Hibajegy (Ticket)</MenuItem>
                  <MenuItem value="task">Feladat (Task)</MenuItem>
                </Select>
              </FormControl>

              <Divider sx={{ mb: 2 }} />

              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Mezők (a szabályok feltételei ezekre illeszkednek)
              </Typography>

              {/* Dynamic fields */}
              {fields.map((field, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-start' }}>
                  <FormControl sx={{ minWidth: 160, flex: 1 }} size="small">
                    <InputLabel>Mező</InputLabel>
                    <Select
                      value={field.key}
                      label="Mező"
                      onChange={(e) => handleFieldChange(index, 'key', e.target.value)}
                    >
                      {availableFields.map((f) => (
                        <MenuItem key={f.key} value={f.key} disabled={fields.some((ff, fi) => fi !== index && ff.key === f.key)}>
                          {f.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    size="small"
                    label="Érték"
                    value={field.value}
                    onChange={(e) => handleFieldChange(index, 'value', e.target.value)}
                    placeholder={availableFields.find(f => f.key === field.key)?.examples || ''}
                    sx={{ flex: 1 }}
                    helperText={field.key ? availableFields.find(f => f.key === field.key)?.examples : ''}
                  />

                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveField(index)}
                    disabled={fields.length === 1}
                    sx={{ mt: 0.5 }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}

              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddField}
                disabled={fields.length >= availableFields.length}
                sx={{ mb: 2 }}
              >
                Mező hozzáadása
              </Button>

              <Divider sx={{ mb: 2 }} />

              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <RunIcon />}
                  onClick={handleSimulate}
                  disabled={loading}
                  fullWidth
                >
                  {loading ? 'Szimuláció...' : 'Szimuláció futtatása'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleReset}
                  disabled={loading}
                >
                  Reset
                </Button>
              </Stack>
            </Paper>
          </Grid>

          {/* Right: Results */}
          <Grid item xs={12} md={7}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {!result && !error && !loading && (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <SimulateIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" color="text.secondary">
                  Töltsd ki a mezőket és futtasd a szimulációt
                </Typography>
                <Typography variant="body2" color="text.disabled">
                  Az eredmény itt jelenik meg
                </Typography>
              </Paper>
            )}

            {loading && (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <CircularProgress sx={{ mb: 2 }} />
                <Typography>Szimuláció folyamatban...</Typography>
              </Paper>
            )}

            {result && (
              <Stack spacing={2}>
                {/* Assignment Result Card */}
                <Card
                  sx={{
                    borderLeft: 4,
                    borderColor: result.would_assign_to
                      ? (result.is_fallback ? 'warning.main' : 'success.main')
                      : 'error.main',
                  }}
                >
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Kiosztás eredménye
                    </Typography>

                    {result.would_assign_to ? (
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                          <Box
                            sx={{
                              width: 48,
                              height: 48,
                              borderRadius: '50%',
                              bgcolor: 'primary.main',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: 18,
                            }}
                          >
                            {result.would_assign_to.name?.charAt(0)?.toUpperCase() || '?'}
                          </Box>
                          <Box>
                            <Typography variant="h6">
                              {result.would_assign_to.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {result.would_assign_to.email}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Strategy used */}
                        {result.strategy_used && (
                          <Chip
                            icon={STRATEGY_INFO[result.strategy_used]?.icon}
                            label={`Stratégia: ${STRATEGY_INFO[result.strategy_used]?.label || result.strategy_used}`}
                            color={STRATEGY_INFO[result.strategy_used]?.color || 'default'}
                            size="small"
                            sx={{ mr: 1 }}
                          />
                        )}

                        {result.is_fallback && (
                          <Chip
                            icon={<WarningIcon />}
                            label="Fallback (nincs illeszkedő szabály)"
                            color="warning"
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                    ) : (
                      <Alert severity="error">
                        Nem sikerült kiosztani - nincs illeszkedő szabály és nincs fallback admin sem.
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {/* Matched Rule Card */}
                <Card
                  sx={{
                    borderLeft: 4,
                    borderColor: result.matched_rule ? 'success.main' : 'grey.400',
                  }}
                >
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Illeszkedő szabály
                    </Typography>

                    {result.matched_rule ? (
                      <Box>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {result.matched_rule.name}
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                          <Chip
                            label={`Prioritás: ${result.matched_rule.priority}`}
                            size="small"
                            variant="outlined"
                          />
                          {result.matched_rule.assign_to_role && (
                            <Chip
                              label={`Szerep: ${result.matched_rule.assign_to_role}`}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          )}
                          {result.matched_rule.assign_strategy && (
                            <Chip
                              icon={STRATEGY_INFO[result.matched_rule.assign_strategy]?.icon}
                              label={STRATEGY_INFO[result.matched_rule.assign_strategy]?.label || result.matched_rule.assign_strategy}
                              size="small"
                              color={STRATEGY_INFO[result.matched_rule.assign_strategy]?.color || 'default'}
                            />
                          )}
                        </Stack>

                        {/* Conditions */}
                        {result.matched_rule.conditions && Object.keys(result.matched_rule.conditions).length > 0 && (
                          <Box sx={{ mt: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              Feltételek:
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                              {Object.entries(result.matched_rule.conditions).map(([key, value]) => (
                                <Chip
                                  key={key}
                                  label={`${key} = ${Array.isArray(value) ? value.join(', ') : value}`}
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                />
                              ))}
                            </Box>
                          </Box>
                        )}
                      </Box>
                    ) : (
                      <Typography color="text.secondary">
                        Nincs illeszkedő szabály a megadott feltételekre.
                      </Typography>
                    )}
                  </CardContent>
                </Card>

                {/* Evaluated Rules (collapsible) */}
                {result.evaluated_rules && result.evaluated_rules.length > 0 && (
                  <Paper>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 2,
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowEvaluatedRules(!showEvaluatedRules)}
                    >
                      <Typography variant="h6">
                        Kiértékelt szabályok ({result.evaluated_rules.length})
                      </Typography>
                      <IconButton size="small">
                        {showEvaluatedRules ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                    <Collapse in={showEvaluatedRules}>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Szabály</TableCell>
                              <TableCell>Prioritás</TableCell>
                              <TableCell>Feltételek</TableCell>
                              <TableCell>Stratégia</TableCell>
                              <TableCell align="center">Illeszkedik</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {result.evaluated_rules.map((rule) => (
                              <TableRow
                                key={rule.id}
                                sx={{
                                  bgcolor: rule.matched ? 'success.50' : 'inherit',
                                  '&:hover': { bgcolor: rule.matched ? 'success.100' : 'action.hover' },
                                }}
                              >
                                <TableCell>
                                  <Typography variant="body2" fontWeight={rule.matched ? 'bold' : 'normal'}>
                                    {rule.name}
                                  </Typography>
                                </TableCell>
                                <TableCell>{rule.priority}</TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                    {rule.conditions && Object.entries(rule.conditions).map(([k, v]) => (
                                      <Chip
                                        key={k}
                                        label={`${k}=${Array.isArray(v) ? v.join(',') : v}`}
                                        size="small"
                                        variant="outlined"
                                        sx={{ fontSize: '0.7rem' }}
                                      />
                                    ))}
                                    {(!rule.conditions || Object.keys(rule.conditions).length === 0) && (
                                      <Typography variant="caption" color="text.disabled">-</Typography>
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="caption">
                                    {STRATEGY_INFO[rule.assign_strategy]?.label || rule.assign_strategy || '-'}
                                  </Typography>
                                </TableCell>
                                <TableCell align="center">
                                  {rule.matched ? (
                                    <MatchIcon color="success" fontSize="small" />
                                  ) : (
                                    <NoMatchIcon color="error" fontSize="small" />
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Collapse>
                  </Paper>
                )}

                {/* Candidates (collapsible) */}
                {result.candidates && result.candidates.length > 0 && (
                  <Paper>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 2,
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowCandidates(!showCandidates)}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <WorkloadIcon color="primary" />
                        <Typography variant="h6">
                          Jelöltek munkaterhelése ({result.candidates.length})
                        </Typography>
                      </Box>
                      <IconButton size="small">
                        {showCandidates ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                    <Collapse in={showCandidates}>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Felhasználó</TableCell>
                              <TableCell align="center">Aktív jegyek</TableCell>
                              <TableCell align="center">Aktív feladatok</TableCell>
                              <TableCell align="center">Összes</TableCell>
                              <TableCell>Terhelés</TableCell>
                              <TableCell>Utolsó kiosztás</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {result.candidates.map((candidate) => {
                              const severity = getWorkloadSeverity(candidate.total_pending_items);
                              const isSelected = result.would_assign_to?.id === candidate.id;
                              return (
                                <TableRow
                                  key={candidate.id}
                                  sx={{
                                    bgcolor: isSelected ? 'primary.50' : 'inherit',
                                    fontWeight: isSelected ? 'bold' : 'normal',
                                  }}
                                >
                                  <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      {isSelected && (
                                        <Tooltip title="Kiválasztva">
                                          <ArrowIcon color="primary" fontSize="small" />
                                        </Tooltip>
                                      )}
                                      <Typography variant="body2" fontWeight={isSelected ? 'bold' : 'normal'}>
                                        {candidate.first_name} {candidate.last_name}
                                      </Typography>
                                    </Box>
                                  </TableCell>
                                  <TableCell align="center">{candidate.active_tickets}</TableCell>
                                  <TableCell align="center">{candidate.active_tasks}</TableCell>
                                  <TableCell align="center">{candidate.total_pending_items}</TableCell>
                                  <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                                      <LinearProgress
                                        variant="determinate"
                                        value={Math.min((candidate.total_pending_items / 15) * 100, 100)}
                                        color={severity.color}
                                        sx={{ flex: 1, height: 6, borderRadius: 3 }}
                                      />
                                      <Chip
                                        label={severity.label}
                                        color={severity.color}
                                        size="small"
                                        sx={{ fontSize: '0.65rem', height: 20 }}
                                      />
                                    </Box>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="caption" color="text.secondary">
                                      {candidate.last_assignment_at
                                        ? new Date(candidate.last_assignment_at).toLocaleString('hu-HU')
                                        : 'Nincs'}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Collapse>
                  </Paper>
                )}

                {/* Input Summary */}
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Szimulált bemenet
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip label={`Típus: ${type === 'ticket' ? 'Hibajegy' : 'Feladat'}`} size="small" />
                    {result.input?.item && Object.entries(result.input.item)
                      .filter(([key]) => key !== 'contractor_id')
                      .map(([key, value]) => (
                        <Chip key={key} label={`${key}: ${value}`} size="small" variant="outlined" />
                      ))
                    }
                  </Box>
                </Paper>
              </Stack>
            )}
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
};

export default AutoAssignSimulator;
