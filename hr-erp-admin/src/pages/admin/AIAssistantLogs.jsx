import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Stack, Grid, Chip, IconButton, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, FormControl, InputLabel, Select, MenuItem, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Divider,
  Avatar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Visibility as ViewIcon,
  SmartToy as BotIcon,
} from '@mui/icons-material';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend,
} from 'recharts';
import { toast } from 'react-toastify';
import { aiAssistantAPI } from '../../services/api';
import UserAvatar from '../../components/common/UserAvatar';

const INTENT_LABELS = {
  ticket:        { label: 'Hibajegy',     color: '#2563eb' },
  damage_report: { label: 'Kárigény',     color: '#f59e0b' },
  faq:           { label: 'GYIK',         color: '#06b6d4' },
  data_query:    { label: 'Adatlekérés',  color: '#8b5cf6' },
  emergency:     { label: 'VÉSZHELYZET',  color: '#dc2626' },
  unknown:       { label: 'Ismeretlen',   color: '#94a3b8' },
};

const FEEDBACK_LABEL = {
  helpful:     { label: '👍 Hasznos',    color: 'success' },
  not_helpful: { label: '👎 Nem hasznos', color: 'error' },
};

const fmtTs = (s) => s ? new Date(s).toLocaleString('hu-HU') : '—';
const fmtPct = (n) => (n === null || n === undefined) ? '—' : `${Math.round(Number(n) * 100)}%`;

function StatCard({ label, value, sub, color = 'inherit' }) {
  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color, mt: 0.5 }}>
        {value ?? '—'}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
          {sub}
        </Typography>
      )}
    </Paper>
  );
}

export default function AIAssistantLogs() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [detailRow, setDetailRow] = useState(null);

  // Filters
  const [filters, setFilters] = useState({
    intent: 'all',
    success: 'all',
    feedback: 'all',
    search: '',
    from: '',
    to: '',
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const queryParams = useMemo(() => ({
    intent:   filters.intent,
    success:  filters.success === 'all' ? undefined : filters.success,
    feedback: filters.feedback,
    search:   filters.search || undefined,
    from:     filters.from || undefined,
    to:       filters.to || undefined,
    page:     page + 1,
    limit:    rowsPerPage,
  }), [filters, page, rowsPerPage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await aiAssistantAPI.adminLogs(queryParams);
      if (res.success) {
        setRows(res.data.messages || []);
        setStats(res.data.stats || null);
      }
    } catch (err) {
      const msg = err?.response?.status === 403
        ? 'Csak superadmin férhet hozzá ehhez az oldalhoz.'
        : 'AI logok betöltése sikertelen';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => {
    setFilters(prev => ({ ...prev, [k]: v }));
    setPage(0);
  };

  // Pie chart data
  const intentChartData = useMemo(() => {
    const byIntent = stats?.by_intent || {};
    return Object.entries(byIntent).map(([key, value]) => ({
      key,
      name: INTENT_LABELS[key]?.label || key,
      value: Number(value) || 0,
      color: INTENT_LABELS[key]?.color || '#94a3b8',
    }));
  }, [stats]);

  const successRate = stats?.total
    ? Math.round((stats.success_count / stats.total) * 100)
    : null;

  const feedbackTotal = (stats?.helpful_count || 0) + (stats?.not_helpful_count || 0);
  const satisfactionRate = feedbackTotal
    ? Math.round((stats.helpful_count / feedbackTotal) * 100)
    : null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} mb={3} spacing={1}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Avatar sx={{ bgcolor: '#2563eb' }}><BotIcon /></Avatar>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>AI Asszisztens — Logok</Typography>
            <Typography variant="caption" color="text.secondary">
              Minden AI interakció: szándék, akciók, visszajelzések
            </Typography>
          </Box>
        </Stack>
        <Button startIcon={<RefreshIcon />} onClick={load}>Frissítés</Button>
      </Stack>

      {/* Stats cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={2}>
          <StatCard label="Összes üzenet" value={stats?.total ?? 0} />
        </Grid>
        <Grid item xs={6} md={2}>
          <StatCard label="Sikeres akció" value={stats?.success_count ?? 0}
            sub={successRate !== null ? `${successRate}% sikerarány` : null}
            color="#16a34a" />
        </Grid>
        <Grid item xs={6} md={2}>
          <StatCard label="Átlag bizalom"
            value={stats?.avg_confidence !== null && stats?.avg_confidence !== undefined
              ? fmtPct(stats.avg_confidence) : '—'}
            color="#2563eb" />
        </Grid>
        <Grid item xs={6} md={2}>
          <StatCard label="Hasznos (👍)" value={stats?.helpful_count ?? 0} color="#16a34a" />
        </Grid>
        <Grid item xs={6} md={2}>
          <StatCard label="Nem hasznos (👎)" value={stats?.not_helpful_count ?? 0} color="#dc2626" />
        </Grid>
        <Grid item xs={6} md={2}>
          <StatCard label="Elégedettség"
            value={satisfactionRate !== null ? `${satisfactionRate}%` : '—'}
            sub={feedbackTotal ? `${feedbackTotal} visszajelzés` : 'nincs feedback'}
            color="#2563eb" />
        </Grid>
      </Grid>

      {/* Intent breakdown chart */}
      {intentChartData.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Szándékok megoszlása
          </Typography>
          <Box sx={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={intentChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                >
                  {intentChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <RTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Paper>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField fullWidth size="small" label="Keresés (üzenet vagy válasz)"
              value={filters.search} onChange={e => setFilter('search', e.target.value)} />
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Szándék</InputLabel>
              <Select value={filters.intent} label="Szándék" onChange={e => setFilter('intent', e.target.value)}>
                <MenuItem value="all">Mind</MenuItem>
                {Object.entries(INTENT_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Akció</InputLabel>
              <Select value={filters.success} label="Akció" onChange={e => setFilter('success', e.target.value)}>
                <MenuItem value="all">Mind</MenuItem>
                <MenuItem value="true">Sikeres</MenuItem>
                <MenuItem value="false">Sikertelen</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Visszajelzés</InputLabel>
              <Select value={filters.feedback} label="Visszajelzés" onChange={e => setFilter('feedback', e.target.value)}>
                <MenuItem value="all">Mind</MenuItem>
                <MenuItem value="helpful">👍 Hasznos</MenuItem>
                <MenuItem value="not_helpful">👎 Nem hasznos</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <TextField fullWidth size="small" type="date" label="-tól" InputLabelProps={{ shrink: true }}
              value={filters.from} onChange={e => setFilter('from', e.target.value)} />
          </Grid>
          <Grid item xs={6} sm={3} md={1.5}>
            <TextField fullWidth size="small" type="date" label="-ig" InputLabelProps={{ shrink: true }}
              value={filters.to} onChange={e => setFilter('to', e.target.value)} />
          </Grid>
        </Grid>
      </Paper>

      {/* Logs table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Időpont</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Felhasználó</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Üzenet</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Szándék</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Akció</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Sikerült</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>FB</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                        Még nincs AI interakció a kiválasztott szűrőkkel.
                      </TableCell>
                    </TableRow>
                  ) : rows.map(r => {
                    const intent = INTENT_LABELS[r.intent] || INTENT_LABELS.unknown;
                    const fb = r.user_feedback ? FEEDBACK_LABEL[r.user_feedback] : null;
                    return (
                      <TableRow key={r.id} hover sx={{ cursor: 'pointer' }} onClick={() => setDetailRow(r)}>
                        <TableCell>
                          <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                            {fmtTs(r.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <UserAvatar firstName={r.user_name?.split(' ')?.[0]} lastName={r.user_name?.split(' ')?.[1]} size={28} />
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                {r.user_name || '—'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 150 }}>
                                {r.user_email}
                              </Typography>
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Typography variant="body2" noWrap title={r.user_message}>
                            {r.user_message?.slice(0, 80) || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Chip size="small" label={intent.label}
                              sx={{ bgcolor: `${intent.color}22`, color: intent.color, fontWeight: 600, height: 22 }} />
                            <Typography variant="caption" color="text.secondary">
                              {fmtPct(r.confidence)}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {r.action_type && (
                            <Chip size="small" variant="outlined" label={r.action_type} sx={{ height: 22 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          {r.action_success === true && <CheckIcon fontSize="small" sx={{ color: '#16a34a' }} />}
                          {r.action_success === false && <CancelIcon fontSize="small" sx={{ color: '#dc2626' }} />}
                        </TableCell>
                        <TableCell>
                          {fb && (
                            <Tooltip title={r.feedback_comment || ''}>
                              {r.user_feedback === 'helpful'
                                ? <ThumbUpIcon sx={{ fontSize: 18, color: '#16a34a' }} />
                                : <ThumbDownIcon sx={{ fontSize: 18, color: '#dc2626' }} />}
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Részletek">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDetailRow(r); }}>
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={stats?.total ?? rows.length}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[25, 50, 100, 200]}
              labelRowsPerPage="Soronként:"
            />
          </>
        )}
      </Paper>

      {/* Detail modal */}
      <Dialog open={!!detailRow} onClose={() => setDetailRow(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" spacing={1}>
            <BotIcon sx={{ color: '#2563eb' }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>AI interakció részletek</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {detailRow && (() => {
            const intent = INTENT_LABELS[detailRow.intent] || INTENT_LABELS.unknown;
            return (
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Időpont</Typography>
                  <Typography variant="body2">{fmtTs(detailRow.created_at)}</Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">Felhasználó</Typography>
                  <Typography variant="body2">{detailRow.user_name} — {detailRow.user_email}</Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">Felhasználó üzenete</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: '#f8fafc' }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                      {detailRow.user_message}
                    </Typography>
                    {detailRow.user_language && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        Nyelv: {detailRow.user_language}
                      </Typography>
                    )}
                  </Paper>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">AI elemzés</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    <Chip size="small" label={intent.label}
                      sx={{ bgcolor: `${intent.color}22`, color: intent.color, fontWeight: 600 }} />
                    <Chip size="small" label={`Bizalom: ${fmtPct(detailRow.confidence)}`} variant="outlined" />
                  </Stack>
                  {detailRow.entities && Object.keys(detailRow.entities).length > 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: '#f8fafc' }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                        Entities:
                      </Typography>
                      <Box component="pre" sx={{ m: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                        {JSON.stringify(detailRow.entities, null, 2)}
                      </Box>
                    </Paper>
                  )}
                </Box>

                {detailRow.ai_response && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">AI válasz</Typography>
                    <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: '#eff6ff' }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {detailRow.ai_response}
                      </Typography>
                    </Paper>
                  </Box>
                )}

                {detailRow.action_type && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Akció</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                      <Chip size="small" label={detailRow.action_type} variant="outlined" />
                      {detailRow.action_success === true && <CheckIcon fontSize="small" sx={{ color: '#16a34a' }} />}
                      {detailRow.action_success === false && <CancelIcon fontSize="small" sx={{ color: '#dc2626' }} />}
                    </Stack>
                    {detailRow.action_params && (
                      <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: '#f8fafc' }}>
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                          Action params:
                        </Typography>
                        <Box component="pre" sx={{ m: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                          {JSON.stringify(detailRow.action_params, null, 2)}
                        </Box>
                      </Paper>
                    )}
                    {detailRow.action_result && (
                      <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: '#f8fafc' }}>
                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                          Action result:
                        </Typography>
                        <Box component="pre" sx={{ m: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                          {JSON.stringify(detailRow.action_result, null, 2)}
                        </Box>
                      </Paper>
                    )}
                  </Box>
                )}

                {(detailRow.created_ticket_id || detailRow.created_damage_report_id || detailRow.created_task_id) && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Létrehozott rekordok</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                      {detailRow.created_ticket_id && (
                        <Button size="small" variant="outlined"
                          onClick={() => navigate(`/tickets/${detailRow.created_ticket_id}`)}>
                          Hibajegy megnyitása
                        </Button>
                      )}
                      {detailRow.created_damage_report_id && (
                        <Button size="small" variant="outlined"
                          onClick={() => navigate(`/damage-reports/${detailRow.created_damage_report_id}`)}>
                          Kárigény megnyitása
                        </Button>
                      )}
                      {detailRow.created_task_id && (
                        <Button size="small" variant="outlined"
                          onClick={() => navigate(`/teendok`)}>
                          Feladat megnyitása
                        </Button>
                      )}
                    </Stack>
                  </Box>
                )}

                {detailRow.user_feedback && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Felhasználói visszajelzés</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                      <Chip
                        size="small"
                        label={FEEDBACK_LABEL[detailRow.user_feedback]?.label}
                        color={FEEDBACK_LABEL[detailRow.user_feedback]?.color}
                      />
                      {detailRow.feedback_comment && (
                        <Typography variant="body2" color="text.secondary">
                          „{detailRow.feedback_comment}”
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                )}
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailRow(null)}>Bezárás</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
