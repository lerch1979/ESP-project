import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Button, CircularProgress, Alert, TextField, MenuItem,
  Stack, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Grid, Divider,
  Tooltip, Drawer, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import LinkIcon from '@mui/icons-material/Link';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import ForumIcon from '@mui/icons-material/Forum';
import { toast } from 'react-toastify';
import api, { salesAPI, accommodationsAPI } from '../services/api';
import ActivityPanel from '../components/ActivityPanel';

/**
 * Üzletfejlesztés — the sales pipeline.
 *
 * Three views over one funnel: Érdeklődők (leads) → Pipeline (stage kanban) →
 * Ajánlatok (quote builder).
 *
 * The quote builder mirrors `client_night_rates` field-for-field, because accepting a
 * quote materialises exactly one rate row per line. Anything the form lets you enter
 * that the rate table cannot hold would be a promise the billing engine can't keep.
 *
 * NOTES OPEN IN A DRAWER, NOT A PAGE
 * ---------------------------------
 * The pipeline has no per-record route, and adding one for note-taking would be the
 * wrong trade: the point is to jot something down between hanging up and the next call,
 * without losing the list you were working through. A drawer keeps the list mounted and
 * behind, so closing it returns you exactly where you were — no reload, no scroll loss.
 */

const STAGES = ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const STAGE_HU = {
  new: 'Új', qualified: 'Minősített', proposal: 'Ajánlat', negotiation: 'Tárgyalás',
  won: 'Megnyert', lost: 'Elvesztett',
};
const STAGE_COLOR = { won: 'success', lost: 'default', negotiation: 'warning', proposal: 'info' };
const LEAD_STATUS_HU = {
  new: 'Új', contacted: 'Megkeresve', qualified: 'Minősített',
  converted: 'Konvertálva', lost: 'Elvesztett',
};
const QUOTE_STATUS_HU = {
  draft: 'Piszkozat', sent: 'Kiküldve', accepted: 'Elfogadva',
  rejected: 'Elutasítva', expired: 'Lejárt',
};
const BASIS_HU = { per_person: 'Fő/éj', flat: 'Fix havi', per_bed_night: 'Ágy/éj' };

const fmtMoney = (n) => (n == null ? '—' : `${Number(n).toLocaleString('hu-HU')} Ft`);
const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—'
    : `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}.`;
};

const TABS = ['leads', 'pipeline', 'quotes'];

export default function Sales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIdx = Math.max(0, TABS.indexOf(searchParams.get('tab') || 'leads'));

  const [leads, setLeads] = useState([]);
  const [board, setBoard] = useState([]);
  const [opps, setOpps] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [leadDialog, setLeadDialog] = useState(null);
  const [oppDialog, setOppDialog] = useState(null);
  const [quoteDialog, setQuoteDialog] = useState(null);
  const [convertDialog, setConvertDialog] = useState(null);
  // { type: 'lead' | 'opportunity', row } — the notes drawer.
  const [notes, setNotes] = useState(null);

  // `q` searches names AND the activity notes server-side (mig 152). Typed into
  // `qInput`, debounced into `q` so a five-letter search is one request, not five.
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = q ? { q } : {};
    try {
      const [l, b, o, qq] = await Promise.all([
        salesAPI.listLeads(params), salesAPI.board(),
        salesAPI.listOpportunities(params), salesAPI.listQuotes({}),
      ]);
      setLeads(l?.data || []); setBoard(b?.data || []);
      setOpps(o?.data || []); setQuotes(qq?.data || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Nem sikerült betölteni az értékesítési adatokat');
    } finally { setLoading(false); }
  }, [q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    accommodationsAPI.getAll?.({ limit: 200 })
      .then((r) => setAccommodations(r?.data?.accommodations || r?.data || []))
      .catch(() => setAccommodations([]));
  }, []);

  const setTab = (_, v) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', TABS[v]);
    setSearchParams(next, { replace: true });
  };

  const run = async (fn, okMsg) => {
    try { await fn(); if (okMsg) toast.success(okMsg); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'A művelet nem sikerült'); }
  };

  // Only the FIRST load blanks the page. A search-triggered reload must not unmount
  // the search box — that drops focus after the first keystroke and makes it unusable.
  if (loading && leads.length === 0 && opps.length === 0 && quotes.length === 0 && !q) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Üzletfejlesztés</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Érdeklődő → lehetőség → ajánlat. Az <strong>elfogadott ajánlatból</strong> automatikusan
        szerződés és éjszakadíj lesz — onnantól a számlázás abból dolgozik.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tabIdx} onChange={setTab}>
          <Tab label={`Érdeklődők (${leads.length})`} />
          <Tab label="Pipeline" />
          <Tab label={`Ajánlatok (${quotes.length})`} />
        </Tabs>
      </Paper>

      {/* ── ÉRDEKLŐDŐK ── */}
      {tabIdx === 0 && (
        <Paper>
          <Box sx={{ p: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small" placeholder="Keresés névben és jegyzetekben…"
            value={qInput} onChange={(e) => setQInput(e.target.value)}
            sx={{ minWidth: 300 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: qInput
                ? <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQInput('')}><CloseIcon fontSize="small" /></IconButton>
                  </InputAdornment>
                : null,
            }}
          />
            <Box sx={{ flex: 1 }} />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setLeadDialog({ status: 'new' })}>
              Új érdeklődő
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Cég</TableCell><TableCell>Forrás</TableCell><TableCell>Iparág</TableCell>
                  <TableCell align="right">Várható létszám</TableCell><TableCell>Állapot</TableCell>
                  <TableCell>Tulajdonos</TableCell><TableCell align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {leads.length === 0 && (
                  <TableRow><TableCell colSpan={7}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      Még nincs rögzített érdeklődő.
                    </Typography>
                  </TableCell></TableRow>
                )}
                {leads.map((l) => (
                  <TableRow key={l.id} hover>
                    <TableCell>
                      <Box component="span" sx={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                           onClick={() => setNotes({ type: 'lead', row: l })}>
                        {l.name}
                      </Box>
                      {l.converted_contractor_name && (
                        <Typography variant="caption" display="block" color="success.main">
                          → {l.converted_contractor_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{l.source || '—'}</TableCell>
                    <TableCell>{l.industry || '—'}</TableCell>
                    <TableCell align="right">{l.expected_headcount ?? '—'}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined"
                            color={l.status === 'converted' ? 'success' : l.status === 'lost' ? 'default' : 'primary'}
                            label={LEAD_STATUS_HU[l.status] || l.status} />
                    </TableCell>
                    <TableCell>{l.owner_name || '—'}</TableCell>
                    <TableCell align="right">
                      {/* Reading the history stays available on a converted lead — that
                          is precisely when you want to know what was promised. */}
                      <Tooltip title="Jegyzetek / aktivitás">
                        <IconButton size="small" onClick={() => setNotes({ type: 'lead', row: l })}>
                          <ForumIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {l.status !== 'converted' && (
                        <>
                          <Tooltip title="Szerkesztés">
                            <IconButton size="small" onClick={() => setLeadDialog(l)}><EditIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <Tooltip title="Konvertálás ügyféllé">
                            <IconButton size="small" onClick={() => setConvertDialog(l)}><SwapHorizIcon fontSize="small" /></IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* ── PIPELINE (kanban) ── */}
      {tabIdx === 1 && (
        <>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small" placeholder="Keresés névben és jegyzetekben…"
            value={qInput} onChange={(e) => setQInput(e.target.value)}
            sx={{ minWidth: 300 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: qInput
                ? <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQInput('')}><CloseIcon fontSize="small" /></IconButton>
                  </InputAdornment>
                : null,
            }}
          />
            <Box sx={{ flex: 1 }} />
            <Button startIcon={<AddIcon />} variant="contained" onClick={() => setOppDialog({ stage: 'new' })}>
              Új lehetőség
            </Button>
          </Box>
          <Stack direction="row" spacing={1.5} sx={{ overflowX: 'auto', pb: 1 }}>
            {STAGES.map((st) => {
              const col = board.find((b) => b.stage === st) || { count: 0, value: 0, weighted: 0 };
              const items = opps.filter((o) => o.stage === st);
              return (
                <Paper key={st} sx={{ minWidth: 230, flex: '0 0 230px', p: 1.5, bgcolor: 'background.default' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {STAGE_HU[st]} ({col.count})
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    {fmtMoney(col.value)}
                    {st !== 'won' && st !== 'lost' && ` · súlyozva ${fmtMoney(Math.round(col.weighted))}`}
                  </Typography>
                  <Divider sx={{ mb: 1 }} />
                  {items.map((o) => (
                    <Paper key={o.id} variant="outlined" sx={{ p: 1, mb: 1, cursor: 'pointer' }}
                           onClick={() => setOppDialog(o)}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{o.title}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {o.lead_name || o.contractor_name || '—'}
                      </Typography>
                      <Typography variant="caption" display="block">
                        {fmtMoney(o.expected_monthly_value)}/hó
                        {o.probability != null && ` · ${o.probability}%`}
                      </Typography>
                      {o.expected_close_date && (
                        <Typography variant="caption" color="text.secondary">
                          zárás: {fmtDate(o.expected_close_date)}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                        {Number(o.quote_count) > 0 && (
                          <Chip size="small" label={`${o.quote_count} ajánlat`} variant="outlined" />
                        )}
                        <Box sx={{ flex: 1 }} />
                        <Tooltip title="Jegyzetek / aktivitás">
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setNotes({ type: 'opportunity', row: o }); }}
                          >
                            <ForumIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Paper>
                  ))}
                  {items.length === 0 && (
                    <Typography variant="caption" color="text.secondary">—</Typography>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </>
      )}

      {/* ── AJÁNLATOK ── */}
      {tabIdx === 2 && (
        <Paper>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button startIcon={<AddIcon />} variant="contained"
                    disabled={opps.filter((o) => !['won','lost'].includes(o.stage)).length === 0}
                    onClick={() => setQuoteDialog({ lines: [] })}>
              Új ajánlat
            </Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Partner</TableCell><TableCell>Lehetőség</TableCell>
                  <TableCell align="right">Verzió</TableCell><TableCell>Állapot</TableCell>
                  <TableCell align="right">Nettó</TableCell><TableCell align="right">Bruttó</TableCell>
                  <TableCell>Érvényes</TableCell><TableCell align="right">Műveletek</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quotes.length === 0 && (
                  <TableRow><TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      Még nincs ajánlat.
                    </Typography>
                  </TableCell></TableRow>
                )}
                {quotes.map((q) => (
                  <TableRow key={q.id} hover>
                    <TableCell>{q.party_name || '—'}</TableCell>
                    <TableCell>{q.opportunity_title}</TableCell>
                    <TableCell align="right">v{q.version}</TableCell>
                    <TableCell>
                      <Chip size="small" label={QUOTE_STATUS_HU[q.status] || q.status}
                            color={q.status === 'accepted' ? 'success' : q.status === 'sent' ? 'info' : 'default'}
                            variant={q.status === 'draft' ? 'outlined' : 'filled'} />
                      {q.materialised_contract_id && (
                        <Typography variant="caption" display="block" color="success.main">
                          szerződéssé alakítva
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{fmtMoney(q.net_amount)}</TableCell>
                    <TableCell align="right">{fmtMoney(q.gross_amount)}</TableCell>
                    <TableCell>{fmtDate(q.valid_until)}</TableCell>
                    <TableCell align="right">
                      <Tooltip title="Árajánlat PDF">
                        <IconButton size="small" onClick={async () => {
                          try {
                            const res = await salesAPI.quotePdf(q.id);
                            const cd = res.headers['content-disposition'] || '';
                            const name = (cd.match(/filename="(.+?)"/) || [])[1] || `arajanlat-v${q.version}.pdf`;
                            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                            const a = document.createElement('a');
                            a.href = url; a.download = name; a.click();
                            URL.revokeObjectURL(url);
                          } catch (e) { toast.error('A PDF letöltése nem sikerült'); }
                        }}><PictureAsPdfIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      {q.status === 'draft' && (
                        <Button size="small" onClick={() => run(() => salesAPI.sendQuote(q.id, {}), 'Ajánlat kiküldve')}>
                          Kiküldés
                        </Button>
                      )}
                      {q.status === 'sent' && (
                        <>
                          <Button size="small" color="success"
                                  onClick={() => run(() => salesAPI.acceptQuote(q.id, {}), 'Elfogadva — szerződés és díj létrejött')}>
                            Elfogadás
                          </Button>
                          <Tooltip title="Megosztás lejáró linkkel">
                            <IconButton size="small" onClick={() => run(async () => {
                              const r = await salesAPI.shareQuote(q.id, { expires_in_days: 30 });
                              await navigator.clipboard?.writeText(`${window.location.origin}${r.data.url}`);
                            }, 'Link vágólapra másolva')}>
                              <LinkIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Elutasítás">
                            <IconButton size="small" onClick={() => run(() => salesAPI.rejectQuote(q.id, {}), 'Elutasítva')}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <NotesDrawer value={notes} onClose={() => setNotes(null)} onChanged={load} />

      <LeadDialog value={leadDialog} onClose={() => setLeadDialog(null)}
                  onSave={(f) => run(() => (f.id ? salesAPI.updateLead(f.id, f) : salesAPI.createLead(f)), 'Mentve')
                    .then(() => setLeadDialog(null))} />
      <ConvertDialog value={convertDialog} onClose={() => setConvertDialog(null)}
                     onSave={(f) => run(() => salesAPI.convertLead(f.id, f), 'Konvertálva ügyféllé')
                       .then(() => setConvertDialog(null))} />
      <OpportunityDialog value={oppDialog} leads={leads} onClose={() => setOppDialog(null)}
                         onSave={(f) => run(() => (f.id ? salesAPI.updateOpportunity(f.id, f) : salesAPI.createOpportunity(f)), 'Mentve')
                           .then(() => setOppDialog(null))} />
      <QuoteDialog value={quoteDialog} opportunities={opps} accommodations={accommodations}
                   onClose={() => setQuoteDialog(null)}
                   onSave={(f) => run(() => salesAPI.createQuote(f), 'Ajánlat létrehozva')
                     .then(() => setQuoteDialog(null))} />
    </Box>
  );
}

/**
 * The notes drawer — one component for both leads and opportunities.
 *
 * It carries a short factual header (who / what stage / how much) because the whole
 * point is to read it in the two seconds before the phone connects, and then the shared
 * ActivityPanel. The party key is what differs, and the panel takes it as data.
 */
function NotesDrawer({ value, onClose, onChanged }) {
  const [contacts, setContacts] = useState([]);
  const row = value?.row;
  const isLead = value?.type === 'lead';

  useEffect(() => {
    if (!row) { setContacts([]); return; }
    // An opportunity has no contacts of its own — you talk to the prospect's or the
    // client's people about a deal, so the list comes from whichever party it hangs off.
    const params = isLead
      ? { lead_id: row.id }
      : (row.lead_id ? { lead_id: row.lead_id } : { contractor_id: row.contractor_id });
    if (!Object.values(params)[0]) { setContacts([]); return; }
    api.get('/partners/contacts', { params })
      .then((r) => setContacts(r.data?.data || []))
      .catch(() => setContacts([]));
  }, [row, isLead]);

  if (!value) return null;
  const party = isLead ? { lead_id: row.id } : { opportunity_id: row.id };

  return (
    <Drawer anchor="right" open onClose={onClose}
            PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: 2.5 } }}>
      <Stack direction="row" alignItems="flex-start" sx={{ mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="overline" color="text.secondary">
            {isLead ? 'Érdeklődő' : 'Lehetőség'}
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {isLead ? row.name : row.title}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
            {isLead ? (
              <>
                <Chip size="small" variant="outlined"
                      label={LEAD_STATUS_HU[row.status] || row.status} />
                {row.source && <Chip size="small" variant="outlined" label={row.source} />}
                {row.expected_headcount != null && (
                  <Chip size="small" variant="outlined" label={`${row.expected_headcount} fő`} />
                )}
              </>
            ) : (
              <>
                <Chip size="small" variant="outlined" color={STAGE_COLOR[row.stage] || 'default'}
                      label={STAGE_HU[row.stage] || row.stage} />
                <Chip size="small" variant="outlined"
                      label={row.lead_name || row.contractor_name || '—'} />
                {row.expected_monthly_value != null && (
                  <Chip size="small" variant="outlined"
                        label={`${fmtMoney(row.expected_monthly_value)}/hó`} />
                )}
                {row.expected_close_date && (
                  <Chip size="small" variant="outlined" label={`zárás: ${fmtDate(row.expected_close_date)}`} />
                )}
              </>
            )}
          </Stack>
          {row.owner_name && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              Tulajdonos: {row.owner_name}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <ActivityPanel party={party} contacts={contacts} title="Előzmények" onChanged={onChanged} />
    </Drawer>
  );
}

function LeadDialog({ value, onClose, onSave }) {
  const [f, setF] = useState({});
  useEffect(() => { setF(value || {}); }, [value]);
  if (!value) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{f.id ? 'Érdeklődő szerkesztése' : 'Új érdeklődő'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12}><TextField fullWidth label="Cégnév *" value={f.name || ''} onChange={set('name')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Forrás" value={f.source || ''} onChange={set('source')} placeholder="ajánlás / hideghívás / vásár" /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Iparág" value={f.industry || ''} onChange={set('industry')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth type="number" label="Várható létszám" value={f.expected_headcount ?? ''} onChange={set('expected_headcount')} /></Grid>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Állapot" value={f.status || 'new'} onChange={set('status')}>
              {['new','contacted','qualified','lost'].map((s) => <MenuItem key={s} value={s}>{LEAD_STATUS_HU[s]}</MenuItem>)}
            </TextField>
          </Grid>
          {f.status === 'lost' && (
            <Grid item xs={12}>
              <TextField fullWidth label="Elvesztés oka (kötelező)" value={f.lost_reason || ''} onChange={set('lost_reason')} />
            </Grid>
          )}
          <Grid item xs={12}><TextField fullWidth multiline rows={3} label="Megjegyzés" value={f.notes || ''} onChange={set('notes')} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={() => onSave(f)}>Mentés</Button>
      </DialogActions>
    </Dialog>
  );
}

function ConvertDialog({ value, onClose, onSave }) {
  const [f, setF] = useState({});
  useEffect(() => { setF(value || {}); }, [value]);
  if (!value) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Konvertálás ügyféllé — {value.name}</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Létrejön egy <strong>megbízó</strong> partner, és a kapcsolattartók, aktivitások,
          dokumentumok, valamint a nyitott lehetőségek átkerülnek hozzá. Az érdeklődő
          megmarad „konvertálva" állapotban, hogy az előzmény ne vesszen el.
        </Alert>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}><TextField fullWidth label="Adószám" value={f.tax_number || ''} onChange={set('tax_number')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth label="Cím" value={f.address || ''} onChange={set('address')} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={() => onSave(f)}>Konvertálás</Button>
      </DialogActions>
    </Dialog>
  );
}

function OpportunityDialog({ value, leads, onClose, onSave }) {
  const [f, setF] = useState({});
  useEffect(() => { setF(value || {}); }, [value]);
  if (!value) return null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{f.id ? 'Lehetőség szerkesztése' : 'Új lehetőség'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12}><TextField fullWidth label="Megnevezés *" value={f.title || ''} onChange={set('title')} /></Grid>
          {!f.id && (
            <Grid item xs={12}>
              <TextField select fullWidth label="Érdeklődő *" value={f.lead_id || ''} onChange={set('lead_id')}>
                {leads.filter((l) => l.status !== 'converted' && l.status !== 'lost')
                  .map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
              </TextField>
            </Grid>
          )}
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Fázis" value={f.stage || 'new'} onChange={set('stage')}>
              {STAGES.map((s) => <MenuItem key={s} value={s}>{STAGE_HU[s]}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}><TextField fullWidth type="number" label="Várható létszám" value={f.expected_headcount ?? ''} onChange={set('expected_headcount')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth type="number" label="Várható havi érték (Ft)" value={f.expected_monthly_value ?? ''} onChange={set('expected_monthly_value')} /></Grid>
          <Grid item xs={12} md={6}><TextField fullWidth type="number" label="Valószínűség (%)" value={f.probability ?? ''} onChange={set('probability')} /></Grid>
          <Grid item xs={12} md={6}>
            <TextField fullWidth type="date" label="Várható zárás" InputLabelProps={{ shrink: true }}
                       value={f.expected_close_date ? String(f.expected_close_date).slice(0,10) : ''} onChange={set('expected_close_date')} />
          </Grid>
          {f.stage === 'lost' && (
            <Grid item xs={12}>
              <TextField fullWidth label="Elvesztés oka (kötelező)" value={f.lost_reason_text || ''} onChange={set('lost_reason_text')} />
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={() => onSave(f)}>Mentés</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Quote builder. Every field here has a counterpart in client_night_rates — that is
 * deliberate, because accepting the quote writes one rate row per line.
 */
function QuoteDialog({ value, opportunities, accommodations, onClose, onSave }) {
  const [f, setF] = useState({ lines: [] });
  useEffect(() => { setF(value ? { lines: [], ...value } : { lines: [] }); }, [value]);
  if (!value) return null;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setLine = (i, k, v) => {
    const lines = [...f.lines];
    lines[i] = { ...lines[i], [k]: v };
    setF({ ...f, lines });
  };
  const addLine = () => setF({ ...f, lines: [...f.lines, { billing_basis: 'per_bed_night', quantity: 1 }] });
  const delLine = (i) => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) });

  const lineNet = (l) => {
    const q = Number(l.quantity || 0);
    if (l.billing_basis === 'flat') return Number(l.flat_amount || 0) * (q || 1);
    if (l.billing_basis === 'per_bed_night') return Number(l.rate_used || 0) * q;
    return Number(l.rate_per_night || 0) * q;
  };
  const net = f.lines.reduce((s, l) => s + lineNet(l), 0);
  const vat = Math.round(net * (f.vat_rate == null ? 0.27 : Number(f.vat_rate)) * 100) / 100;

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Új ajánlat</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          Az ajánlat sorai megegyeznek a számlázási díjszabás mezőivel. Elfogadáskor
          minden sorból <strong>egy éjszakadíj</strong> lesz, és létrejön a szerződés —
          nincs külön helyen tartott ár.
        </Alert>
        <Grid container spacing={2} sx={{ mb: 1 }}>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth size="small" label="Lehetőség *" value={f.opportunity_id || ''} onChange={set('opportunity_id')}>
              {opportunities.filter((o) => !['won','lost'].includes(o.stage))
                .map((o) => <MenuItem key={o.id} value={o.id}>{o.title} — {o.lead_name || o.contractor_name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField fullWidth size="small" type="date" label="Érvényes eddig" InputLabelProps={{ shrink: true }}
                       value={f.valid_until || ''} onChange={set('valid_until')} />
          </Grid>
          <Grid item xs={6} md={3}>
            <TextField fullWidth size="small" type="number" label="ÁFA (0.27)" value={f.vat_rate ?? 0.27} onChange={set('vat_rate')} />
          </Grid>
        </Grid>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Megnevezés</TableCell><TableCell>Szálláshely</TableCell><TableCell>Alap</TableCell>
                <TableCell align="right">Díj</TableCell><TableCell align="right">Üres díj</TableCell>
                <TableCell align="right">Min. kihasz.</TableCell><TableCell align="right">Lekötött ágy</TableCell>
                <TableCell align="right">Mennyiség</TableCell><TableCell align="right">Nettó</TableCell><TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {f.lines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell><TextField size="small" variant="standard" value={l.description || ''} onChange={(e) => setLine(i,'description',e.target.value)} /></TableCell>
                  <TableCell>
                    <TextField select size="small" variant="standard" sx={{ minWidth: 130 }}
                               value={l.accommodation_id || ''} onChange={(e) => setLine(i,'accommodation_id',e.target.value)}>
                      <MenuItem value="">Összes</MenuItem>
                      {accommodations.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField select size="small" variant="standard" sx={{ minWidth: 100 }}
                               value={l.billing_basis || 'per_bed_night'} onChange={(e) => setLine(i,'billing_basis',e.target.value)}>
                      {Object.entries(BASIS_HU).map(([k,v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell align="right">
                    <TextField size="small" variant="standard" type="number" sx={{ width: 90 }}
                      value={(l.billing_basis === 'flat' ? l.flat_amount : l.billing_basis === 'per_person' ? l.rate_per_night : l.rate_used) ?? ''}
                      onChange={(e) => setLine(i, l.billing_basis === 'flat' ? 'flat_amount' : l.billing_basis === 'per_person' ? 'rate_per_night' : 'rate_used', e.target.value)} />
                  </TableCell>
                  <TableCell align="right">
                    <TextField size="small" variant="standard" type="number" sx={{ width: 80 }} disabled={l.billing_basis !== 'per_bed_night'}
                               value={l.rate_empty ?? ''} onChange={(e) => setLine(i,'rate_empty',e.target.value)} />
                  </TableCell>
                  <TableCell align="right">
                    <TextField size="small" variant="standard" type="number" sx={{ width: 70 }} disabled={l.billing_basis !== 'per_bed_night'}
                               placeholder="0.9" value={l.occupancy_floor_pct ?? ''} onChange={(e) => setLine(i,'occupancy_floor_pct',e.target.value)} />
                  </TableCell>
                  <TableCell align="right">
                    <TextField size="small" variant="standard" type="number" sx={{ width: 70 }} disabled={l.billing_basis !== 'per_bed_night'}
                               value={l.contracted_beds ?? ''} onChange={(e) => setLine(i,'contracted_beds',e.target.value)} />
                  </TableCell>
                  <TableCell align="right">
                    <TextField size="small" variant="standard" type="number" sx={{ width: 70 }}
                               value={l.quantity ?? ''} onChange={(e) => setLine(i,'quantity',e.target.value)} />
                  </TableCell>
                  <TableCell align="right">{fmtMoney(lineNet(l))}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => delLine(i)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={10}>
                  <Button size="small" startIcon={<AddIcon />} onClick={addLine}>Sor hozzáadása</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" spacing={3} justifyContent="flex-end" sx={{ mt: 2 }}>
          <Typography variant="body2">Nettó: <strong>{fmtMoney(net)}</strong></Typography>
          <Typography variant="body2">ÁFA: <strong>{fmtMoney(vat)}</strong></Typography>
          <Typography variant="body1">Bruttó: <strong>{fmtMoney(net + vat)}</strong></Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" disabled={!f.opportunity_id || f.lines.length === 0}
                onClick={() => onSave(f)}>Ajánlat mentése</Button>
      </DialogActions>
    </Dialog>
  );
}
