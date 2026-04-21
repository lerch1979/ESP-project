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
  Send as IssueIcon, Email as EmailIcon, Groups as GroupsIcon,
  Gavel as DisputeIcon, AccountBalance as DeductionIcon, CheckCircle as ResolveIcon,
  Add as AddIcon, Delete as DeleteIcon, TouchApp as OnSiteIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { inspectionsAPI } from '../../services/api';
import OnSitePaymentModal from './OnSitePaymentModal';

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
  const [allocDialog, setAllocDialog]     = useState({ open: false, parties: [] });
  const [disputeDialog, setDisputeDialog] = useState({ open: false, reason: '' });
  const [resolveDialog, setResolveDialog] = useState({ open: false, outcome: 'upheld', notes: '', newAmount: '' });
  const [deductDialog, setDeductDialog]   = useState({ open: false, employee_name: '', amount_per_period: '', periods_total: 3, start_date: new Date().toISOString().slice(0, 10), notes: '' });
  const [busy, setBusy] = useState(false);
  const [residents, setResidents] = useState([]);
  const [onSiteModal, setOnSiteModal] = useState({ open: false, resident: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resp, resRes] = await Promise.all([
        inspectionsAPI.getCompensation(id),
        inspectionsAPI.listCompensationResidents(id).catch(() => ({ data: [] })),
      ]);
      setData(resp?.data || null);
      setResidents(resRes?.data || []);
    } catch {
      toast.error('Kártérítés betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const convertResidentToDeduction = async (resident) => {
    if (!window.confirm(`Bérlevonássá konvertálod ${resident.resident_name} hátralékát (3 hó)?`)) return;
    setBusy(true);
    try {
      await inspectionsAPI.convertResidentToDeduction(resident.id, { months: 3 });
      toast.success('Bérlevonás ütemezve');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Konverzió sikertelen');
    } finally { setBusy(false); }
  };

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

  const sendEmail = async () => {
    if (!window.confirm('Elküldöd a PDF értesítőt a felelős félnek/feleknek?')) return;
    setBusy(true);
    try {
      const res = await inspectionsAPI.sendCompensationNotice(id);
      const r = res?.data || {};
      if (r.skipped) {
        toast.warning(`Nem küldve: ${r.reason === 'SMTP_NOT_CONFIGURED' ? 'SMTP nincs beállítva' : 'nincs e-mail cím'}`);
      } else {
        toast.success(`Elküldve: ${r.sent || 0}${r.failed ? ` (sikertelen: ${r.failed})` : ''}`);
      }
      load();
    } catch (e) {
      toast.error('E-mail küldés sikertelen: ' + (e?.response?.data?.message || e.message));
    } finally { setBusy(false); }
  };

  const saveAllocation = async () => {
    const total = allocDialog.parties.reduce((s, p) => s + Number(p.percentage || 0), 0);
    if (Math.abs(total - 100) > 0.01) return toast.warn(`Az összeg 100% kell legyen (jelenleg ${total})`);
    if (allocDialog.parties.some(p => !p.name?.trim())) return toast.warn('Minden félnek kell név');
    setBusy(true);
    try {
      await inspectionsAPI.allocateResponsibilities(id, allocDialog.parties.map(p => ({
        name: p.name.trim(),
        email: p.email || null,
        phone: p.phone || null,
        percentage: Number(p.percentage),
      })));
      setAllocDialog({ open: false, parties: [] });
      toast.success('Allokáció mentve');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Allokáció sikertelen');
    } finally { setBusy(false); }
  };

  const saveDispute = async () => {
    if (!disputeDialog.reason.trim()) return toast.warn('Indoklás kötelező');
    setBusy(true);
    try {
      await inspectionsAPI.submitDispute(id, disputeDialog.reason);
      setDisputeDialog({ open: false, reason: '' });
      toast.success('Vitatás bejelentve');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Vitatás sikertelen');
    } finally { setBusy(false); }
  };

  const saveResolve = async () => {
    if (resolveDialog.outcome === 'reduced' && !resolveDialog.newAmount) return toast.warn('Új összeg kötelező');
    setBusy(true);
    try {
      const payload = { outcome: resolveDialog.outcome, notes: resolveDialog.notes || null };
      if (resolveDialog.outcome === 'reduced') payload.new_amount = Number(resolveDialog.newAmount);
      await inspectionsAPI.resolveDispute(id, payload);
      setResolveDialog({ open: false, outcome: 'upheld', notes: '', newAmount: '' });
      toast.success('Vitatás lezárva');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Lezárás sikertelen');
    } finally { setBusy(false); }
  };

  const saveDeduction = async () => {
    if (!deductDialog.employee_name?.trim()) return toast.warn('Alkalmazott név kötelező');
    if (!Number(deductDialog.amount_per_period)) return toast.warn('Havi összeg kötelező');
    setBusy(true);
    try {
      await inspectionsAPI.scheduleSalaryDeduction(id, {
        employee_name: deductDialog.employee_name.trim(),
        amount_per_period: Number(deductDialog.amount_per_period),
        periods_total: Number(deductDialog.periods_total),
        start_date: deductDialog.start_date,
        notes: deductDialog.notes || null,
      });
      setDeductDialog({ open: false, employee_name: '', amount_per_period: '', periods_total: 3, start_date: new Date().toISOString().slice(0, 10), notes: '' });
      toast.success('Bérlevonás ütemezve');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Ütemezés sikertelen');
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
  const canEscalate      = ['issued','notified','disputed','partial_paid'].includes(data.status) && data.escalationLevel < 4;
  const canWaive         = !['waived','paid','closed'].includes(data.status);
  const canIssue         = data.status === 'draft';
  const canEmail         = ['issued','notified','partial_paid','disputed'].includes(data.status);
  const canDispute       = ['issued','notified','partial_paid'].includes(data.status);
  const canResolve       = data.status === 'disputed';
  const canAllocate      = !['waived','paid','closed'].includes(data.status);
  const canDeduct        = ['issued','notified','partial_paid','disputed','escalated'].includes(data.status);

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
        {canEmail && (
          <Button variant="outlined" startIcon={<EmailIcon />} onClick={sendEmail} disabled={busy}>
            PDF e-mailben
          </Button>
        )}
        {canAllocate && (
          <Button variant="outlined" startIcon={<GroupsIcon />}
                  onClick={() => setAllocDialog({
                    open: true,
                    parties: data.responsibilities?.length
                      ? data.responsibilities.map(r => ({ name: r.name, email: r.email, phone: r.phone, percentage: Number(r.percentage) }))
                      : [{ name: data.responsibleName || '', email: data.responsibleEmail || '', phone: data.responsiblePhone || '', percentage: 100 }]
                  })}>
            Felelősség megosztása
          </Button>
        )}
        {canDispute && (
          <Button variant="outlined" color="warning" startIcon={<DisputeIcon />} onClick={() => setDisputeDialog({ open: true, reason: '' })}>
            Vitatás
          </Button>
        )}
        {canResolve && (
          <Button variant="contained" color="info" startIcon={<ResolveIcon />}
                  onClick={() => setResolveDialog({ open: true, outcome: 'upheld', notes: '', newAmount: String(data.amountGross || '') })}>
            Vitatás lezárása
          </Button>
        )}
        {canDeduct && (
          <Button variant="outlined" startIcon={<DeductionIcon />}
                  onClick={() => setDeductDialog(d => ({
                    ...d, open: true,
                    employee_name: data.responsibleName || '',
                    amount_per_period: String(Math.round(Number(data.amountOutstanding || 0) / 3)),
                  }))}>
            Bérlevonás
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
          <Tab label={`Felelősök (${data.responsibilities?.length || 0})`} />
          <Tab label={`Lakók (${residents.length})`} />
          <Tab label={`Fizetések (${data.payments?.length || 0})`} />
          <Tab label={`Bérlevonások (${data.salaryDeductions?.length || 0})`} />
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
              {(data.responsibilities?.length || 0) === 0 ? (
                <Alert severity="info">Még nincs allokálva több felelős fél. A "Felelősség megosztása" gombbal osztható meg a kártérítés.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Név</TableCell>
                      <TableCell>E-mail</TableCell>
                      <TableCell>Telefon</TableCell>
                      <TableCell align="right">Részarány</TableCell>
                      <TableCell align="right">Allokált összeg</TableCell>
                      <TableCell align="right">Befizetve</TableCell>
                      <TableCell>Értesítve</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.responsibilities.map(r => (
                      <TableRow key={r.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                        <TableCell>{r.email || '—'}</TableCell>
                        <TableCell>{r.phone || '—'}</TableCell>
                        <TableCell align="right">{Number(r.percentage).toFixed(1)}%</TableCell>
                        <TableCell align="right">{fmtMoney(r.amount_allocated, data.currency)}</TableCell>
                        <TableCell align="right">{fmtMoney(r.amount_paid, data.currency)}</TableCell>
                        <TableCell>{r.notified_at ? fmtDate(r.notified_at, true) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {tab === 2 && (
            <>
              {residents.length === 0 ? (
                <Alert severity="info">Nincs lakó hozzárendelve (a régi kártérítések allokáció-alapúak).</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Lakó</TableCell>
                      <TableCell>E-mail</TableCell>
                      <TableCell align="right">Allokált</TableCell>
                      <TableCell align="right">Befizetve</TableCell>
                      <TableCell align="right">Hátralék</TableCell>
                      <TableCell>Státusz</TableCell>
                      <TableCell>Aláírva</TableCell>
                      <TableCell align="right">Műveletek</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {residents.map(r => {
                      const outstanding = Number(r.amount_assigned) - Number(r.amount_paid || 0);
                      const payable = r.status === 'pending' && outstanding > 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell sx={{ fontWeight: 600 }}>{r.resident_name}</TableCell>
                          <TableCell>{r.resident_email || '—'}</TableCell>
                          <TableCell align="right">{fmtMoney(r.amount_assigned, data.currency)}</TableCell>
                          <TableCell align="right">{fmtMoney(r.amount_paid, data.currency)}</TableCell>
                          <TableCell align="right" sx={{ color: outstanding > 0 ? 'error.main' : 'text.primary', fontWeight: 600 }}>
                            {fmtMoney(outstanding, data.currency)}
                          </TableCell>
                          <TableCell><Chip size="small" label={r.status} /></TableCell>
                          <TableCell>{r.signed_at ? fmtDate(r.signed_at, true) : '—'}</TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              {payable && (
                                <Button size="small" variant="contained" color="success" startIcon={<OnSiteIcon />}
                                  onClick={() => setOnSiteModal({ open: true, resident: r })}>
                                  Helyszíni
                                </Button>
                              )}
                              {payable && (
                                <Button size="small" variant="outlined" color="warning" startIcon={<DeductionIcon />}
                                  onClick={() => convertResidentToDeduction(r)} disabled={busy}>
                                  Bérlevonás
                                </Button>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {tab === 3 && (
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

          {tab === 4 && (
            <>
              {(data.salaryDeductions?.length || 0) === 0 ? (
                <Alert severity="info">Nincs ütemezett bérlevonás.</Alert>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Alkalmazott</TableCell>
                      <TableCell align="right">Havi összeg</TableCell>
                      <TableCell align="right">Időszakok</TableCell>
                      <TableCell>Kezdés</TableCell>
                      <TableCell>Befejezés</TableCell>
                      <TableCell>Státusz</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.salaryDeductions.map(d => (
                      <TableRow key={d.id}>
                        <TableCell>{d.employee_name}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtMoney(d.amount_per_period)}</TableCell>
                        <TableCell align="right">{d.periods_completed}/{d.periods_total}</TableCell>
                        <TableCell>{fmtDate(d.start_date)}</TableCell>
                        <TableCell>{fmtDate(d.end_date)}</TableCell>
                        <TableCell><Chip size="small" label={d.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          {tab === 5 && (
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

      <OnSitePaymentModal
        open={onSiteModal.open}
        resident={onSiteModal.resident}
        onClose={() => setOnSiteModal({ open: false, resident: null })}
        onSuccess={() => { setOnSiteModal({ open: false, resident: null }); load(); }}
      />

      {/* Allocation dialog */}
      <Dialog open={allocDialog.open} onClose={() => setAllocDialog({ open: false, parties: [] })} maxWidth="md" fullWidth>
        <DialogTitle>Felelősség megosztása</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            A százalékok összege legyen pontosan 100. Allokált összeg = alapösszeg × százalék / 100.
          </Alert>
          <Stack spacing={1}>
            {allocDialog.parties.map((p, idx) => (
              <Stack key={idx} direction="row" spacing={1} alignItems="center">
                <TextField label="Név" size="small" sx={{ flex: 2 }}
                  value={p.name}
                  onChange={e => setAllocDialog(d => ({ ...d, parties: d.parties.map((x, i) => i === idx ? { ...x, name: e.target.value } : x) }))}
                />
                <TextField label="E-mail" size="small" sx={{ flex: 2 }}
                  value={p.email || ''}
                  onChange={e => setAllocDialog(d => ({ ...d, parties: d.parties.map((x, i) => i === idx ? { ...x, email: e.target.value } : x) }))}
                />
                <TextField label="%" size="small" type="number" sx={{ flex: 1 }}
                  inputProps={{ min: 0, max: 100, step: 0.1 }}
                  value={p.percentage}
                  onChange={e => setAllocDialog(d => ({ ...d, parties: d.parties.map((x, i) => i === idx ? { ...x, percentage: e.target.value } : x) }))}
                />
                <IconButton size="small" color="error"
                  onClick={() => setAllocDialog(d => ({ ...d, parties: d.parties.filter((_, i) => i !== idx) }))}
                  disabled={allocDialog.parties.length <= 1}
                ><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
            <Button startIcon={<AddIcon />} size="small"
              onClick={() => setAllocDialog(d => ({ ...d, parties: [...d.parties, { name: '', email: '', phone: '', percentage: 0 }] }))}
            >
              Fél hozzáadása
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Jelenlegi összeg: {allocDialog.parties.reduce((s, p) => s + Number(p.percentage || 0), 0)}%
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAllocDialog({ open: false, parties: [] })}>Mégsem</Button>
          <Button variant="contained" onClick={saveAllocation} disabled={busy}>Mentés</Button>
        </DialogActions>
      </Dialog>

      {/* Dispute dialog */}
      <Dialog open={disputeDialog.open} onClose={() => setDisputeDialog({ open: false, reason: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>Vitatás bejelentése</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            A vitatás beérkezése után a kártérítés állapota "Vitatott" lesz, és az eszkalációs ladder leáll a lezárásig.
          </Alert>
          <TextField
            label="Vitatás indoklása *" fullWidth multiline rows={4} required autoFocus
            value={disputeDialog.reason}
            onChange={e => setDisputeDialog({ ...disputeDialog, reason: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisputeDialog({ open: false, reason: '' })}>Mégsem</Button>
          <Button variant="contained" color="warning" onClick={saveDispute} disabled={busy}>Vitatás</Button>
        </DialogActions>
      </Dialog>

      {/* Resolve dispute dialog */}
      <Dialog open={resolveDialog.open} onClose={() => setResolveDialog({ open: false, outcome: 'upheld', notes: '', newAmount: '' })} maxWidth="sm" fullWidth>
        <DialogTitle>Vitatás lezárása</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Eredmény</InputLabel>
              <Select
                value={resolveDialog.outcome} label="Eredmény"
                onChange={e => setResolveDialog({ ...resolveDialog, outcome: e.target.value })}
              >
                <MenuItem value="upheld">Helyt ad (teljes összeg marad)</MenuItem>
                <MenuItem value="reduced">Csökkentett összeg</MenuItem>
                <MenuItem value="dismissed">Elengedés (nem jogos)</MenuItem>
              </Select>
            </FormControl>
            {resolveDialog.outcome === 'reduced' && (
              <TextField
                label="Új bruttó összeg" type="number" fullWidth
                value={resolveDialog.newAmount}
                onChange={e => setResolveDialog({ ...resolveDialog, newAmount: e.target.value })}
              />
            )}
            <TextField
              label="Jegyzet" fullWidth multiline rows={3}
              value={resolveDialog.notes}
              onChange={e => setResolveDialog({ ...resolveDialog, notes: e.target.value })}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialog({ open: false, outcome: 'upheld', notes: '', newAmount: '' })}>Mégsem</Button>
          <Button variant="contained" onClick={saveResolve} disabled={busy}>Lezárás</Button>
        </DialogActions>
      </Dialog>

      {/* Salary deduction dialog */}
      <Dialog open={deductDialog.open} onClose={() => setDeductDialog(d => ({ ...d, open: false }))} maxWidth="sm" fullWidth>
        <DialogTitle>Bérlevonás ütemezése</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Alkalmazott neve *" fullWidth required
              value={deductDialog.employee_name}
              onChange={e => setDeductDialog(d => ({ ...d, employee_name: e.target.value }))}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Havi összeg *" type="number" fullWidth required
                value={deductDialog.amount_per_period}
                onChange={e => setDeductDialog(d => ({ ...d, amount_per_period: e.target.value }))}
              />
              <TextField
                label="Hónapok száma *" type="number" fullWidth required
                value={deductDialog.periods_total}
                onChange={e => setDeductDialog(d => ({ ...d, periods_total: e.target.value }))}
              />
            </Stack>
            <TextField
              label="Kezdés dátuma *" type="date" fullWidth required
              InputLabelProps={{ shrink: true }}
              value={deductDialog.start_date}
              onChange={e => setDeductDialog(d => ({ ...d, start_date: e.target.value }))}
            />
            <TextField
              label="Jegyzet" fullWidth multiline rows={2}
              value={deductDialog.notes}
              onChange={e => setDeductDialog(d => ({ ...d, notes: e.target.value }))}
            />
            <Typography variant="caption" color="text.secondary">
              Összesen: {fmtMoney(Number(deductDialog.amount_per_period || 0) * Number(deductDialog.periods_total || 0))}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeductDialog(d => ({ ...d, open: false }))}>Mégsem</Button>
          <Button variant="contained" onClick={saveDeduction} disabled={busy}>Ütemezés</Button>
        </DialogActions>
      </Dialog>

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
