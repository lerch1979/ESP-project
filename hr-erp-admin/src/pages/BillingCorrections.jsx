import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Checkbox, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, Button, CircularProgress, Alert, TextField, MenuItem, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, Collapse, IconButton, Divider, Tooltip,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { billingCorrectionAPI, contractorsAPI, accommodationsAPI, workplacesAPI } from '../services/api';

/**
 * Számlakorrekciók — az előre kiszámlázott ágyszám visszavezetése a tényleges foglaltságra.
 *
 * A havi számla ELŐRE megy ki a lekötött ágyszámra. Ha a megbízó közben elviszi az
 * embereket, a különbözet a KÖVETKEZŐ számlából kerül levonásra.
 *
 * Amiért a képernyő így néz ki:
 *   • A JAVASLAT ÉS A JÓVÁHAGYOTT ÖSSZEG KÜLÖN ÁLL a fejlécben. Egy számba összeadva úgy
 *     tűnne, mintha a teljes összeg levonásra várna, holott a fele még döntésre vár.
 *   • A LEVEZETÉS NYITHATÓ minden soron. Egy hétmilliós levonás mögé fél év múlva is oda
 *     kell tudni nézni: melyik ház, melyik munkahely, hány ágyéjszaka, milyen díjjal.
 *   • A JÓVÁHAGYÁS KÜLÖN GOMB. A javaslat a tényleges foglaltságból számol, az pedig a
 *     kiléptetések átvezetésén múlik — emberi munkán. Hiányos adatból automatikusan
 *     kimenő levonás valódi pénzt visz el.
 */

const STATUS = {
  javaslat:   { label: 'Javaslat',    color: 'warning' },
  jovahagyva: { label: 'Jóváhagyva',  color: 'info' },
  beszamitva: { label: 'Beszámítva',  color: 'success' },
  elvetve:    { label: 'Elvetve',     color: 'default' },
};

const fmtMoney = (n) => (n == null ? '—' : `${Math.round(Number(n)).toLocaleString('hu-HU')} Ft`);
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const nextMonth = () => {
  const d = new Date();
  d.setDate(1); d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function Levezetes({ correction, onToggleLine, busy }) {
  const b = correction.breakdown || {};
  const sorok = b.lines || [];
  return (
    <Box sx={{ m: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Levezetés — {correction.affected_month}
      </Typography>
      {sorok.length === 0 ? (
        <Alert severity="warning" sx={{ mb: 2 }}>Ehhez a korrekcióhoz nincs eltárolt tételsor.</Alert>
      ) : (
        <Table size="small" sx={{ mb: 2, bgcolor: 'background.paper' }}>
          <TableHead>
            <TableRow>
              <TableCell>Szálláshely</TableCell>
              <TableCell>Munkahely</TableCell>
              <TableCell align="right">Előre számlázva</TableCell>
              <TableCell align="right">Tényleges</TableCell>
              <TableCell align="right">Különbözet</TableCell>
              <TableCell align="right">Összeg</TableCell>
              {onToggleLine && <TableCell align="center">Beszámít</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorok.map((r, i) => (
              <TableRow key={r.line_id || i} sx={{ opacity: r.included === false ? 0.45 : 1 }}>
                <TableCell>{r.accommodation}</TableCell>
                <TableCell>{r.workplace}</TableCell>
                {/* Az ágy × nap × díj végig látszik: enélkül a különbözet csak egy szám */}
                <TableCell align="right">
                  {r.invoiced_beds} ágy × {r.invoiced_days} nap × {fmtMoney(r.rate)}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {fmtMoney(r.invoiced_amount)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {r.actual_bed_nights} ágyéj
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {fmtMoney(r.actual_amount)}
                  </Typography>
                </TableCell>
                <TableCell align="right">{r.diff_bed_nights} ágyéj</TableCell>
                <TableCell align="right"
                           sx={{ fontWeight: 700, color: Number(r.diff_amount) < 0 ? 'info.main' : 'error.main' }}>
                  {fmtMoney(r.diff_amount)}
                </TableCell>
                {onToggleLine && (
                  <TableCell align="center">
                    <Checkbox size="small" disabled={busy} checked={r.included !== false}
                              onChange={(e) => onToggleLine(r.line_id, e.target.checked)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Stack direction="row" spacing={3} sx={{ mt: 1 }} flexWrap="wrap">
        <Typography variant="body2">Előre számlázva: <strong>{fmtMoney(correction.invoiced_amount)}</strong></Typography>
        <Typography variant="body2">Tényleges: <strong>{fmtMoney(correction.actual_amount)}</strong></Typography>
        <Typography variant="body2" color={Number(correction.amount) < 0 ? 'info.main' : 'error.main'}>
          {Number(correction.amount) < 0 ? 'Pótszámlázandó' : 'Visszajár'}:{' '}
          <strong>{fmtMoney(Math.abs(Number(correction.amount)))}</strong>
        </Typography>
      </Stack>
      {b.coverage && b.coverage.complete === false && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          A hónapból csak <strong>{b.coverage.days_with_data}/{b.coverage.days_in_month}</strong> napra
          van foglaltsági adat. A különbözet egy része hiányzó adat lehet, nem valós eltérés.
        </Alert>
      )}
      {correction.note && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Megjegyzés: {correction.note}
        </Typography>
      )}
    </Box>
  );
}

function Sor({ c, onApprove, onReject, onSettle, onToggleLine, busy }) {
  const [open, setOpen] = useState(false);
  const st = STATUS[c.status] || { label: c.status, color: 'default' };
  return (
    <>
      <TableRow hover>
        <TableCell sx={{ width: 40 }}>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
          </IconButton>
        </TableCell>
        <TableCell>{c.contractor_name}</TableCell>
        <TableCell>{c.affected_month}</TableCell>
        <TableCell align="right">{fmtMoney(c.invoiced_amount)}</TableCell>
        <TableCell align="right">{fmtMoney(c.actual_amount)}</TableCell>
        <TableCell align="right"
                   sx={{ fontWeight: 700, color: Number(c.amount) < 0 ? 'info.main' : 'error.main' }}>
          {fmtMoney(Math.abs(Number(c.amount)))}
          <Typography variant="caption" sx={{ display: 'block', fontWeight: 400 }}>
            {Number(c.amount) < 0 ? 'pótszámlázandó' : 'visszajár'}
          </Typography>
        </TableCell>
        <TableCell align="right">
          {Number(c.settled_amount) > 0 ? fmtMoney(c.settled_amount) : '—'}
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(Math.abs(Number(c.open_amount)))}</TableCell>
        <TableCell>
          <Chip size="small" variant="outlined"
                label={{ '0-30': '0–30 nap', '31-60': '31–60', '61-90': '61–90', '90+': '90+ nap' }[c.aging_bucket] || '—'}
                color={c.aging_bucket === '90+' ? 'error' : c.aging_bucket === '61-90' ? 'warning' : 'default'} />
        </TableCell>
        <TableCell>
          <Chip size="small" label={st.label} color={st.color}
                variant={c.status === 'javaslat' ? 'outlined' : 'filled'} />
        </TableCell>
        <TableCell align="right">
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            {c.status === 'javaslat' && (
              <>
                <Button size="small" variant="contained" disabled={busy}
                        onClick={() => onApprove(c)}>Jóváhagyás</Button>
                <Button size="small" color="inherit" disabled={busy}
                        onClick={() => onReject(c)}>Elvetés</Button>
              </>
            )}
            {c.status === 'jovahagyva' && (
              <Tooltip title="Rákerül a megadott hónap számlájára, negatív tételsorként">
                <span>
                  <Button size="small" variant="outlined" disabled={busy}
                          onClick={() => onSettle(c)}>Beszámítás</Button>
                </span>
              </Tooltip>
            )}
          </Stack>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell sx={{ py: 0, borderBottom: open ? undefined : 'none' }} colSpan={11}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Levezetes correction={c} busy={busy}
                       onToggleLine={c.status === 'javaslat' ? onToggleLine : null} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function BillingCorrections() {
  const [data, setData] = useState(null);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [newOpen, setNewOpen] = useState(false);
  const [accommodations, setAccommodations] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [form, setForm] = useState({
    contractor_id: '', affected_month: thisMonth(), note: '',
    lines: [{ accommodation_id: '', workplace_id: '', beds: '', days: 30, rate: '' }],
  });

  const setLine = (i, mezo, ertek) => setForm((f) => ({
    ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [mezo]: ertek } : l)),
  }));
  const elozetesOsszeg = form.lines.reduce(
    (a, l) => a + Number(l.beds || 0) * Number(l.days || 0) * Number(l.rate || 0), 0);
  // Egy hiányos sor az EGÉSZ javaslatot elutasítaná a szerveren — inkább itt tiltjuk a gombot.
  const ervenyes = form.contractor_id && /^\d{4}-\d{2}$/.test(form.affected_month)
    && form.lines.every((l) => l.accommodation_id && Number(l.beds) >= 0
      && Number(l.days) > 0 && Number(l.rate) >= 0 && l.beds !== '' && l.rate !== '');

  const nyitottId = useRef(null);
  const [settleFor, setSettleFor] = useState(null);
  const [settleForm, setSettleForm] = useState({ month: nextMonth(), amount: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData((await billingCorrectionAPI.open())?.data || null); }
    catch (e) { setError(e.response?.data?.message || 'Nem sikerült betölteni a korrekciókat'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => {
      try {
        const r = await contractorsAPI.getAll({ limit: 500 });
        setContractors(r?.data?.contractors || r?.data || []);
      } catch { /* a lista nélkül is használható a képernyő */ }
      try {
        const a = await accommodationsAPI.getAll({ limit: 200 });
        setAccommodations(a?.data?.accommodations || a?.data || []);
      } catch { /* nem végzetes */ }
      try {
        const w = await workplacesAPI.list();
        setWorkplaces(w?.data?.workplaces || w?.data || []);
      } catch { /* nem végzetes */ }
    })();
  }, []);

  const propose = async () => {
    setBusy(true);
    try {
      const r = await billingCorrectionAPI.propose({
        contractor_id: form.contractor_id,
        affected_month: form.affected_month,
        lines: form.lines.map((l) => ({
          accommodation_id: l.accommodation_id,
          workplace_id: l.workplace_id || null,
          beds: Number(l.beds), days: Number(l.days), rate: Number(l.rate),
        })),
        note: form.note || null,
      });
      toast.success(r.message || 'Javaslat elkészült');
      setNewOpen(false);
      setForm({ contractor_id: '', affected_month: thisMonth(), note: '',
        lines: [{ accommodation_id: '', workplace_id: '', beds: '', days: 30, rate: '' }] });
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'A javaslat nem készült el'); }
    finally { setBusy(false); }
  };

  const approve = async (c) => {
    if (!window.confirm(
      `${c.contractor_name} — ${c.affected_month}\n\n${fmtMoney(c.amount)} levonása a következő számlából.\n\n`
      + 'Jóváhagyás után rákerülhet egy számlára. Biztosan jóváhagyod?')) return;
    setBusy(true);
    try { toast.success((await billingCorrectionAPI.approve(c.id)).message); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Jóváhagyás sikertelen'); }
    finally { setBusy(false); }
  };

  const reject = async (c) => {
    const note = window.prompt('Miért veted el? (a javaslat megmarad az előzményben)');
    if (note === null) return;
    setBusy(true);
    try { toast.success((await billingCorrectionAPI.reject(c.id, note)).message); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Elvetés sikertelen'); }
    finally { setBusy(false); }
  };

  const toggleLine = async (lineId, included) => {
    setBusy(true);
    try {
      const r = await billingCorrectionAPI.setLine(nyitottId.current, lineId, included);
      toast.success(r.message);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'A tételsor módosítása nem sikerült'); }
    finally { setBusy(false); }
  };

  const settle = async () => {
    setBusy(true);
    try {
      const r = await billingCorrectionAPI.settle(settleFor.id, {
        month: settleForm.month,
        amount: settleForm.amount === '' ? undefined : Number(settleForm.amount),
      });
      toast.success(r.message);
      setSettleFor(null); load();
    } catch (e) { toast.error(e.response?.data?.message || 'Beszámítás sikertelen'); }
    finally { setBusy(false); }
  };

  const rows = data?.rows || [];

  return (
    <Box>
      <Stack direction="row" alignItems="flex-start" sx={{ mb: 0.5 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Számlakorrekciók</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 780 }}>
            A havi számla <strong>előre</strong> megy ki a lekötött ágyszámra. Ha a megbízó közben
            elviszi az embereket, a különbözet a <strong>következő</strong> számlából kerül levonásra,
            külön tételsorként. A rendszer kiszámolja és levezeti — <strong>de nem számítja be
            magától</strong>, mert a tényleges foglaltság a kiléptetések átvezetésén múlik.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
          Új korrekció
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {data && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">DÖNTÉSRE VÁR ({data.javaslat} db)</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
              {fmtMoney(data.javaslat_osszeg)}
            </Typography>
            <Typography variant="caption" color="text.secondary">még nem kerülhet számlára</Typography>
          </Paper>
          <Paper sx={{ p: 2, flex: 1 }}>
            <Typography variant="caption" color="text.secondary">JÓVÁHAGYVA, BESZÁMÍTÁSRA VÁR ({data.jovahagyva} db)</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'info.main' }}>
              {fmtMoney(data.jovahagyva_osszeg)}
            </Typography>
            <Typography variant="caption" color="text.secondary">a következő számlából levonandó</Typography>
          </Paper>
        </Stack>
      )}

      <Alert severity="info" sx={{ mb: 2 }}>
        A korrekció <strong>pénzügyi tétel</strong>: azt mozgatja, mit számlázunk. A profit-kimutatást
        nem érinti — az érintett hónap eredménye már a tényleges foglaltságból számol, tehát ott a
        különbözet másodszor jelenne meg.
      </Alert>

      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Megbízó</TableCell>
                <TableCell>Érintett hónap</TableCell>
                <TableCell align="right">Kiszámlázva</TableCell>
                <TableCell align="right">Tényleges</TableCell>
                <TableCell align="right">Különbözet</TableCell>
                <TableCell align="right">Beszámítva</TableCell>
                <TableCell align="right">Nyitva</TableCell>
                <TableCell>Kor</TableCell>
                <TableCell>Állapot</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nincs nyitott korrekció.
                  </TableCell>
                </TableRow>
              ) : rows.map((c) => (
                <Sor key={c.id} c={c} busy={busy}
                     onToggleLine={(lineId, inc) => { nyitottId.current = c.id; toggleLine(lineId, inc); }}
                     onApprove={approve} onReject={reject}
                     onSettle={(x) => { setSettleFor(x); setSettleForm({ month: nextMonth(), amount: '' }); }} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ÚJ KORREKCIÓ — az ELŐRE SZÁMLÁZOTT tételsorokat ember viszi be, mert a
          Számlázz.hu-integráció még nincs megépítve. Ágy / nap / díj külön mezőben áll,
          nem végösszegként: amikor az integráció elkészül, ugyanezek tölthetők gépből. */}
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Új korrekciós javaslat — előre számlázott tételek</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Vidd be, <strong>mit számláztunk ki előre</strong> arra a hónapra, házanként és
            munkahelyenként. A díj munkahelyenként eltér, ezért kell mindkét bontás. A tényleges
            foglaltságot és a különbözetet a rendszer számolja hozzá.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField select size="small" label="Megbízó" value={form.contractor_id} sx={{ minWidth: 260 }}
                       onChange={(e) => setForm({ ...form, contractor_id: e.target.value })}>
              {contractors.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Érintett hónap (YYYY-MM)" value={form.affected_month}
                       onChange={(e) => setForm({ ...form, affected_month: e.target.value })}
                       helperText="Amire a számla szólt — nem az, amelyikben levonjuk" />
          </Stack>

          <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 200 }}>Szálláshely</TableCell>
                  <TableCell sx={{ minWidth: 150 }}>Munkahely</TableCell>
                  <TableCell align="right">Ágy</TableCell>
                  <TableCell align="right">Nap</TableCell>
                  <TableCell align="right">Díj (Ft)</TableCell>
                  <TableCell align="right">Összeg</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {form.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <TextField select fullWidth size="small" variant="standard" value={l.accommodation_id}
                                 onChange={(e) => setLine(i, 'accommodation_id', e.target.value)}>
                        {accommodations.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField select fullWidth size="small" variant="standard" value={l.workplace_id}
                                 onChange={(e) => setLine(i, 'workplace_id', e.target.value)}>
                        <MenuItem value="">(nincs)</MenuItem>
                        {workplaces.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell align="right" sx={{ width: 90 }}>
                      <TextField fullWidth size="small" variant="standard" type="number" value={l.beds}
                                 onChange={(e) => setLine(i, 'beds', e.target.value)} />
                    </TableCell>
                    <TableCell align="right" sx={{ width: 90 }}>
                      <TextField fullWidth size="small" variant="standard" type="number" value={l.days}
                                 onChange={(e) => setLine(i, 'days', e.target.value)} />
                    </TableCell>
                    <TableCell align="right" sx={{ width: 110 }}>
                      <TextField fullWidth size="small" variant="standard" type="number" value={l.rate}
                                 onChange={(e) => setLine(i, 'rate', e.target.value)} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {fmtMoney(Number(l.beds || 0) * Number(l.days || 0) * Number(l.rate || 0))}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" disabled={form.lines.length === 1}
                                  onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={5} sx={{ fontWeight: 700 }}>ELŐRE SZÁMLÁZOTT ÖSSZESEN</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(elozetesOsszeg)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Button size="small" startIcon={<AddIcon />} onClick={() => setForm({
            ...form, lines: [...form.lines, { accommodation_id: '', workplace_id: '', beds: '', days: 30, rate: '' }],
          })}>Tételsor hozzáadása</Button>

          <TextField fullWidth size="small" label="Megjegyzés" multiline rows={2} sx={{ mt: 2 }}
                     value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewOpen(false)}>Mégse</Button>
          <Button variant="contained" onClick={propose} disabled={busy || !ervenyes}>Kiszámolás</Button>
        </DialogActions>
      </Dialog>

      {/* BESZÁMÍTÁS — a levonás hónapja külön az érintett hónaptól: a szeptemberi
          túlszámlázás az októberi számlán jelenik meg. */}
      <Dialog open={!!settleFor} onClose={() => setSettleFor(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Beszámítás a számlába</DialogTitle>
        <DialogContent>
          {settleFor && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                <strong>{settleFor.contractor_name}</strong> — {settleFor.affected_month} korrekciója,
                nyitva: <strong>{fmtMoney(settleFor.open_amount)}</strong>
              </Alert>
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Melyik hónap számlájára (YYYY-MM)"
                           value={settleForm.month}
                           onChange={(e) => setSettleForm({ ...settleForm, month: e.target.value })} />
                <TextField fullWidth size="small" type="number"
                           label="Beszámítandó összeg (üresen: a teljes nyitott)"
                           value={settleForm.amount}
                           onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })}
                           helperText="Ha a havi díj kisebb a korrekciónál, a maradék nyitva marad a következő számlára" />
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettleFor(null)}>Mégse</Button>
          <Button variant="contained" onClick={settle} disabled={busy || !settleForm.month}>
            Beszámítás
          </Button>
        </DialogActions>
      </Dialog>

      <Divider sx={{ mt: 4 }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        A beszámított korrekciók a megbízói elszámoló lapon jelennek meg, negatív tételsorként.
      </Typography>
    </Box>
  );
}
