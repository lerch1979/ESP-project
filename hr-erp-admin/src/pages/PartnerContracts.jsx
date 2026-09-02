import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, ToggleButton, ToggleButtonGroup, CircularProgress, Alert, Tooltip,
  TextField, MenuItem, Stack,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api from '../services/api';

/**
 * Szerződések — the cross-partner-type contract board.
 *
 * This page exists to answer one operational question: "which sites can we still get
 * out of this quarter?" That is a question about NOTICE DEADLINES, not expiry dates —
 * once the notice window closes an auto-renewing lease is locked for another term. So
 * the default sort is by soonest ACTIONABLE date (the backend's next_action_date =
 * min(notice_deadline, end_date)), and the notice date is called out in its own column
 * rather than being derivable-but-invisible.
 */

const ROLE_LABEL = { megbizo: 'Megbízó', szallasado: 'Szállásadó', alvallalkozo: 'Alvállalkozó' };
const ROLE_COLOR = { megbizo: 'success', szallasado: 'warning', alvallalkozo: 'default' };
const STATUS_LABEL = { draft: 'Piszkozat', active: 'Élő', expired: 'Lejárt', terminated: 'Felmondva' };

// pg DATE columns arrive as local-midnight timestamps; format from LOCAL parts so the
// day never shifts back under CEST (the repo-wide toISOString footgun).
const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}.`;
};

const daysUntil = (d) => {
  if (!d) return null;
  const x = new Date(d);
  const today = new Date();
  const a = Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / 86400000);
};

/**
 * Urgency of the soonest actionable date, mirroring the expiry monitor's buckets.
 *
 * A ROLLING exit is deliberately never red. A notice deadline can be missed — after it
 * the contract renews and the exit is gone for a term. A rolling notice cannot be
 * missed: it is standing permission to leave in N days. Colouring it as a deadline
 * would train people to ignore the real ones.
 */
function urgency(days, kind) {
  if (kind === 'rolling') {
    return { color: 'info', label: days === null ? 'felmondható' : `felmondható — ${days} nap` };
  }
  if (days === null) return { color: 'default', label: '—' };
  if (days < 0) return { color: 'error', label: `${Math.abs(days)} napja lejárt` };
  if (days <= 30) return { color: 'error', label: `${days} nap` };
  if (days <= 90) return { color: 'warning', label: `${days} nap` };
  return { color: 'default', label: `${days} nap` };
}

export default function PartnerContracts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const within = searchParams.get('within_days') || '';
  const role = searchParams.get('contract_role') || '';
  const leasesOnly = searchParams.get('leases_only') === 'true';
  const highlight = searchParams.get('highlight'); // deep link from an expiry alert

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (within) params.within_days = within;
      if (role) params.contract_role = role;
      if (leasesOnly) params.leases_only = 'true';
      const res = await api.get('/partners/contracts', { params });
      setRows(res.data?.data?.contracts || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Nem sikerült betölteni a szerződéseket');
    } finally {
      setLoading(false);
    }
  }, [within, role, leasesOnly]);

  useEffect(() => { load(); }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === null || value === false) next.delete(key);
    else next.set(key, String(value));
    setSearchParams(next, { replace: true });
  };

  // How many contracts need a decision inside the next quarter — the headline the page
  // is really for.
  const actionableSoon = useMemo(
    // Rolling exits are excluded: nothing is at risk of being missed, so counting them
    // here would inflate an alarm that is meant to mean "act or lose the option".
    // Only where money is actually gated by a date. A contract whose cost we can stop
    // immediately is not an "act or lose it" item however its notice period reads.
    () => rows.filter((r) => {
      if (r.financial_exit_kind === 'immediate') return false;
      if (r.next_action_kind === 'rolling') return false;
      const d = daysUntil(r.next_action_date);
      return d !== null && d <= 90;
    }).length,
    [rows],
  );

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>Szerződések</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Minden partnertípus egy helyen, a legközelebbi <strong>teendő</strong> szerint rendezve —
        a felmondási határidő előbbre való, mint a lejárat.
      </Typography>

      {actionableSoon > 0 && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          <strong>{actionableSoon}</strong> szerződésnél 90 napon belül lépni kell
          (felmondási határidő vagy lejárat).
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={within}
            onChange={(_, v) => setParam('within_days', v ?? '')}
          >
            <ToggleButton value="30">30 nap</ToggleButton>
            <ToggleButton value="90">Negyedév</ToggleButton>
            <ToggleButton value="180">Fél év</ToggleButton>
            <ToggleButton value="">Mind</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            select size="small" label="Szerepkör" value={role}
            onChange={(e) => setParam('contract_role', e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Mind</MenuItem>
            <MenuItem value="megbizo">Megbízó</MenuItem>
            <MenuItem value="szallasado">Szállásadó</MenuItem>
            <MenuItem value="alvallalkozo">Alvállalkozó</MenuItem>
          </TextField>

          <ToggleButton
            size="small" value="leases" selected={leasesOnly}
            onChange={() => setParam('leases_only', !leasesOnly)}
          >
            Csak bérleti szerződések
          </ToggleButton>
        </Stack>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Partner</TableCell>
                <TableCell>Ingatlan</TableCell>
                <TableCell>Szerepkör</TableCell>
                <TableCell>Megnevezés</TableCell>
                <TableCell>Felmondási határidő</TableCell>
                <TableCell>Lejárat</TableCell>
                <TableCell>Kilépés</TableCell>
                <TableCell>Állapot</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      Nincs a szűrésnek megfelelő szerződés.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const d = daysUntil(r.next_action_date);
                const u = urgency(d, r.next_action_kind);
                return (
                  <TableRow
                    key={r.id}
                    selected={highlight === r.id}
                    hover
                  >
                    <TableCell>{r.contractor_name || '—'}</TableCell>
                    <TableCell>
                      {r.accommodation_name
                        ? <Tooltip title="Bérleti szerződés (ingatlanhoz kötött)"><span>{r.accommodation_name}</span></Tooltip>
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={ROLE_LABEL[r.contract_role] || r.contract_role}
                            color={ROLE_COLOR[r.contract_role] || 'default'} variant="outlined" />
                    </TableCell>
                    <TableCell>{r.title || r.contract_no || '—'}</TableCell>
                    <TableCell>
                      {r.notice_deadline
                        ? <strong>{fmtDate(r.notice_deadline)}</strong>
                        : r.next_action_kind === 'rolling'
                          ? <Typography variant="body2">{r.notice_days} nap <Typography component="span" variant="caption" color="text.secondary">(folyamatos)</Typography></Typography>
                          : <Typography variant="caption" color="text.secondary">nincs megadva</Typography>}
                    </TableCell>
                    <TableCell>
                      {r.is_open_ended ? (
                        <>
                          <Chip size="small" label="Határozatlan" variant="outlined" />
                          {r.earliest_exit_date && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              legkorábbi kilépés: {fmtDate(r.earliest_exit_date)}
                            </Typography>
                          )}
                        </>
                      ) : fmtDate(r.end_date)}
                    </TableCell>
                    <TableCell><ExitCell row={r} urgency={u} /></TableCell>
                    <TableCell>{STATUS_LABEL[r.status] || r.status}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

/**
 * The two exits, side by side.
 *
 * "When can we get out of this site?" has two answers and merging them misprices the
 * decision. Under a per-actual-use contract with no minimum (Barcza / Sarród I.) the
 * COST stops as soon as we move people out — the notice period gates nothing
 * financially. The LEGAL exit still matters: handover condition, house rules and
 * liability run until the contract ends, and the notice period is symmetric, so the
 * landlord can terminate on the same terms. That is our risk, not theirs.
 *
 * Where the money keeps running until the relationship ends (flat rent, or a per-use
 * deal with a floor) the two coincide, and only one line is shown — a second line
 * repeating the same date would be noise.
 */
function ExitCell({ row, urgency: u }) {
  const immediate = row.financial_exit_kind === 'immediate';
  const finDays = daysUntil(row.financial_exit_date);
  const legalDays = daysUntil(row.legal_exit_date);
  const sameDate = row.financial_exit_date && row.legal_exit_date
    && String(row.financial_exit_date).slice(0, 10) === String(row.legal_exit_date).slice(0, 10);

  if (!row.legal_exit_date && !row.financial_exit_date) {
    return <Chip size="small" color={u.color} label={u.label}
                 variant={u.color === 'default' ? 'outlined' : 'filled'} />;
  }

  return (
    <Box>
      <Tooltip title={immediate
        ? 'Tényleges használat szerinti díj, minimum nélkül — a költség kiköltöztetéssel azonnal nullázható, felmondás nélkül.'
        : 'A díj a felmondási idő végéig fut (fix díj vagy garantált minimum), ezért a felmondás dátuma egyben a költség-stop dátuma.'}>
        <Chip
          size="small"
          color={immediate ? 'success' : u.color}
          variant={immediate ? 'filled' : (u.color === 'default' ? 'outlined' : 'filled')}
          label={immediate
            // Where the cost is gated by notice, the DATE is the number that matters —
            // it is the day the money actually stops, not just a countdown.
            ? 'Pénzügyi kilépés: azonnal'
            : `Pénzügyi kilépés: ${fmtDate(row.financial_exit_date)}${finDays !== null ? ` (${finDays} nap)` : ''}`}
        />
      </Tooltip>
      {immediate && (
        <Typography variant="caption" display="block" color="text.secondary">
          kiköltöztetéssel
        </Typography>
      )}
      {!sameDate && (
        <Tooltip title="A szerződéses jogviszony vége. A felmondás KÖLCSÖNÖS — a szállásadó is felmondhat ránk ugyanezzel a határidővel.">
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
            Jogi felmondás: {legalDays !== null ? `${legalDays} nap` : '—'}
            {row.legal_exit_date ? ` → ${fmtDate(row.legal_exit_date)}` : ''}
          </Typography>
        </Tooltip>
      )}
    </Box>
  );
}
