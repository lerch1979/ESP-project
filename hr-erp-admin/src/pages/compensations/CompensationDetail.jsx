import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Stack, Tabs, Tab, Button, Chip, TextField, Grid, Divider,
  CircularProgress, IconButton, Table, TableHead, TableRow, TableCell, TableBody,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Select,
  FormControl, InputLabel, Card, CardContent, Tooltip,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon, Refresh as RefreshIcon, PictureAsPdf as PdfIcon,
  Payments as PaymentsIcon, TrendingUp as EscalateIcon, Block as WaiveIcon,
  Send as IssueIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';

const STATUS_CHIP = {
  draft:         { label: 'Piszkozat',         color: 'default' },
  issued:        { label: 'Kiállítva',         color: 'info' },
  notified:      { label: 'Értesítve',         color: 'info' },
  disputed:      { label: 'Vitatott',          color: 'warning' },
  partial_paid:  { label: 'Részben fizetve',   color: 'warning' },
  paid:          { label: 'Kiegyenlítve',      color: 'success' },
  waived:        { label: 'Elengedve',         color: 'default' },
  escalated:     { label: 'Eszkalálva',        color: 'error' },
  closed:        { label: 'Lezárt',            color: 'default' },
};

const TYPE_LABEL = {
  damage: 'Kár', cleaning: 'Takarítás', late_payment: 'Késedelem',
  contract_violation: 'Szerződésszegés', other: 'Egyéb',
};

const REMINDER_LABEL = {
  initial_notification: 'Kezdeti értesítő',
  first_reminder:       'Első emlékeztető',
  final_warning:        'Végső felszólítás',
  escalation:           'Eszkaláció',
  payment_confirmation: 'Fizetési visszaigazolás',
  waiver:               'Elengedés',
};

const fmtMoney = (n, cur = 'HUF') => n == null ? '—' : `${Number(n).toLocaleString('hu-HU')} ${cur}`;
const fmtDate  = (d, withTime) => {
  if (!d) return '—';
  const dt = new Date(d);
  return withTime ? dt.toLocaleString('hu-HU') : dt.toLocaleDateString('hu-HU');
};

export default function CompensationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [paymentDialog, setPaymentDialog] = useState({ open: false, amount: '', method: 'transfer', reference: '', notes: '' });
  const [waiveDialog, setWaiveDialog]     = useState({ open: false, reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inspectionsAPI.getCompensation(id);
      setData(res?.data || null);
    } catch {
      toast.error('Kártérítés betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const issue = async () => {
    setBusy(true);
    try {
      await inspectionsAPI.issueCompensation(id);
      toast.success('Kártérítés kiállítva');
      load();
    } catch (e) {
      toast.error('Kiállítás sikertelen: ' + (e?.response?.data?.message || e.message));
    } finally { setBusy(false); }
  };

  const escalate = async () => {
    if (!window.confirm('Biztosan eszkalálod a kártérítést? A felelős új értesítőt kap.')) return;
    setBusy(true);
    try {
      await inspectionsAPI.escalateCompensation(id);
      toast.success('Eszkalálva');
      load();
    } catch (e) {
      toast.error('Eszkaláció sikertelen');
    } finally { setBusy(false); }
  };

  const savePayment = async () => {
    const amt = Number(paymentDialog.amount);
    if (!amt || amt <= 0) return toast.warn('Adj meg pozitív összeget');
    setBusy(true);
    try {
      await inspectionsAPI.recordCompensationPayment(id, {
        amount: amt,
        method: paymentDialog.method,
        reference: paymentDialog.reference || null,
        notes: paymentDialog.notes || null,
      });
      setPaymentDialog({ open: false, amount: '', method: 'transfer', reference: '', notes: '' });
      toast.success('Fizetés rögzítve');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Fizetés rögzítése sikertelen');
    } finally { setBusy(false); }
  };

  const saveWaive = async () => {
    if (!waiveDialog.reason.trim()) return toast.warn('Indoklás kötelező');
    setBusy(true);
    try {
      await inspectionsAPI.waiveCompensation(id, waiveDialog.reason);
      setWaiveDialog({ open: false, reason: '' });
      toast.success('Elengedve');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Elengedés sikertelen');
    } finally { setBusy(false); }
  };

  const downloadPdf = async () => {
    try {
      const blob = await inspectionsAPI.downloadCompensationNotice(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      toast.error('PDF generálás sikertelen');
    }
  };

  if (loading) return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!data) return <Alert severity="error">Kártérítés nem található (ID: {id}).</Alert>;

  const st = STATUS_CHIP[data.status] || { label: data.status, color: 'default' };
  const canRecordPayment = ['issued','notified','disputed','partial_paid'].includes(data.status);
  const canEscalate      = ['issued','notified','disputed','partial_paid'].includes(data.status) && data.escalationLevel < 3;
  const canWaive         = !['waived','paid','closed'].includes(data.status);
  const canIssue         = data.status === 'draft';

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <IconButton onClick={() => navigate('/compensations')}><ArrowBackIcon /></IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>
          {data.compensationNumber}
        </Typography>
        <IconButton onClick={load}><RefreshIcon /></IconButton>
        <Button variant="outlined" startIcon={<PdfIcon />} onClick={downloadPdf}>PDF</Button>
        {canIssue && (
          <Button variant="contained" color="primary" startIcon={<IssueIcon />} onClick={issue} disabled={busy}>
            Kiállítás
          </Button>
        )}
        {canRecordPayment && (
          <Button variant="contained" color="success" startIcon={<PaymentsIcon />}
                  onClick={() => setPaymentDialog(d => ({ ...d, open: true, amount: String(data.amountOutstanding || '') }))}>
            Fizetés rögzítése
          </Button>
        )}
        {canEscalate && (
          <Button variant="outlined" color="warning" startIcon={<EscalateIcon />} onClick={escalate} disabled={busy}>
            Eszkalálás
          </Button>
        )}
        {canWaive && (
          <Button variant="outlined" color="error" startIcon={<WaiveIcon />} onClick={() => setWaiveDialog({ open: true, reason: '' })}>
            Elengedés
          </Button>
        )}
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip size="small" color={st.color} label={st.label} />
              <Chip size="small" label={TYPE_LABEL[data.compensationType] || data.compensationType} variant="outlined" />
              {data.escalationLevel > 0 && (
                <Chip size="small" color="warning" label={`Eszkalációs szint ${data.escalationLevel}`} />
              )}
            </Stack>
            <Typography variant="body1" sx={{ mt: 1 }}>{data.description}</Typography>
            {data.calculationNotes && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption" color="text.secondary">Számítási jegyzet</Typography>
                <Typography variant="body2">{data.calculationNotes}</Typography>
              </>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={1}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Alapösszeg</Typography>
                  <Typography variant="h6">{fmtMoney(data.amountGross, data.currency)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Befizetve</Typography>
                  <Typography variant="body1" color="success.main">{fmtMoney(data.amountPaid, data.currency)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Hátralék</Typography>
                  <Typography variant="h5" color={data.amountOutstanding > 0 ? 'error.main' : 'success.main'}>
                    {fmtMoney(data.amountOutstanding, data.currency)}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Részletek" />
          <Tab label={`Fizetések (${data.payments?.length || 0})`} />
          <Tab label={`Értesítők (${data.reminders?.length || 0})`} />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 0 && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Felelős fél</Typography>
                <Typography variant="body2">Név: <b>{data.responsibleName || '—'}</b></Typography>
                <Typography variant="body2">E-mail: {data.responsibleEmail || '—'}</Typography>
                <Typography variant="body2">Telefon: {data.responsiblePhone || '—'}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Ingatlan</Typography>
                <Typography variant="body2">Szálláshely: {data.accommodationName || '—'}</Typography>
                <Typography variant="body2">Kapcsolódó ellenőrzés: {data.inspectionId || '—'}</Typography>
                <Typography variant="body2">Szoba: {data.roomId || '—'}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Időpontok</Typography>
                <Typography variant="body2">Létrehozva: {fmtDate(data.createdAt, true)}</Typography>
                <Typography variant="body2">Kiállítva: {fmtDate(data.issuedAt, true)}</Typography>
                <Typography variant="body2">Határidő: {fmtDate(data.dueDate)}</Typography>
                <Typography variant="body2">Utolsó emlékeztető: {fmtDate(data.lastReminderAt, true)}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Terminális állapot</Typography>
                <Typography variant="body2">Kiegyenlítve: {fmtDate(data.paidAt, true)}</Typography>
                <Typography variant="body2">Elengedve: {fmtDate(data.waivedAt, true)}</Typography>
                {data.waivedReason && <Typography variant="body2">Indoklás: {data.waivedReason}</Typography>}
              </Grid>
            </Grid>
          )}

          {tab === 1 && (
            <>
              {(data.payments?.length || 0) === 0 ? (
                <Alert severity="info">Még nincs rögzített fizetés.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Dátum</TableCell>
                      <TableCell>Összeg</TableCell>
                      <TableCell>Módszer</TableCell>
                      <TableCell>Hivatkozás</TableCell>
                      <TableCell>Jegyzet</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.payments.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{fmtDate(p.paid_at, true)}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{fmtMoney(p.amount, p.currency)}</TableCell>
                        <TableCell>{p.method || '—'}</TableCell>
                        <TableCell>{p.reference || '—'}</TableCell>
                        <TableCell>{p.notes || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {tab === 2 && (
            <>
              {(data.reminders?.length || 0) === 0 ? (
                <Alert severity="info">Még nincs elküldött értesítő.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Dátum</TableCell>
                      <TableCell>Típus</TableCell>
                      <TableCell>Csatorna</TableCell>
                      <TableCell>Tárgy</TableCell>
                      <TableCell>Státusz</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.reminders.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{fmtDate(r.sent_at, true)}</TableCell>
                        <TableCell>{REMINDER_LABEL[r.reminder_type] || r.reminder_type}</TableCell>
                        <TableCell>{r.sent_channel}</TableCell>
                        <TableCell>{r.subject || '—'}</TableCell>
                        <TableCell><Chip size="small" label={r.delivery_status || 'sent'} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </Box>
      </Paper>

      {/* Payment dialog */}
      <Dialog open={paymentDialog.open} onClose={() => setPaymentDialog(d => ({ ...d, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle>Fizetés rögzítése</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Összeg" type="number" fullWidth
              value={paymentDialog.amount}
              onChange={e => setPaymentDialog(d => ({ ...d, amount: e.target.value }))}
              helperText={`Hátralék: ${fmtMoney(data.amountOutstanding, data.currency)}`}
            />
            <FormControl fullWidth>
              <InputLabel>Módszer</InputLabel>
              <Select
                value={paymentDialog.method} label="Módszer"
                onChange={e => setPaymentDialog(d => ({ ...d, method: e.target.value }))}
              >
                <MenuItem value="cash">Készpénz</MenuItem>
                <MenuItem value="transfer">Átutalás</MenuItem>
                <MenuItem value="payroll_deduction">Bérlevonás</MenuItem>
                <MenuItem value="card">Kártya</MenuItem>
                <MenuItem value="other">Egyéb</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Hivatkozás" fullWidth
              value={paymentDialog.reference}
              onChange={e => setPaymentDialog(d => ({ ...d, reference: e.target.value }))}
              placeholder="Tranzakció azonosító, nyugtaszám…"
            />
            <TextField
              label="Jegyzet" fullWidth multiline rows={2}
              value={paymentDialog.notes}
              onChange={e => setPaymentDialog(d => ({ ...d, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(d => ({ ...d, open: false }))}>Mégsem</Button>
          <Button variant="contained" onClick={savePayment} disabled={busy}>Mentés</Button>
        </DialogActions>
      </Dialog>

      {/* Waive dialog */}
      <Dialog open={waiveDialog.open} onClose={() => setWaiveDialog({ open: false, reason: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>Elengedés</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Az elengedés végleges: a kártérítés terminális állapotba kerül.
          </Alert>
          <TextField
            label="Indoklás" fullWidth multiline rows={3} required
            value={waiveDialog.reason}
            onChange={e => setWaiveDialog(d => ({ ...d, reason: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWaiveDialog({ open: false, reason: '' })}>Mégsem</Button>
          <Button variant="contained" color="error" onClick={saveWaive} disabled={busy}>Megerősítés</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
