import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Stack, Chip, Grid, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, Divider,
} from '@mui/material';
import {
  Email as EmailIcon, Refresh as RefreshIcon,
  Visibility as ViewIcon, Lock as LockIcon, Warning as WarningIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { emailAssistantAdminAPI } from '../../services/api';

// Tints used to highlight rows by confidence band — same conceptual mapping
// as the service: ≥0.85 high (green), 0.6-0.85 medium (amber), <0.6 low (orange).
const ROW_BG = {
  high:    'transparent',
  medium:  '#fffbeb',
  low:     '#ffedd5',
  unknown: '#f3f4f6',
  error:   '#fee2e2',
};

function classifyRow(row) {
  if (row.action_type === 'error')           return 'error';
  if (row.action_type === 'unknown_sender')  return 'unknown';
  if (row.confidence == null)                return 'unknown';
  const c = Number(row.confidence);
  if (c >= 0.85) return 'high';
  if (c >= 0.6)  return 'medium';
  return 'low';
}

const fmtDateTime = (s) => s ? new Date(s).toLocaleString('hu-HU') : '—';
const pct = (n) => n == null ? '—' : `${Math.round(Number(n) * 100)}%`;

// ── Phase pill mapping (matches backend status.phase derivation) ─────
const PHASE = {
  observation: { label: 'Megfigyelési mód',    color: 'info',    icon: '🟢' },
  actions:     { label: 'Akciók engedélyezve', color: 'warning', icon: '🟡' },
  full:        { label: 'Teljes mód (válasz)', color: 'success', icon: '🔵' },
  custom:      { label: 'Egyedi konfiguráció', color: 'default', icon: '⚙️' },
  disabled:    { label: 'Ki van kapcsolva',    color: 'default', icon: '⚪' },
};

const INTENT_OPTIONS = [
  { value: 'all', label: 'Mind' },
  { value: 'ticket', label: 'Hibajegy' },
  { value: 'damage_report', label: 'Kárigény' },
  { value: 'faq', label: 'GYIK' },
  { value: 'data_query', label: 'Adat lekérdezés' },
  { value: 'emergency', label: 'Vészhelyzet' },
  { value: 'unknown', label: 'Ismeretlen' },
];

const ACTION_OPTIONS = [
  { value: 'all',            label: 'Mind' },
  { value: 'logged_only',    label: 'Csak naplózva' },
  { value: 'unknown_sender', label: 'Ismeretlen feladó' },
  { value: 'error',          label: 'Hiba' },
  { value: 'create_ticket',  label: 'Hibajegy létrehozva' },
  { value: 'emergency',      label: 'Vészhelyzet kezelve' },
];

export default function EmailAssistantLogs() {
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailRow, setDetailRow] = useState(null);

  const [filters, setFilters] = useState({
    intent: 'all',
    action: 'all',
    confidence_min: '',
    search: '',
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const queryParams = useMemo(() => ({
    intent: filters.intent,
    action: filters.action,
    confidence_min: filters.confidence_min || undefined,
    search: filters.search || undefined,
    page: page + 1,
    limit: rowsPerPage,
  }), [filters, page, rowsPerPage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, st, lg] = await Promise.allSettled([
        emailAssistantAdminAPI.status(),
        emailAssistantAdminAPI.stats(7),
        emailAssistantAdminAPI.logs(queryParams),
      ]);
      if (s.status  === 'fulfilled' && s.value?.success)  setStatus(s.value.data);
      if (st.status === 'fulfilled' && st.value?.success) setStats(st.value.data);
      if (lg.status === 'fulfilled' && lg.value?.success) {
        setRows(lg.value.data.interactions || []);
        setTotal(lg.value.data.pagination?.total || 0);
      }
    } catch {
      toast.error('Email asszisztens adatok betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (k, v) => {
    setFilters(prev => ({ ...prev, [k]: v }));
    setPage(0);
  };

  // ─── Render bits ────────────────────────────────────────────────────

  const flagPill = (label, on) => (
    <Chip
      size="small"
      icon={on ? <CheckIcon /> : <LockIcon />}
      label={`${label}: ${on ? 'BE' : 'KI'}`}
      color={on ? 'success' : 'default'}
      variant={on ? 'filled' : 'outlined'}
    />
  );

  const StatCard = ({ label, value, color = 'inherit' }) => (
    <Paper sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color, mt: 0.5 }}>
        {value ?? '—'}
      </Typography>
    </Paper>
  );

  const phaseInfo = status?.phase ? PHASE[status.phase] || PHASE.custom : PHASE.disabled;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <EmailIcon sx={{ fontSize: 32, color: '#2563eb' }} />
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Email asszisztens logok
          </Typography>
        </Stack>
        <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          Frissítés
        </Button>
      </Stack>

      {/* ── Status panel ─────────────────────────────────────────── */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
              Állapot
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <Typography variant="h6">{phaseInfo.icon}</Typography>
              <Chip
                label={phaseInfo.label}
                color={phaseInfo.color}
                sx={{ fontWeight: 600 }}
              />
            </Stack>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
              Funkció kapcsolók
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 1 }}>
              {flagPill('ENABLED', !!status?.flags?.enabled)}
              {flagPill('ACTIONS', !!status?.flags?.actions_enabled)}
              {flagPill('REPLY',   !!status?.flags?.reply_enabled)}
              {flagPill('GMAIL',   !!status?.flags?.gmail_polling)}
            </Stack>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
              Polling
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Gmail lekérdezés: minden {status?.polling_interval_minutes ?? '?'} percben
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Utolsó interakció: {fmtDateTime(status?.last_interaction_at)}
            </Typography>
          </Box>
        </Stack>

        {/* Phase controls — visible but disabled until DB-backed config lands */}
        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
          <Tooltip title={status?.toggles_note || 'Csak .env szerkesztéssel + újraindítással módosítható'}>
            <span>
              <Button size="small" variant="outlined" disabled startIcon={<LockIcon />}>
                Akciók engedélyezése (Phase 2)
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={status?.toggles_note || 'Csak .env szerkesztéssel + újraindítással módosítható'}>
            <span>
              <Button size="small" variant="outlined" disabled startIcon={<LockIcon />}>
                Auto-válasz engedélyezése (Phase 3)
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={status?.toggles_note || 'Csak .env szerkesztéssel + újraindítással módosítható'}>
            <span>
              <Button size="small" variant="outlined" color="error" disabled startIcon={<WarningIcon />}>
                Mind kikapcsolása
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Paper>

      {/* ── Stats grid ───────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={2}><StatCard label={`Össz (${stats?.days || 7}n)`} value={stats?.total} /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Magas konf."   value={stats?.high_conf}      color="#16a34a" /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Közepes konf." value={stats?.medium_conf}    color="#eab308" /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Alacsony konf."value={stats?.low_conf}       color="#ea580c" /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Ismeretlen"    value={stats?.unknown_sender} /></Grid>
        <Grid item xs={6} md={2}><StatCard label="Hiba"          value={stats?.errors}         color="#dc2626" /></Grid>
      </Grid>

      {/* ── Filters ──────────────────────────────────────────────── */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid item xs={12} sm={3}>
            <TextField
              fullWidth size="small" label="Keresés"
              placeholder="Feladó, tárgy, törzs..."
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
            />
          </Grid>
          <Grid item xs={6} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Intent</InputLabel>
              <Select value={filters.intent} label="Intent" onChange={e => setFilter('intent', e.target.value)}>
                {INTENT_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Action</InputLabel>
              <Select value={filters.action} label="Action" onChange={e => setFilter('action', e.target.value)}>
                {ACTION_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Min. konfidencia</InputLabel>
              <Select
                value={filters.confidence_min}
                label="Min. konfidencia"
                onChange={e => setFilter('confidence_min', e.target.value)}
              >
                <MenuItem value=""><em>Bármi</em></MenuItem>
                <MenuItem value="0.85">≥ 85%</MenuItem>
                <MenuItem value="0.6">≥ 60%</MenuItem>
                <MenuItem value="0">≥ 0%</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* ── Table ────────────────────────────────────────────────── */}
      <Paper>
        {loading ? (
          <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Idő</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Feladó</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tárgy</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Intent</TableCell>
                    <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Konf.</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                    <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>Nincs találat</TableCell></TableRow>
                  ) : rows.map(r => {
                    const cls = classifyRow(r);
                    return (
                      <TableRow
                        key={r.id}
                        hover
                        sx={{ cursor: 'pointer', bgcolor: ROW_BG[cls] }}
                        onClick={() => setDetailRow(r)}
                      >
                        <TableCell>{fmtDateTime(r.created_at)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {r.user_name || '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {r.email_from}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.email_subject || '(nincs tárgy)'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {r.intent ? <Chip size="small" label={r.intent} variant="outlined" /> : '—'}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>
                          {pct(r.confidence)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={r.action_type || '—'}
                            color={r.action_type === 'error' ? 'error'
                              : r.action_type === 'unknown_sender' ? 'default'
                              : r.action_type === 'logged_only' ? 'info'
                              : r.action_type ? 'success' : 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right' }}>
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
              count={total}
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

      {/* ── Detail modal ─────────────────────────────────────────── */}
      <Dialog open={!!detailRow} onClose={() => setDetailRow(null)} maxWidth="md" fullWidth>
        {detailRow && (
          <>
            <DialogTitle sx={{ fontWeight: 600 }}>
              Email interakció részletei
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>BEÉRKEZETT</Typography>
                  <Typography variant="body2">{fmtDateTime(detailRow.created_at)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>FELADÓ</Typography>
                  <Typography variant="body2">{detailRow.email_from}</Typography>
                  {detailRow.user_name && (
                    <Typography variant="caption" color="text.secondary">
                      Megtalált felhasználó: {detailRow.user_name} ({detailRow.user_email})
                    </Typography>
                  )}
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>TÁRGY</Typography>
                  <Typography variant="body2">{detailRow.email_subject || '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>TÖRZS</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#fafafa', maxHeight: 200, overflow: 'auto' }}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
                      {detailRow.email_body || '(üres)'}
                    </Typography>
                  </Paper>
                </Box>
                <Divider />
                <Stack direction="row" spacing={3}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>INTENT</Typography>
                    <Typography variant="body1">{detailRow.intent || '—'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>KONFIDENCIA</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>{pct(detailRow.confidence)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>ACTION</Typography>
                    <Typography variant="body1">{detailRow.action_type || '—'}</Typography>
                  </Box>
                </Stack>
                {detailRow.notes && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>JEGYZET</Typography>
                    <Typography variant="body2">{detailRow.notes}</Typography>
                  </Box>
                )}
                {detailRow.created_ticket_id && (
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>LÉTREHOZOTT REKORDOK</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <Button size="small" variant="outlined" href={`/tickets/${detailRow.created_ticket_id}`}>
                        Hibajegy megnyitása
                      </Button>
                    </Stack>
                  </Box>
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailRow(null)}>Bezárás</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
