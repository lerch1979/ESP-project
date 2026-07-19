import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, TextField, MenuItem, Button, IconButton,
  Table, TableHead, TableRow, TableCell, TableBody, Chip, Stack, Alert, CircularProgress, Switch, FormControlLabel,
} from '@mui/material';
import { Delete as DeleteIcon, PlayArrow as RunIcon } from '@mui/icons-material';
import { billingAPI, accommodationsAPI } from '../services/api';
import { toast } from 'react-toastify';

const arr = (res) => {
  if (Array.isArray(res)) return res;
  const d = res?.data ?? res;
  if (Array.isArray(d)) return d;
  return d?.contractors ?? d?.accommodations ?? d?.rows ?? [];
};
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('hu-HU') + ' Ft');
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function BillingRates() {
  const [profiles, setProfiles] = useState([]); // {contractor_id, contractor_name, invoicing_enabled, legal_type, vat_exemption_reason, profile_set}
  const [accs, setAccs] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    contractor_id: '', accommodation_id: '', billing_basis: 'per_person',
    rate_per_night: '', flat_amount: '', vat_exempt: false, vat_rate: '27', valid_from: thisMonth() + '-01', valid_to: '', notes: '',
    rate_used: '', rate_empty: '0', occupancy_floor_pct: '0', contracted_beds: '',
  });
  const [month, setMonth] = useState(thisMonth());
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [coverage, setCoverage] = useState(null);

  const loadRates = useCallback(async () => { try { setRates(arr(await billingAPI.listRates())); } catch { /* */ } }, []);
  const loadProfiles = useCallback(async () => { try { setProfiles(arr(await billingAPI.listProfiles())); } catch { /* */ } }, []);
  const loadCoverage = useCallback(async (m) => { try { setCoverage((await billingAPI.rateCoverage(m)).data); } catch { setCoverage(null); } }, []);

  useEffect(() => {
    (async () => {
      try {
        setAccs(arr(await accommodationsAPI.getAll()));
        await Promise.all([loadRates(), loadProfiles()]);
        await loadCoverage(thisMonth());
      } finally { setLoading(false); }
    })();
  }, [loadRates, loadProfiles, loadCoverage]);

  // ── per-client billing profile (inline, saves immediately) ──
  const saveProfile = async (row, patch) => {
    try {
      await billingAPI.upsertProfile(row.contractor_id, {
        invoicing_enabled: row.invoicing_enabled ?? true,
        legal_type: row.legal_type ?? 'company',
        vat_exemption_reason: row.vat_exemption_reason ?? null,
        ...patch,
      });
      await loadProfiles(); await loadCoverage(month);
    } catch (e) { toast.error(e?.response?.data?.message || 'Hiba'); }
  };

  const addRate = async () => {
    const f = form;
    if (!f.contractor_id || !f.valid_from) { toast.warn('Ügyfél és érvényesség kezdete kötelező'); return; }
    if (f.billing_basis === 'per_person' && f.rate_per_night === '') { toast.warn('Díj/fő/éj kötelező'); return; }
    if (f.billing_basis === 'flat' && (f.flat_amount === '' || !f.accommodation_id)) { toast.warn('Átalányhoz szállás + átalánydíj kötelező'); return; }
    if (f.billing_basis === 'per_bed_night' && f.rate_used === '') { toast.warn('Díj/foglalt ágy/éj kötelező'); return; }
    try {
      await billingAPI.createRate({
        contractor_id: f.contractor_id,
        accommodation_id: f.accommodation_id || null,
        billing_basis: f.billing_basis,
        rate_per_night: f.billing_basis === 'per_person' ? Number(f.rate_per_night) : null,
        flat_amount: f.billing_basis === 'flat' ? Number(f.flat_amount) : null,
        rate_used: f.billing_basis === 'per_bed_night' ? Number(f.rate_used) : null,
        rate_empty: f.billing_basis === 'per_bed_night' ? Number(f.rate_empty || 0) : null,
        occupancy_floor_pct: f.billing_basis === 'per_bed_night' ? Number(f.occupancy_floor_pct || 0) / 100 : null,
        contracted_beds: f.billing_basis === 'per_bed_night' && f.contracted_beds !== '' ? Number(f.contracted_beds) : null,
        vat_exempt: f.vat_exempt,
        vat_rate: f.vat_exempt ? 0 : Number(f.vat_rate) / 100,
        valid_from: f.valid_from, valid_to: f.valid_to || null, notes: f.notes || null,
      });
      toast.success('Díj hozzáadva');
      setForm({ ...f, rate_per_night: '', flat_amount: '', rate_used: '', rate_empty: '0', occupancy_floor_pct: '0', contracted_beds: '', notes: '' });
      loadRates(); loadCoverage(month);
    } catch (e) { toast.error(e?.response?.data?.message || 'Hiba'); }
  };
  const removeRate = async (id) => { try { await billingAPI.deleteRate(id); loadRates(); loadCoverage(month); } catch { toast.error('Hiba'); } };

  const runDraft = async () => {
    setRunning(true); setRunResult(null);
    try {
      const res = await billingAPI.runDraft(month);
      const summary = res?.data || res;
      const billings = arr(await billingAPI.getRunBillings(summary.run_id));
      setRunResult({ summary, billings });
      await loadCoverage(month);
      toast.success('Vázlat számlázás kész');
    } catch (e) { toast.error(e?.response?.data?.message || 'Hiba a futtatáskor'); }
    finally { setRunning(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  const flat = form.billing_basis === 'flat';
  const bed = form.billing_basis === 'per_bed_night';

  return (
    <Box sx={{ p: { xs: 1, md: 3 } }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>Számlázási profil és díjak (ügyfelenként)</Typography>

      {/* ── Per-client billing profile ── */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Ügyfél számlázási profil</Typography>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Ügyfél</TableCell><TableCell>Számlázás</TableCell><TableCell>Jogi típus</TableCell>
            <TableCell>Adómentesség jogcíme</TableCell><TableCell />
          </TableRow></TableHead>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.contractor_id}>
                <TableCell>{p.contractor_name}</TableCell>
                <TableCell>
                  <TextField select size="small" value={String(p.invoicing_enabled ?? true)}
                    onChange={(e) => saveProfile(p, { invoicing_enabled: e.target.value === 'true' })} sx={{ minWidth: 130 }}>
                    <MenuItem value="true">Számlázva</MenuItem>
                    <MenuItem value="false">Kihagyva (nem számlázunk)</MenuItem>
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField select size="small" value={p.legal_type ?? 'company'}
                    onChange={(e) => saveProfile(p, { legal_type: e.target.value })} sx={{ minWidth: 140 }}>
                    <MenuItem value="company">Cég</MenuItem>
                    <MenuItem value="private">Magánszemély</MenuItem>
                  </TextField>
                  {p.legal_type === 'private' && <Chip size="small" color="warning" label="bérszámfejtendő" sx={{ ml: 1 }} />}
                </TableCell>
                <TableCell>
                  <TextField select size="small" value={p.vat_exemption_reason ?? ''}
                    onChange={(e) => saveProfile(p, { vat_exemption_reason: e.target.value || null })} sx={{ minWidth: 150 }}>
                    <MenuItem value="">— (áfás)</MenuItem>
                    <MenuItem value="alanyi">Alanyi adómentes</MenuItem>
                    <MenuItem value="targyi">Tárgyi adómentes</MenuItem>
                  </TextField>
                </TableCell>
                <TableCell>{!p.profile_set && <Chip size="small" variant="outlined" label="alapértelmezett" />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* ── Add rate ── */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Új díj</Typography>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} md={2.5}>
            <TextField select fullWidth size="small" label="Számlázási ügyfél" value={form.contractor_id}
              onChange={(e) => setForm({ ...form, contractor_id: e.target.value })}>
              {profiles.map((c) => <MenuItem key={c.contractor_id} value={c.contractor_id}>{c.contractor_name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField select fullWidth size="small" label="Alap" value={form.billing_basis}
              onChange={(e) => setForm({ ...form, billing_basis: e.target.value })}>
              <MenuItem value="per_person">Fő / éj</MenuItem>
              <MenuItem value="flat">Átalány (property)</MenuItem>
              <MenuItem value="per_bed_night">Ágy / éj (lekötött blokk)</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={2.5}>
            <TextField select fullWidth size="small" label={flat ? 'Szállás (kötelező)' : 'Szállás (üres = alapdíj)'} value={form.accommodation_id}
              onChange={(e) => setForm({ ...form, accommodation_id: e.target.value })}>
              {!flat && <MenuItem value="">Minden szállás (alapdíj)</MenuItem>}
              {accs.map((a) => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={6} md={2}>
            {flat
              ? <TextField fullWidth size="small" type="number" label="Átalánydíj / hó (Ft)" value={form.flat_amount} onChange={(e) => setForm({ ...form, flat_amount: e.target.value })} />
              : bed
              ? <TextField fullWidth size="small" type="number" label="Díj / foglalt ágy / éj (Ft)" value={form.rate_used} onChange={(e) => setForm({ ...form, rate_used: e.target.value })} />
              : <TextField fullWidth size="small" type="number" label="Díj / fő / éj (Ft)" value={form.rate_per_night} onChange={(e) => setForm({ ...form, rate_per_night: e.target.value })} />}
          </Grid>
          {bed && (
            <>
              <Grid item xs={6} md={2}>
                <TextField fullWidth size="small" type="number" label="Díj / üres ágy / éj (Ft)" value={form.rate_empty}
                  onChange={(e) => setForm({ ...form, rate_empty: e.target.value })} helperText="0 = üreseket nem számlázzuk" />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField fullWidth size="small" type="number" label="Kihasználtsági garancia %" value={form.occupancy_floor_pct}
                  onChange={(e) => setForm({ ...form, occupancy_floor_pct: e.target.value })} helperText="pl. 90 → min. 90% árazva" />
              </Grid>
              <Grid item xs={6} md={2}>
                <TextField fullWidth size="small" type="number" label="Lekötött ágyszám" value={form.contracted_beds}
                  onChange={(e) => setForm({ ...form, contracted_beds: e.target.value })} helperText="üres = teljes szállás kapacitása" />
              </Grid>
            </>
          )}
          <Grid item xs={6} md={1.3}>
            <TextField fullWidth size="small" type="number" label="ÁFA %" value={form.vat_exempt ? '' : form.vat_rate} disabled={form.vat_exempt}
              onChange={(e) => setForm({ ...form, vat_rate: e.target.value })} />
          </Grid>
          <Grid item xs={12} md={1.7}>
            <FormControlLabel control={<Switch size="small" checked={form.vat_exempt} onChange={(e) => setForm({ ...form, vat_exempt: e.target.checked })} />} label="Áfamentes" />
          </Grid>
          <Grid item xs={6} md={1.5}>
            <TextField fullWidth size="small" type="date" label="Érvényes -tól" InputLabelProps={{ shrink: true }} value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
          </Grid>
          <Grid item xs={6} md={1.5}>
            <TextField fullWidth size="small" type="date" label="-ig (üres = nyitott)" InputLabelProps={{ shrink: true }} value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          </Grid>
          <Grid item xs={6} md={1}><Button variant="contained" fullWidth onClick={addRate}>Hozzáad</Button></Grid>
        </Grid>
      </Paper>

      {/* ── Rate list ── */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Érvényes díjak</Typography>
        <Table size="small">
          <TableHead><TableRow>
            <TableCell>Ügyfél</TableCell><TableCell>Szállás</TableCell><TableCell>Alap</TableCell>
            <TableCell align="right">Összeg</TableCell><TableCell>ÁFA</TableCell><TableCell>Érvényes</TableCell><TableCell />
          </TableRow></TableHead>
          <TableBody>
            {rates.length === 0 && <TableRow><TableCell colSpan={7}><em>Még nincs díj rögzítve.</em></TableCell></TableRow>}
            {rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.contractor_name}</TableCell>
                <TableCell>{r.accommodation_name || <Chip size="small" label="alapdíj" />}</TableCell>
                <TableCell>{r.billing_basis === 'flat' ? 'átalány' : r.billing_basis === 'per_bed_night' ? 'ágy/éj' : 'fő/éj'}</TableCell>
                <TableCell align="right">
                  {r.billing_basis === 'per_bed_night'
                    ? <>{fmt(r.rate_used)} /foglalt{Number(r.rate_empty) > 0 ? ` · ${fmt(r.rate_empty)} /üres` : ''}
                        {Number(r.occupancy_floor_pct) > 0 ? ` · gar. ${Math.round(Number(r.occupancy_floor_pct) * 100)}%` : ''}
                        {r.contracted_beds != null ? ` · ${r.contracted_beds} ágy` : ''}</>
                    : <>{fmt(r.billing_basis === 'flat' ? r.flat_amount : r.rate_per_night)}{r.billing_basis === 'flat' ? ' /hó' : ' /fő/éj'}</>}
                </TableCell>
                <TableCell>{r.vat_exempt ? <Chip size="small" label="áfamentes" /> : `${Math.round(Number(r.vat_rate) * 100)}%`}</TableCell>
                <TableCell>{r.valid_from}{r.valid_to ? ` – ${r.valid_to}` : ' –'}</TableCell>
                <TableCell align="right"><IconButton size="small" onClick={() => removeRate(r.id)}><DeleteIcon fontSize="small" /></IconButton></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {/* ── Coverage (no silent $0) ── */}
      {coverage && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Lefedettség ({coverage.month})</Typography>
          {coverage.issues.length === 0
            ? <Alert severity="success">Nincs hiányzó díj / profil ebben a hónapban.</Alert>
            : <Alert severity="warning">
                <b>{coverage.issues.length} hiányosság</b> — ezek $0 vagy hibás számlázást okoznának:
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {coverage.issues.map((i, k) => <li key={k}>
                    {i.type === 'no_profile' && `${i.client_name}: profil nincs beállítva`}
                    {i.type === 'no_billing_client' && `${i.accommodation_name}: dolgozó számlázási ügyfél nélkül`}
                    {i.type === 'no_rate' && `${i.client_name} / ${i.accommodation_name}: nincs díj`}
                  </li>)}
                </ul>
              </Alert>}
          {coverage.skipped?.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Kihagyva (szándékos): {coverage.skipped.map((s) => s.client_name).join(', ')}
            </Typography>
          )}
        </Paper>
      )}

      {/* ── Draft run ── */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Vázlat számlázás futtatása</Typography>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <TextField size="small" type="month" label="Hónap" InputLabelProps={{ shrink: true }} value={month}
            onChange={(e) => { setMonth(e.target.value); loadCoverage(e.target.value); }} />
          <Button variant="contained" startIcon={<RunIcon />} onClick={runDraft} disabled={running}>{running ? 'Számolás…' : 'Vázlat futtatása'}</Button>
          <Typography variant="caption" color="text.secondary">Csak vázlat — a véglegesítés + számlázás külön (emberi) lépés.</Typography>
        </Stack>

        {runResult && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              Nettó összesen: <b>{fmt(runResult.summary.total_amount)}</b> · Bruttó: <b>{fmt(runResult.summary.total_gross)}</b> · {runResult.summary.billing_count} tétel
              {runResult.summary.skipped_clients > 0 && <> · {runResult.summary.skipped_clients} ügyfél kihagyva (szándékos)</>}
              {runResult.summary.groups_no_rate > 0 && <> · ⚠ {runResult.summary.groups_no_rate} csoport díj nélkül ($0)</>}
            </Alert>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Szállás</TableCell><TableCell>Ügyfél</TableCell><TableCell align="right">Fő-éj</TableCell>
                <TableCell align="right">Nettó</TableCell><TableCell align="right">ÁFA</TableCell><TableCell align="right">Bruttó</TableCell>
                <TableCell align="right">Költség</TableCell><TableCell align="right">Árrés</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {runResult.billings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.accommodation}</TableCell>
                    <TableCell>{b.client || <Chip size="small" color="warning" label="nincs ügyfél" />}{b.payroll_handoff && <Chip size="small" color="warning" label="bérszámfejtendő" sx={{ ml: 0.5 }} />}</TableCell>
                    <TableCell align="right">{b.total_employee_days}</TableCell>
                    <TableCell align="right">{fmt(b.revenue)}</TableCell>
                    <TableCell align="right">{fmt(b.vat_amount)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(b.gross_amount)}</TableCell>
                    <TableCell align="right">{fmt(b.cost_amount)}</TableCell>
                    <TableCell align="right" sx={{ color: Number(b.margin_amount) >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>{fmt(b.margin_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>
    </Box>
  );
}
