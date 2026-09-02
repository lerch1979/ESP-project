import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, Button, CircularProgress, Alert, TextField, MenuItem, Stack,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Divider, Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import { settlementAPI } from '../services/api';

/**
 * Havi elszámoló lapok (szállástábla).
 *
 * Two documents from one month's stored billing detail:
 *   • SZÁLLÁSADÓ — what we owe for their property
 *   • MEGBÍZÓ    — what they owe us across their sites
 *
 * The month's state (ZÁRT / PISZKOZAT) is shown before anything is downloaded or
 * shared: a sheet from an open month can still change, and it should be a deliberate
 * choice to send one.
 */

const KIND_LABEL = { landlord: 'Szállásadó', client: 'Megbízó' };
const fmtMoney = (n) => (n == null ? '—' : `${Number(n).toLocaleString('hu-HU')} Ft`);
const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—'
    : `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}.`;
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function Settlements() {
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get('month') || thisMonth();
  const kind = searchParams.get('kind') || 'client';
  const partnerId = searchParams.get('partner_id') || '';

  const [partners, setPartners] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareDays, setShareDays] = useState(30);
  const [minted, setMinted] = useState(null);

  const setParam = (k, v) => {
    const next = new URLSearchParams(searchParams);
    if (!v) next.delete(k); else next.set(k, v);
    if (k === 'kind' || k === 'month') next.delete('partner_id');  // partner list changes
    setSearchParams(next, { replace: true });
  };

  const loadPartners = useCallback(async () => {
    try {
      const res = await settlementAPI.partners(month);
      setPartners(res?.data || []);
    } catch (e) { setError(e.response?.data?.message || 'Nem sikerült betölteni a partnereket'); }
  }, [month]);

  const loadLinks = useCallback(async () => {
    try { setLinks((await settlementAPI.listLinks(month))?.data || []); } catch { /* non-fatal */ }
  }, [month]);

  useEffect(() => { loadPartners(); loadLinks(); }, [loadPartners, loadLinks]);

  useEffect(() => {
    if (!partnerId) { setSheet(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await settlementAPI.preview(kind, partnerId, month);
        if (!cancelled) setSheet(res?.data || null);
      } catch (e) {
        if (!cancelled) { setSheet(null); setError(e.response?.data?.message || 'Nem sikerült betölteni a lapot'); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [kind, partnerId, month]);

  const download = async (format) => {
    try {
      const res = await settlementAPI.download(kind, partnerId, month, format);
      const cd = res.headers['content-disposition'] || '';
      const name = (cd.match(/filename="(.+?)"/) || [])[1] || `elszamolas-${month}.${format}`;
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.response?.data?.message || 'Letöltés sikertelen'); }
  };

  const createLink = async () => {
    try {
      const res = await settlementAPI.createLink({ kind, partner_id: partnerId, month, expires_in_days: shareDays });
      setMinted(`${window.location.origin}${res.data.url}`);
      loadLinks();
    } catch (e) { toast.error(e.response?.data?.message || 'Megosztás sikertelen'); }
  };

  const revoke = async (id) => {
    try { await settlementAPI.revokeLink(id); toast.success('Megosztás visszavonva'); loadLinks(); }
    catch (e) { toast.error(e.response?.data?.message || 'Visszavonás sikertelen'); }
  };

  const ofKind = partners.filter((p) => p.kind === kind);
  const closed = sheet?.state?.closed;

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Havi elszámoló lapok</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Szállástábla partnerenként — a szállásadónak amit <strong>mi fizetünk</strong>,
        a megbízónak amit <strong>ő fizet nekünk</strong>. Mindkettő a hónap eltárolt
        számlázási részletéből készül, nem a mostani állapotból.
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            size="small" label="Hónap" value={month} placeholder="YYYY-MM"
            onChange={(e) => setParam('month', e.target.value)} sx={{ width: 140 }}
          />
          <TextField
            select size="small" label="Típus" value={kind}
            onChange={(e) => setParam('kind', e.target.value)} sx={{ width: 170 }}
          >
            <MenuItem value="client">Megbízó (bevétel)</MenuItem>
            <MenuItem value="landlord">Szállásadó (költség)</MenuItem>
          </TextField>
          <TextField
            select size="small" label="Partner" value={partnerId}
            onChange={(e) => setParam('partner_id', e.target.value)} sx={{ minWidth: 280 }}
            helperText={ofKind.length === 0 ? 'Ehhez a hónaphoz nincs elszámolható partner' : ' '}
          >
            {ofKind.map((p) => <MenuItem key={p.id} value={p.id}>{p.name || '(névtelen)'}</MenuItem>)}
          </TextField>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>}

      {sheet && !loading && (
        <>
          <Alert severity={closed ? 'success' : 'warning'} sx={{ mb: 2 }}>
            <strong>{sheet.partner?.name}</strong> — {month} —{' '}
            {closed
              ? `ZÁRT hónap, a számok véglegesek (lezárva: ${fmtDate(sheet.state.finalizedAt)})`
              : 'PISZKOZAT — a hónap nincs lezárva, a számok még változhatnak'}
          </Alert>

          {/* Surfaced, not hidden: the sheet had to mask something to protect attribution. */}
          {(sheet.privacy_warnings || []).length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {sheet.privacy_warnings.length} szobafelirat ügyfélnevet tartalmaz, ezért a
              szállásadói lapon el lett rejtve. Érdemes átnevezni a szobát.
            </Alert>
          )}
          {sheet.empty_reconciles === false && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Az üres ágyak levezetése nem egyezik a kiszámlázott értékkel
              ({sheet.empty_reconciliation?.reconstructed} vs {sheet.empty_reconciliation?.billed}) — ne küldd ki.
            </Alert>
          )}

          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => download('xlsx')}>Excel</Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => download('pdf')}>PDF</Button>
            <Box sx={{ flex: 1 }} />
            <Button startIcon={<LinkIcon />} onClick={() => { setMinted(null); setShareOpen(true); }}>
              Megosztás linkkel
            </Button>
          </Stack>

          <TableContainer component={Paper} sx={{ mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Szálláshely</TableCell>
                  {kind === 'client' ? (
                    <>
                      <TableCell align="right">Foglalt ágyéj</TableCell>
                      <TableCell align="right">Üresen szl.</TableCell>
                      <TableCell align="right">Nettó</TableCell>
                      <TableCell align="right">ÁFA</TableCell>
                      <TableCell align="right">Bruttó</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>Díjalap</TableCell>
                      <TableCell align="right">Díj</TableCell>
                      <TableCell align="right">Ágyéjszaka</TableCell>
                      <TableCell align="right">Fizetendő</TableCell>
                    </>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {(kind === 'client' ? sheet.sites : sheet.accommodations).map((r) => (
                  <TableRow key={r.accommodation_id} hover>
                    <TableCell>{r.accommodation_name}</TableCell>
                    {kind === 'client' ? (
                      <>
                        <TableCell align="right">{r.occupied_bed_nights}</TableCell>
                        <TableCell align="right">{r.reduced_bed_nights}</TableCell>
                        <TableCell align="right">{fmtMoney(r.net)}</TableCell>
                        <TableCell align="right">{fmtMoney(r.vat)}</TableCell>
                        <TableCell align="right">{fmtMoney(r.gross)}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{r.rent_basis || '—'}</TableCell>
                        <TableCell align="right">{fmtMoney(r.rent_rate_used)}</TableCell>
                        <TableCell align="right">{r.bed_nights}</TableCell>
                        <TableCell align="right">{fmtMoney(r.cost_total)}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>ÖSSZESEN</TableCell>
                  {kind === 'client' ? (
                    <>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{sheet.totals.occupied_bed_nights}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{sheet.totals.reduced_bed_nights}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(sheet.totals.net)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(sheet.totals.vat)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(sheet.totals.gross)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell colSpan={2} />
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{sheet.totals.bed_nights}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtMoney(sheet.totals.cost_total)}</TableCell>
                    </>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="caption" color="text.secondary">
            {sheet.grid?.people?.length || 0} fő a napi jelenléti íven
            {(sheet.empty_rows || []).length > 0 && ` · ${sheet.empty_rows.length} "Üres" sor`}
            {(sheet.grid?.workplace_variants || []).length > 0
              && ` · ${sheet.grid.workplace_variants.length} munkahely-elnevezés egységesítve`}
          </Typography>
        </>
      )}

      {links.length > 0 && (
        <Paper sx={{ mt: 3 }}>
          <Typography variant="subtitle1" sx={{ p: 2, pb: 1, fontWeight: 600 }}>Megosztások — {month}</Typography>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Partner</TableCell><TableCell>Típus</TableCell>
                  <TableCell>Lejár</TableCell><TableCell align="right">Megnyitva</TableCell>
                  <TableCell>Állapot</TableCell><TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {links.map((l) => (
                  <TableRow key={l.id} hover>
                    <TableCell>{l.partner_name || '—'}</TableCell>
                    <TableCell>{KIND_LABEL[l.kind] || l.kind}</TableCell>
                    <TableCell>{fmtDate(l.expires_at)}</TableCell>
                    <TableCell align="right">{l.view_count}×</TableCell>
                    <TableCell>
                      <Chip size="small" label={l.active ? 'Aktív' : (l.revoked_at ? 'Visszavonva' : 'Lejárt')}
                            color={l.active ? 'success' : 'default'}
                            variant={l.active ? 'filled' : 'outlined'} />
                    </TableCell>
                    <TableCell align="right">
                      {l.active && (
                        <Tooltip title="Visszavonás">
                          <IconButton size="small" onClick={() => revoke(l.id)}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Dialog open={shareOpen} onClose={() => setShareOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Elszámoló lap megosztása</DialogTitle>
        <DialogContent>
          {!closed && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Ez a hónap még <strong>PISZKOZAT</strong>. A megosztott lap változhat, amíg
              a hónapot le nem zárod.
            </Alert>
          )}
          {!minted ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                A link bejelentkezés nélkül megnyitható, és csak ehhez az egy partnerhez,
                típushoz és hónaphoz ad hozzáférést. Lejáratkor magától érvényét veszti.
              </Typography>
              <TextField
                select fullWidth size="small" label="Érvényesség" value={shareDays}
                onChange={(e) => setShareDays(Number(e.target.value))}
              >
                {[7, 14, 30, 60, 90].map((d) => <MenuItem key={d} value={d}>{d} nap</MenuItem>)}
              </TextField>
            </>
          ) : (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>A link elkészült.</Alert>
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField fullWidth size="small" value={minted} InputProps={{ readOnly: true }} />
                <IconButton onClick={() => { navigator.clipboard?.writeText(minted); toast.success('Vágólapra másolva'); }}>
                  <ContentCopyIcon />
                </IconButton>
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareOpen(false)}>Bezár</Button>
          {!minted && <Button variant="contained" onClick={createLink}>Link létrehozása</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
