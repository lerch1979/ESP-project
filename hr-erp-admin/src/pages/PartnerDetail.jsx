import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Button, CircularProgress, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid, Stack, IconButton,
  FormControlLabel, Switch, Divider, List, ListItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import api from '../services/api';

/**
 * Partner detail — one page for everything about a partner.
 *
 * Tab set per the plan: Áttekintés · Kapcsolattartók · Szerződések · Dokumentumok ·
 * Aktivitás · Pénzügy. The Pénzügy tab deliberately surfaces the billing profile and
 * night rates that until now lived only on the disconnected /billing-rates page — a
 * partner's commercial picture belongs with the partner.
 *
 * Aktivitás (mig 145) is a real timeline. A follow-up date on an entry creates an
 * actual `tasks` row server-side, so the reminder lands in the Kanban/GTD views staff
 * already use — the chip here shows that task's LIVE status, not just the date we
 * promised.
 */

const ROLE_LABEL = { megbizo: 'Megbízó', szallasado: 'Szállásadó', alvallalkozo: 'Alvállalkozó' };
const STATUS_LABEL = { draft: 'Piszkozat', active: 'Élő', expired: 'Lejárt', terminated: 'Felmondva' };
const KIND_LABEL = { note: 'Jegyzet', call: 'Hívás', meeting: 'Találkozó', email: 'E-mail', offer_sent: 'Ajánlat kiküldve' };
const fmtDateTime = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}. ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}.`;
};
const fmtMoney = (n) => (n == null ? '—' : `${Number(n).toLocaleString('hu-HU')} Ft`);

const TABS = ['attekintes', 'kapcsolattartok', 'szerzodesek', 'dokumentumok', 'aktivitas', 'penzugy'];

export default function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.indexOf(searchParams.get('tab') || 'attekintes');
  const activeTab = tab === -1 ? 0 : tab;

  const [partner, setPartner] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [finance, setFinance] = useState({ profile: null, rates: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activities, setActivities] = useState([]);
  const [contactDialog, setContactDialog] = useState(null);
  const [activityDialog, setActivityDialog] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c, k, d, act] = await Promise.all([
        api.get(`/contractors/${id}`),
        api.get('/partners/contacts', { params: { contractor_id: id } }),
        api.get('/partners/contracts', { params: { contractor_id: id } }),
        api.get('/documents', { params: { contractor_id: id } }).catch(() => ({ data: { data: [] } })),
        api.get('/partners/activities', { params: { contractor_id: id } }),
      ]);
      setActivities(act.data?.data || []);
      setPartner(p.data?.data?.contractor || p.data?.data || null);
      setContacts(c.data?.data || []);
      setContracts(k.data?.data?.contracts || []);
      const docs = d.data?.data?.documents || d.data?.data || [];
      setDocuments(Array.isArray(docs) ? docs.filter((x) => x.contractor_id === id) : []);
    } catch (e) {
      setError(e.response?.data?.message || 'Nem sikerült betölteni a partnert');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Finance is a separate, lazier fetch: it is only meaningful for a megbízó and the
  // rate list can be long.
  const loadFinance = useCallback(async () => {
    try {
      const res = await api.get('/billing/rates', { params: { contractor_id: id } })
        .catch(() => api.get('/billing/client-rates', { params: { contractor_id: id } }));
      const data = res.data?.data || {};
      setFinance({
        profile: data.profile || data.billing_profile || null,
        rates: data.rates || data.client_night_rates || [],
      });
    } catch {
      setFinance({ profile: null, rates: [], unavailable: true });
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (TABS[activeTab] === 'penzugy') loadFinance(); }, [activeTab, loadFinance]);

  const setTab = (_, v) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', TABS[v]);
    setSearchParams(next, { replace: true });
  };

  const saveContact = async (form) => {
    const payload = { ...form, contractor_id: id };
    if (form.id) await api.put(`/partners/contacts/${form.id}`, payload);
    else await api.post('/partners/contacts', payload);
    setContactDialog(null);
    load();
  };

  const saveActivity = async (form) => {
    const payload = { ...form, contractor_id: id };
    if (form.id) await api.put(`/partners/activities/${form.id}`, payload);
    else await api.post('/partners/activities', payload);
    setActivityDialog(null);
    load();
  };

  const removeActivity = async (aid) => {
    await api.delete(`/partners/activities/${aid}`);
    load();
  };

  const removeContact = async (cid) => {
    await api.delete(`/partners/contacts/${cid}`);
    load();
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  const roles = partner?.roles || [];

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <IconButton size="small" onClick={() => navigate('/contractors')}><ArrowBackIcon /></IconButton>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>{partner?.name || 'Partner'}</Typography>
        {roles.map((r) => (
          <Chip key={r} size="small" label={ROLE_LABEL[r] || r} variant="outlined" />
        ))}
      </Stack>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={setTab} variant="scrollable" scrollButtons="auto">
          <Tab label="Áttekintés" />
          <Tab label={`Kapcsolattartók (${contacts.length})`} />
          <Tab label={`Szerződések (${contracts.length})`} />
          <Tab label={`Dokumentumok (${documents.length})`} />
          <Tab label={`Aktivitás (${activities.length})`} />
          <Tab label="Pénzügy" />
        </Tabs>
      </Paper>

      {/* ── Áttekintés ── */}
      {activeTab === 0 && (
        <Paper sx={{ p: 3 }}>
          <Grid container spacing={2}>
            {[
              ['Név', partner?.name],
              ['Adószám', partner?.tax_number],
              ['Cégjegyzékszám', partner?.company_reg_number],
              ['Bankszámlaszám', partner?.bank_account],
              ['E-mail', partner?.email],
              ['Számlázási e-mail', partner?.billing_email],
              ['Telefon', partner?.phone],
              ['Cím', partner?.address],
              ['Számlázási cím', partner?.billing_address],
            ].map(([label, value]) => (
              <Grid item xs={12} md={6} key={label}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="body1">{value || '—'}</Typography>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* ── Kapcsolattartók ── */}
      {activeTab === 1 && (
        <Paper>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button startIcon={<AddIcon />} variant="contained"
                    onClick={() => setContactDialog({ language: 'hu', is_active: true })}>
              Új kapcsolattartó
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>Név</TableCell>
                  <TableCell>Beosztás</TableCell>
                  <TableCell>Telefon</TableCell>
                  <TableCell>E-mail</TableCell>
                  <TableCell>Nyelv</TableCell>
                  <TableCell align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contacts.length === 0 && (
                  <TableRow><TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      Még nincs kapcsolattartó rögzítve.
                    </Typography>
                  </TableCell></TableRow>
                )}
                {contacts.map((c) => (
                  <TableRow key={c.id} hover sx={{ opacity: c.is_active ? 1 : 0.5 }}>
                    <TableCell>{c.is_primary && <StarIcon fontSize="small" color="warning" titleAccess="Elsődleges" />}</TableCell>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.role_title || '—'}</TableCell>
                    <TableCell>{c.phone || '—'}</TableCell>
                    <TableCell>{c.email || '—'}</TableCell>
                    <TableCell>{(c.language || 'hu').toUpperCase()}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => setContactDialog(c)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => removeContact(c.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── Szerződések ── */}
      {activeTab === 2 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Megnevezés</TableCell>
                <TableCell>Szerepkör</TableCell>
                <TableCell>Ingatlan</TableCell>
                <TableCell>Kezdet</TableCell>
                <TableCell>Lejárat</TableCell>
                <TableCell>Felmondási határidő</TableCell>
                <TableCell>Állapot</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contracts.length === 0 && (
                <TableRow><TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    Nincs rögzített szerződés ehhez a partnerhez.
                  </Typography>
                </TableCell></TableRow>
              )}
              {contracts.map((k) => (
                <TableRow key={k.id} hover>
                  <TableCell>{k.title || k.contract_no || '—'}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={ROLE_LABEL[k.contract_role] || k.contract_role} /></TableCell>
                  <TableCell>{k.accommodation_name || '—'}</TableCell>
                  <TableCell>{fmtDate(k.start_date)}</TableCell>
                  <TableCell>{k.is_open_ended ? 'Határozatlan' : fmtDate(k.end_date)}</TableCell>
                  <TableCell>{k.notice_deadline ? <strong>{fmtDate(k.notice_deadline)}</strong> : '—'}</TableCell>
                  <TableCell>{STATUS_LABEL[k.status] || k.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Dokumentumok ── */}
      {activeTab === 3 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Megnevezés</TableCell>
                <TableCell>Típus</TableCell>
                <TableCell>Fájl</TableCell>
                <TableCell>Feltöltve</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {documents.length === 0 && (
                <TableRow><TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    Nincs a partnerhez csatolt dokumentum.
                  </Typography>
                </TableCell></TableRow>
              )}
              {documents.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>{d.title}</TableCell>
                  <TableCell>{d.document_type || '—'}</TableCell>
                  <TableCell>{d.file_name}</TableCell>
                  <TableCell>{fmtDate(d.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Aktivitás ── */}
      {activeTab === 4 && (
        <Paper>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button startIcon={<AddIcon />} variant="contained"
                    onClick={() => setActivityDialog({ kind: 'note' })}>
              Új bejegyzés
            </Button>
          </Box>
          {activities.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              Még nincs rögzített aktivitás ennél a partnernél.
            </Typography>
          ) : (
            <List dense sx={{ px: 2, pb: 2 }}>
              {activities.map((a) => (
                <ListItem key={a.id} alignItems="flex-start" divider
                          sx={{ display: 'block', py: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                    <Chip size="small" label={KIND_LABEL[a.kind] || a.kind} variant="outlined" />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.subject || '—'}</Typography>
                    <Box sx={{ flex: 1 }} />
                    <Typography variant="caption" color="text.secondary">{fmtDateTime(a.occurred_at)}</Typography>
                  </Stack>
                  {a.contact_name && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Kapcsolattartó: {a.contact_name}
                    </Typography>
                  )}
                  {a.body && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{a.body}</Typography>}
                  {a.follow_up_at && (
                    // The follow-up is a real task; show its live status rather than
                    // just the date we promised.
                    <Chip
                      size="small" sx={{ mt: 1 }} icon={<EventIcon />}
                      color={a.follow_up_status === 'done' ? 'success' : 'warning'}
                      label={`Utánkövetés: ${fmtDate(a.follow_up_at)}${a.follow_up_status === 'done' ? ' — kész' : ' — nyitott'}`}
                    />
                  )}
                  <Box sx={{ mt: 0.5 }}>
                    <IconButton size="small" onClick={() => setActivityDialog(a)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => removeActivity(a.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      )}

      {/* ── Pénzügy ── */}
      {activeTab === 5 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Számlázási profil</Typography>
          {finance.unavailable && (
            <Alert severity="info" sx={{ mb: 2 }}>
              A számlázási adatok a „Számlázási díjak" oldalon kezelhetők.
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {[
              ['Számlázás', finance.profile?.invoicing_enabled === false ? 'Kikapcsolva' : 'Bekapcsolva'],
              ['Jogi forma', finance.profile?.legal_type === 'private' ? 'Magánszemély (bérszámfejtendő)' : 'Cég'],
              ['ÁFA-mentesség', finance.profile?.vat_exemption_reason || '—'],
            ].map(([l, v]) => (
              <Grid item xs={12} md={4} key={l}>
                <Typography variant="caption" color="text.secondary">{l}</Typography>
                <Typography variant="body1">{v}</Typography>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 2 }} />
          <Typography variant="h6" gutterBottom>Éjszakadíjak</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Szálláshely</TableCell>
                  <TableCell>Alap</TableCell>
                  <TableCell align="right">Díj</TableCell>
                  <TableCell>Érvényes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(finance.rates || []).length === 0 && (
                  <TableRow><TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                      Nincs rögzített díj ehhez a partnerhez.
                    </Typography>
                  </TableCell></TableRow>
                )}
                {(finance.rates || []).map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.accommodation_name || 'Minden szálláshely'}</TableCell>
                    <TableCell>{r.billing_basis}</TableCell>
                    <TableCell align="right">{fmtMoney(r.rate_per_night ?? r.flat_amount)}</TableCell>
                    <TableCell>{fmtDate(r.valid_from)} – {r.valid_to ? fmtDate(r.valid_to) : 'nyitott'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Button sx={{ mt: 2 }} onClick={() => navigate('/billing-rates')}>
            Díjak szerkesztése
          </Button>
        </Paper>
      )}

      <ContactDialog
        value={contactDialog}
        onClose={() => setContactDialog(null)}
        onSave={saveContact}
      />
      <ActivityDialog
        value={activityDialog}
        contacts={contacts}
        onClose={() => setActivityDialog(null)}
        onSave={saveActivity}
      />
    </Box>
  );
}

function ContactDialog({ value, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [err, setErr] = useState(null);
  useEffect(() => { setForm(value || {}); setErr(null); }, [value]);
  if (!value) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async () => {
    try { await onSave(form); } catch (e) { setErr(e.response?.data?.message || 'Mentés sikertelen'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{form.id ? 'Kapcsolattartó szerkesztése' : 'Új kapcsolattartó'}</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} md={6}><TextField fullWidth label="Név *" value={form.name || ''} onChange={set('name')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Beosztás" value={form.role_title || ''} onChange={set('role_title')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Telefon" value={form.phone || ''} onChange={set('phone')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="E-mail" value={form.email || ''} onChange={set('email')} /></Grid>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Nyelv" value={form.language || 'hu'} onChange={set('language')}>
              {['hu', 'en', 'uk', 'tl', 'de'].map((l) => <MenuItem key={l} value={l}>{l.toUpperCase()}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel control={<Switch checked={!!form.is_primary} onChange={set('is_primary')} />}
                              label="Elsődleges kapcsolattartó" />
            {/* Promoting demotes the previous primary server-side, in one transaction. */}
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel control={<Switch checked={form.is_active !== false} onChange={set('is_active')} />} label="Aktív" />
          </Grid>
          <Grid item xs={12}><TextField fullWidth multiline rows={2} label="Megjegyzés" value={form.notes || ''} onChange={set('notes')} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={submit}>Mentés</Button>
      </DialogActions>
    </Dialog>
  );
}

function ActivityDialog({ value, contacts, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [err, setErr] = useState(null);
  useEffect(() => { setForm(value || {}); setErr(null); }, [value]);
  if (!value) return null;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    try { await onSave(form); } catch (e) { setErr(e.response?.data?.message || 'Mentés sikertelen'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{form.id ? 'Bejegyzés szerkesztése' : 'Új aktivitás'}</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Típus" value={form.kind || 'note'} onChange={set('kind')}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Kapcsolattartó" value={form.contact_id || ''} onChange={set('contact_id')}>
              <MenuItem value="">—</MenuItem>
              {(contacts || []).map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12}><TextField fullWidth label="Tárgy" value={form.subject || ''} onChange={set('subject')} /></Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={4} label="Leírás" value={form.body || ''} onChange={set('body')} />
          </Grid>

          {/* Only on create: the follow-up writes a task, and editing an activity must
              not silently spawn a second one. */}
          {!form.id && (
            <>
              <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth type="datetime-local" label="Utánkövetés" InputLabelProps={{ shrink: true }}
                  value={form.follow_up_at || ''} onChange={set('follow_up_at')}
                  helperText="Feladatot hoz létre a Teendők között"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField select fullWidth label="Prioritás" value={form.follow_up_priority || 'medium'}
                           onChange={set('follow_up_priority')} disabled={!form.follow_up_at}>
                  {['low', 'medium', 'high'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </TextField>
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={submit}>Mentés</Button>
      </DialogActions>
    </Dialog>
  );
}
