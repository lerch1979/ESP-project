import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Switch, FormControlLabel, TextField, Button,
  Grid, Card, CardContent, Divider, Alert, Chip, Slider, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Tooltip,
} from '@mui/material';
import {
  Warning as WarningIcon, CheckCircle as CheckIcon,
  Psychology as PsychologyIcon, Refresh as RefreshIcon,
  Science as TestIcon, Visibility as ViewIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { nlpAPI } from '../../services/api';

const SENTIMENT_COLORS = {
  CRISIS: '#dc2626',
  DEPRESSED: '#f97316',
  CONFLICT: '#eab308',
  ANXIOUS: '#3b82f6',
  NEUTRAL: '#64748b',
  POSITIVE: '#16a34a',
};

const URGENCY_LABELS = {
  critical: { label: 'Kritikus', color: '#dc2626' },
  high: { label: 'Magas', color: '#f97316' },
  medium: { label: 'Közepes', color: '#eab308' },
  low: { label: 'Alacsony', color: '#16a34a' },
};

export default function SentimentDashboard() {
  const [config, setConfig] = useState(null);
  const [stats, setStats] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [reviewDialog, setReviewDialog] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [configRes, statsRes, alertsRes] = await Promise.all([
        nlpAPI.getConfig().catch(() => ({ data: { enabled: false } })),
        nlpAPI.getStats().catch(() => ({ data: [] })),
        nlpAPI.getAlerts({ limit: 20 }).catch(() => ({ data: [] })),
      ]);
      setConfig(configRes.data);
      setStats(statsRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch {
      toast.error('Betöltési hiba');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const res = await nlpAPI.updateConfig(config);
      setConfig(res.data);
      toast.success('Beállítások mentve');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (testText.trim().length < 5) return;
    setTesting(true);
    try {
      const res = await nlpAPI.testAnalysis(testText);
      setTestResult(res.data);
    } catch {
      toast.error('Teszt hiba');
    } finally {
      setTesting(false);
    }
  };

  const handleReview = async () => {
    if (!reviewDialog) return;
    try {
      await nlpAPI.reviewAlert(reviewDialog.id, reviewNotes);
      toast.success('Felülvizsgálat rögzítve');
      setReviewDialog(null);
      setReviewNotes('');
      loadData();
    } catch {
      toast.error('Hiba történt');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PsychologyIcon /> NLP Hangulatelemzés
      </Typography>

      {/* Disabled Warning */}
      {!config?.enabled && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <strong>A funkció jelenleg KIKAPCSOLT.</strong> Az NLP hangulatelemzés alapértelmezetten ki van kapcsolva.
          GDPR megfelelőség és felhasználói hozzájárulás szükséges az aktiváláshoz.
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Config Panel */}
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Beállítások</Typography>
            <Divider sx={{ mb: 2 }} />

            <FormControlLabel
              control={<Switch checked={config?.enabled || false}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />}
              label="NLP elemzés engedélyezve"
              sx={{ mb: 2, display: 'block' }}
            />

            <FormControlLabel
              control={<Switch checked={config?.require_user_consent ?? true}
                onChange={(e) => setConfig({ ...config, require_user_consent: e.target.checked })} />}
              label="Felhasználói hozzájárulás szükséges"
              sx={{ mb: 2, display: 'block' }}
            />

            <FormControlLabel
              control={<Switch checked={config?.auto_escalate_critical ?? true}
                onChange={(e) => setConfig({ ...config, auto_escalate_critical: e.target.checked })} />}
              label="Automatikus eszkaláció: KRITIKUS"
              sx={{ mb: 2, display: 'block' }}
            />

            <FormControlLabel
              control={<Switch checked={config?.auto_escalate_high || false}
                onChange={(e) => setConfig({ ...config, auto_escalate_high: e.target.checked })} />}
              label="Automatikus eszkaláció: MAGAS"
              sx={{ mb: 2, display: 'block' }}
            />

            <Typography gutterBottom>
              Megbízhatósági küszöb: {((config?.confidence_threshold || 0.80) * 100).toFixed(0)}%
            </Typography>
            <Slider
              value={(config?.confidence_threshold || 0.80) * 100}
              onChange={(_, v) => setConfig({ ...config, confidence_threshold: v / 100 })}
              min={50} max={99} step={1}
              valueLabelDisplay="auto" valueLabelFormat={(v) => `${v}%`}
              sx={{ mb: 3 }}
            />

            <Button variant="contained" onClick={handleSaveConfig} disabled={saving}>
              {saving ? 'Mentés...' : 'Mentés'}
            </Button>
          </Paper>

          {/* Test Panel */}
          <Paper sx={{ p: 3, mt: 3 }}>
            <Typography variant="h6" gutterBottom>Teszt elemzés</Typography>
            <Divider sx={{ mb: 2 }} />
            <TextField
              label="Teszt szöveg"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              fullWidth multiline rows={3} sx={{ mb: 2 }}
              placeholder="Írj be egy mintaszöveget az elemzés teszteléséhez..."
            />
            <Button variant="outlined" onClick={handleTest} disabled={testing}
              startIcon={<TestIcon />}>
              {testing ? 'Elemzés...' : 'Elemzés tesztelése'}
            </Button>

            {testResult && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#f8fafc', borderRadius: 1 }}>
                <Chip label={testResult.sentiment} size="small"
                  sx={{ bgcolor: SENTIMENT_COLORS[testResult.sentiment], color: '#fff', mr: 1 }} />
                <Chip label={URGENCY_LABELS[testResult.urgency]?.label}
                  size="small" variant="outlined" sx={{ mr: 1 }} />
                <Chip label={`${(testResult.confidence * 100).toFixed(0)}%`} size="small" />
                <Typography variant="body2" sx={{ mt: 1 }}>{testResult.recommended_action}</Typography>
                {testResult.keywords?.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {testResult.keywords.map((kw, i) => (
                      <Chip key={i} label={kw} size="small" variant="outlined" />
                    ))}
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Módszer: {testResult._method === 'claude' ? 'Claude AI' : 'Kulcsszó alapú'}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Stats + Alerts Panel */}
        <Grid item xs={12} md={7}>
          {/* Stats Cards */}
          {stats.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Elemzési statisztikák (30 nap)</Typography>
                <IconButton onClick={loadData} size="small"><RefreshIcon /></IconButton>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={1}>
                {stats.map((s, i) => (
                  <Grid item xs={6} sm={4} key={i}>
                    <Card variant="outlined">
                      <CardContent sx={{ py: 1.5, textAlign: 'center' }}>
                        <Chip label={s.sentiment} size="small"
                          sx={{ bgcolor: SENTIMENT_COLORS[s.sentiment] || '#94a3b8', color: '#fff', mb: 0.5 }} />
                        <Typography variant="h5" fontWeight={700}>{s.count}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {URGENCY_LABELS[s.urgency]?.label} | {(s.avg_confidence * 100).toFixed(0)}%
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          )}

          {/* Alerts Table */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              <WarningIcon sx={{ verticalAlign: 'middle', mr: 1, color: '#f97316' }} />
              Riasztások
            </Typography>
            <Divider sx={{ mb: 2 }} />

            {alerts.length === 0 ? (
              <Alert severity="success">Nincs aktív riasztás</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Sürgősség</TableCell>
                      <TableCell>Hangulat</TableCell>
                      <TableCell>Munkavállaló</TableCell>
                      <TableCell>Dátum</TableCell>
                      <TableCell>Megbízhatóság</TableCell>
                      <TableCell align="center">Művelet</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {alerts.map((alert) => (
                      <TableRow key={alert.id} sx={{
                        bgcolor: alert.urgency === 'critical' ? '#fef2f2'
                          : alert.urgency === 'high' ? '#fff7ed' : undefined,
                      }}>
                        <TableCell>
                          <Chip label={URGENCY_LABELS[alert.urgency]?.label}
                            size="small" sx={{
                              bgcolor: URGENCY_LABELS[alert.urgency]?.color, color: '#fff',
                            }} />
                        </TableCell>
                        <TableCell>
                          <Chip label={alert.sentiment} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>{alert.user_name}</TableCell>
                        <TableCell>
                          {new Date(alert.analyzed_at).toLocaleString('hu-HU', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>{(alert.confidence * 100).toFixed(0)}%</TableCell>
                        <TableCell align="center">
                          {alert.escalated ? (
                            <Tooltip title="Felülvizsgálva">
                              <CheckIcon color="success" fontSize="small" />
                            </Tooltip>
                          ) : (
                            <Tooltip title="Felülvizsgálás">
                              <IconButton size="small" onClick={() => { setReviewDialog(alert); setReviewNotes(''); }}>
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
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

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onClose={() => setReviewDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Riasztás felülvizsgálata</DialogTitle>
        <DialogContent>
          {reviewDialog && (
            <>
              <Box sx={{ mb: 2 }}>
                <Chip label={reviewDialog.sentiment}
                  sx={{ bgcolor: SENTIMENT_COLORS[reviewDialog.sentiment], color: '#fff', mr: 1 }} />
                <Chip label={URGENCY_LABELS[reviewDialog.urgency]?.label}
                  sx={{ bgcolor: URGENCY_LABELS[reviewDialog.urgency]?.color, color: '#fff' }} />
              </Box>
              <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic' }}>
                "{reviewDialog.pulse_note}"
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Javaslat:</strong> {reviewDialog.recommended_action}
              </Typography>
              <TextField
                label="Felülvizsgálati megjegyzések"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                fullWidth multiline rows={3}
                placeholder="Mi történt? Milyen lépéseket tettél?"
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialog(null)}>Mégse</Button>
          <Button variant="contained" onClick={handleReview}>Felülvizsgálva</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
