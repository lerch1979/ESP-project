import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, CircularProgress, Alert, TextField, Stack, Tooltip,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { noDocumentAPI } from '../../services/api';

/**
 * BIZONYLAT NÉLKÜLI KÖLTSÉGEK — a könyvelőnek egy körben átadható lista.
 *
 * Tulajdonosi döntés: ez NEM blokkol semmit, csak legyen látható és lekérdezhető.
 * Ezért nincs benne se jóváhagyás, se tiltás — ez egy kimutatás, nem kapu.
 *
 * Két dolgot gyűjt, mert a könyvelő szempontjából mindkettő ugyanaz a kérdés
 * ("mi támasztja alá?"), a válasz viszont más:
 *   • BÉRBEADÓI REZSI-JELZÉS — soha nem is lesz a mi nevünkre szóló számla, mert a
 *     közüzemi szerződés a bérbeadó nevén van. Nincs levonható áfa.
 *   • CSATOLMÁNY NÉLKÜLI TÉTEL — lehet, hogy csak elmaradt a feltöltés.
 *
 * A "csatolva" oszlop külön áll, mert egy szolgáltatói számla fotójával alátámasztott
 * jelzés egészen más súlyú, mint egy puszta közlés — de egyik sem a mi számlánk.
 */

const fmtMoney = (n) => (n == null ? '—' : `${Math.round(Number(n)).toLocaleString('hu-HU')} Ft`);
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function NoDocumentTab() {
  const [month, setMonth] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData((await noDocumentAPI.list(month ? { month } : {}))?.data || null);
    } catch (e) {
      setError(e.response?.data?.message || 'Nem sikerült betölteni a listát');
    } finally { setLoading(false); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows || [];

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Bizonylat nélküli költségek</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 820 }}>
        Olyan tételek, amelyekhez nem tartozik a mi nevünkre szóló szállítói számla. Ez nem hiba
        és nem akadályoz semmit — a magánszemélytől bérelt lakásoknál ez a normális eset —, de a
        könyvelőnek egy körben át kell tudni adni.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems="center">
        <TextField size="small" label="Hónap (YYYY-MM, üresen: mind)" value={month}
                   onChange={(e) => setMonth(e.target.value)} sx={{ width: 240 }} />
        {data && (
          <>
            <Paper sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary">ÖSSZESEN ({data.db} tétel)</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{fmtMoney(data.osszesen)}</Typography>
            </Paper>
            <Paper sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary">ebből bérbeadói jelzés</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{data.jelzes} db</Typography>
            </Paper>
            <Paper sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary">van csatolmány</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{data.csatolmannyal} db</Typography>
            </Paper>
          </>
        )}
      </Stack>

      {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Hónap</TableCell>
                <TableCell>Szálláshely</TableCell>
                <TableCell>Megnevezés</TableCell>
                <TableCell>Típus</TableCell>
                <TableCell>Kinek fizetjük</TableCell>
                <TableCell align="center">Csatolva</TableCell>
                <TableCell align="right">Összeg</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nincs bizonylat nélküli tétel.
                  </TableCell>
                </TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.billing_month}</TableCell>
                  <TableCell>{r.accommodation_name}</TableCell>
                  <TableCell>{r.vendor_name || r.category}</TableCell>
                  <TableCell>
                    {r.source === 'landlord_utility_notice' ? (
                      <Tooltip title="A közüzemi szerződés a bérbeadó nevén van — a mi nevünkre számla nem keletkezik, ezért nincs levonható áfa">
                        <Chip size="small" color="info" variant="outlined" label="Bérbeadói rezsi-jelzés" />
                      </Tooltip>
                    ) : (
                      <Chip size="small" variant="outlined" label="Csatolmány nélkül" />
                    )}
                  </TableCell>
                  <TableCell>{r.payable_to_name || '—'}</TableCell>
                  <TableCell align="center">
                    {r.van_csatolmany
                      ? <Tooltip title="Van feltöltött fotó/PDF"><AttachFileIcon fontSize="small" color="success" /></Tooltip>
                      : <Tooltip title="Semmilyen alátámasztó dokumentum nincs feltöltve"><WarningAmberIcon fontSize="small" color="warning" /></Tooltip>}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtMoney(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        A bérbeadói rezsi-jelzésnél a teljes összeg költség, áfabontás nélkül — nevünkre szóló
        számla híján nincs levonható áfa. A rendszer vissza is utasítja, ha valaki áfát ír rá.
      </Typography>
    </Box>
  );
}
