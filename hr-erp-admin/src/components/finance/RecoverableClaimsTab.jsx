import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, Button, Stack, Alert, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Tooltip,
} from '@mui/material';
import { expensesAPI } from '../../services/api';
import { toast } from 'react-toastify';

/**
 * Megelőlegezett tételek — amit a szállásadó helyett fizettünk ki, és visszajár tőle.
 *
 * MIÉRT KOROSÍTVA
 * A tulajdonos kérése szó szerint: "Ha valaki hónapokig görget maga előtt egy követelést,
 * azt látni akarom." Egy sima nyitott-lista ezt elrejtené — ugyanúgy nézne ki a 23 000 Ft
 * az első és a hatodik hónapban. Ezért a kor és a korosztály minden soron ott van, a
 * 90 napon túli tételek pedig kiemelve.
 */

const ft = (v) => `${Number(v || 0).toLocaleString('hu-HU')} Ft`;
const BUCKET_COLOR = {
  '0-30 nap': 'default',
  '31-60 nap': 'info',
  '61-90 nap': 'warning',
  '90 napon túl': 'error',
};
const BUCKET_ORDER = ['0-30 nap', '31-60 nap', '61-90 nap', '90 napon túl'];

export default function RecoverableClaimsTab() {
  const [data, setData] = useState({ rows: [], osszesen: 0, savonkent: {}, db: 0 });
  const [loading, setLoading] = useState(false);
  const [recovering, setRecovering] = useState(null);
  const [month, setMonth] = useState(new Date().toISOString().substring(0, 7));
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await expensesAPI.getRecoverable();
      if (res.success) setData(res.data);
    } catch {
      toast.error('Hiba a követelések betöltésekor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openRecover = (row) => {
    setRecovering(row);
    setAmount('');   // üresen: a teljes maradék
    setMonth(new Date().toISOString().substring(0, 7));
  };

  const doRecover = async () => {
    setSaving(true);
    try {
      const payload = { month };
      if (amount !== '') payload.amount = Number(amount);
      const res = await expensesAPI.recover(recovering.id, payload);
      if (res.success) {
        toast.success(res.message);
        setRecovering(null);
        load();
      }
    } catch (e) {
      toast.error(e.response?.data?.message || 'Hiba a levonás rögzítésekor');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, fontWeight: 600 }}>
          Nyitott követelések szállásadók felé
        </Typography>
        <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{ft(data.osszesen)}</Typography>
            <Typography variant="caption" color="text.secondary">{data.db} tétel</Typography>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {BUCKET_ORDER.filter((b) => data.savonkent?.[b]).map((b) => (
              <Chip key={b} size="small" color={BUCKET_COLOR[b]}
                label={`${b}: ${ft(data.savonkent[b])}`} />
            ))}
          </Stack>
        </Stack>
      </Paper>

      {data.rows.length === 0 ? (
        <Alert severity="success">
          Nincs nyitott követelés — minden megelőlegezett tétel elszámolásra került.
        </Alert>
      ) : (
        <>
          {data.savonkent?.['90 napon túl'] > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {ft(data.savonkent['90 napon túl'])} több mint 90 napja nyitott. Ezek a tételek
              hónapok óta görögnek — érdemes megnézni, miért nem kerültek levonásra.
            </Alert>
          )}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Szállásadó</TableCell>
                  <TableCell>Szálláshely</TableCell>
                  <TableCell>Megnevezés</TableCell>
                  <TableCell>Keletkezett</TableCell>
                  <TableCell>Kor</TableCell>
                  <TableCell align="right">Nyitott</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.contractor_name || '—'}</TableCell>
                    <TableCell>{r.accommodation_name || '—'}</TableCell>
                    <TableCell>
                      {[r.vendor_name, r.invoice_number].filter(Boolean).join(' · ') || r.category}
                      {r.recovery_note && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {r.recovery_note}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{String(r.keletkezett || '').substring(0, 10)}</TableCell>
                    <TableCell>
                      <Chip size="small" color={BUCKET_COLOR[r.korosztaly] || 'default'}
                        label={`${r.kor_nap} nap`} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {ft(r.open_amount)}
                      {Number(r.recovered_amount) > 0 && (
                        <Tooltip title={`Már levonva: ${ft(r.recovered_amount)} · ${r.reszletek} részletben`}>
                          <Typography variant="caption" display="block" color="text.secondary">
                            részben levonva
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" variant="outlined" onClick={() => openRecover(r)}>
                        Levonás
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <Dialog open={!!recovering} onClose={saving ? undefined : () => setRecovering(null)}
        maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Levonás rögzítése</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              <strong>{recovering?.contractor_name}</strong> felé fennálló követelés:{' '}
              <strong>{ft(recovering?.open_amount)}</strong>
            </Typography>
            <TextField
              size="small" label="Melyik havi elszámolásban" type="month"
              value={month} onChange={(e) => setMonth(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small" label="Levonandó összeg" type="number"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder={`üresen: a teljes ${ft(recovering?.open_amount)}`}
              helperText="Ha a havi fizetendő kevesebb, add meg a részösszeget — a maradék nyitva marad és átfordul a következő hónapra."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRecovering(null)} disabled={saving}>Mégse</Button>
          <Button variant="contained" onClick={doRecover} disabled={saving}>Levonás</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
