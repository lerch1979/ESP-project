import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Button, Chip, CircularProgress, Alert, TextField, MenuItem, Stack, Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { toast } from 'react-toastify';
import { exchangeRatesAPI } from '../services/api';

/**
 * MNB árfolyamok — the audit view.
 *
 * A disputed forint figure is settled by one question: what did MNB publish that day?
 * The rate is frozen on each expense, so this page is how you check that frozen number
 * against its source without trusting the record that quotes it.
 *
 * It also carries the unresolved list, because "the month is blocked" is only a fair
 * answer if fixing it is one click from the same screen.
 */
const fmt = (n) => Number(n).toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export default function ExchangeRates() {
  const [rates, setRates] = useState([]);
  const [supported, setSupported] = useState([]);
  const [missing, setMissing] = useState([]);
  const [currency, setCurrency] = useState('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([
        exchangeRatesAPI.list(currency ? { currency } : {}),
        exchangeRatesAPI.missing(),
      ]);
      setRates(r?.data?.rates || []);
      setSupported(r?.data?.supported || []);
      setMissing(m?.data?.expenses || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Az árfolyamok betöltése nem sikerült');
    } finally { setLoading(false); }
  }, [currency]);
  useEffect(() => { load(); }, [load]);

  const retry = async () => {
    setRetrying(true);
    try {
      const r = await exchangeRatesAPI.retry({});
      toast.success(r.message || 'Újrapróbálkozás kész');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Az újrapróbálkozás nem sikerült');
    } finally { setRetrying(false); }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>MNB árfolyamok</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Minden deviza tétel a <strong>teljesítés napjára</strong> érvényes MNB középárfolyamon
        könyvelődik, és az árfolyam rögzül a tételen. Ez a napló mutatja, mit tettünk el —
        egy vitatott összeg ezzel ellenőrizhető az mnb.hu ellenében.
      </Typography>

      {missing.length > 0 && (
        <Alert
          severity="warning" sx={{ mb: 2 }}
          action={
            <Button size="small" startIcon={<RefreshIcon />} disabled={retrying} onClick={retry}>
              Árfolyamok újra lekérése
            </Button>
          }
        >
          <strong>{missing.length} tételnél hiányzik az árfolyam.</strong> Amíg ez így van, az
          érintett hónapok nem zárhatók le — a forint érték ugyanis még nem ismert.
        </Alert>
      )}

      {missing.length > 0 && (
        <TableContainer component={Paper} sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Hónap</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Szálláshely</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Szállító</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Teljesítés</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Eredeti összeg</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {missing.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell>{m.billing_month}</TableCell>
                  <TableCell>{m.accommodation || '—'}</TableCell>
                  <TableCell>{m.vendor_name || m.invoice_number || '—'}</TableCell>
                  <TableCell>{m.performance_date || '—'}</TableCell>
                  <TableCell align="right">
                    {fmt(m.original_amount)} {m.original_currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Paper sx={{ mb: 2, p: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            select size="small" label="Pénznem" sx={{ minWidth: 160 }}
            value={currency} onChange={(e) => setCurrency(e.target.value)}
          >
            <MenuItem value="">Mind</MenuItem>
            {supported.filter((c) => c !== 'HUF').map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            {rates.length} tárolt árfolyam
          </Typography>
        </Stack>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Közzététel napja</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Pénznem</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Árfolyam (HUF)</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Egység</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Forrás</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Lekérve</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rates.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Még nincs tárolt árfolyam.
                </TableCell></TableRow>
              )}
              {rates.map((r) => (
                <TableRow key={`${r.currency}-${r.rate_date}`} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{r.rate_date}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={r.currency} /></TableCell>
                  <TableCell align="right">{fmt(r.rate)}</TableCell>
                  <TableCell align="right">
                    {r.unit > 1
                      ? <Tooltip title="Az MNB ezt a pénznemet 100 egységre jegyzi"><span>{r.unit}</span></Tooltip>
                      : r.unit}
                  </TableCell>
                  <TableCell>{r.source}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {String(r.fetched_at).slice(0, 16).replace('T', ' ')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
