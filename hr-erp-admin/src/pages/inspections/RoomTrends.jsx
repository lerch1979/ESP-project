import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, Stack, MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Alert, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, Tooltip, Divider,
} from '@mui/material';
import {
  Refresh as RefreshIcon, Timeline as TimelineIcon,
  TrendingUp as UpIcon, TrendingDown as DownIcon, TrendingFlat as FlatIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { accommodationsAPI, roomsAPI, inspectionsAPI } from '../../services/api';
import GradeBadge from '../../components/inspections/GradeBadge';
import TrendChart from '../../components/inspections/TrendChart';

const TrendIcon = ({ trend }) => {
  if (trend === 'improving') return <UpIcon fontSize="small" sx={{ color: 'success.main' }} />;
  if (trend === 'declining') return <DownIcon fontSize="small" sx={{ color: 'error.main' }} />;
  if (trend === 'stable')    return <FlatIcon fontSize="small" sx={{ color: 'info.main' }} />;
  return null;
};

export default function RoomTrends() {
  const [accommodations, setAccommodations] = useState([]);
  const [selectedAccommodation, setSelectedAccommodation] = useState('');
  const [rooms, setRooms] = useState([]);
  const [roomTrends, setRoomTrends] = useState({});
  const [loading, setLoading] = useState(false);
  const [historyDialog, setHistoryDialog] = useState({ open: false, roomId: null, data: null, loading: false });

  useEffect(() => {
    (async () => {
      try {
        const res = await accommodationsAPI.getAll();
        const list = res?.data || [];
        setAccommodations(list);
        if (list.length > 0) setSelectedAccommodation(list[0].id);
      } catch (e) {
        toast.error('Szálláshelyek betöltése sikertelen');
      }
    })();
  }, []);

  const loadRooms = useCallback(async () => {
    if (!selectedAccommodation) return;
    setLoading(true);
    try {
      const res = await roomsAPI.getAll(selectedAccommodation);
      const roomList = res?.data || [];
      setRooms(roomList);

      // Fetch each room's trend summary in parallel.
      const trends = {};
      await Promise.all(roomList.map(async (r) => {
        try {
          const h = await inspectionsAPI.getRoomHistory(r.id);
          trends[r.id] = h?.data || null;
        } catch {
          trends[r.id] = null;
        }
      }));
      setRoomTrends(trends);
    } catch (e) {
      toast.error('Szobák betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [selectedAccommodation]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const openHistory = async (roomId) => {
    setHistoryDialog({ open: true, roomId, data: null, loading: true });
    try {
      const res = await inspectionsAPI.getRoomHistory(roomId);
      setHistoryDialog({ open: true, roomId, data: res?.data || null, loading: false });
    } catch (e) {
      toast.error('Történet betöltése sikertelen');
      setHistoryDialog({ open: false, roomId: null, data: null, loading: false });
    }
  };

  const summary = useMemo(() => {
    const scored = rooms.filter((r) => roomTrends[r.id]?.trend);
    const improving = scored.filter((r) => roomTrends[r.id].history[0]?.trend === 'improving').length;
    const declining = scored.filter((r) => roomTrends[r.id].history[0]?.trend === 'declining').length;
    const attention = scored.filter((r) => roomTrends[r.id].history[0]?.needs_attention).length;
    return { total: rooms.length, scored: scored.length, improving, declining, attention };
  }, [rooms, roomTrends]);

  const chartData = useMemo(() => {
    if (!historyDialog.data?.history) return [];
    return [...historyDialog.data.history].reverse().map((h) => ({
      date: h.completed_at || h.scored_at || h.created_at,
      score: h.total_score,
    }));
  }, [historyDialog.data]);

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Szoba trendek</Typography>
            <Typography variant="body2" color="text.secondary">
              Szobánkénti pontozás átlaga és trendje ellenőrzésenként
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ minWidth: 280 }}>
              <InputLabel>Szálláshely</InputLabel>
              <Select
                value={selectedAccommodation}
                label="Szálláshely"
                onChange={(e) => setSelectedAccommodation(e.target.value)}
              >
                {accommodations.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton onClick={loadRooms} disabled={loading}><RefreshIcon /></IconButton>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
          <Chip label={`Összes: ${summary.total}`} />
          <Chip label={`Pontozott: ${summary.scored}`} color="default" />
          <Chip icon={<UpIcon />}   label={`Javuló: ${summary.improving}`} color="success" variant="outlined" />
          <Chip icon={<DownIcon />} label={`Romló: ${summary.declining}`} color="error"   variant="outlined" />
          <Chip icon={<WarningIcon />} label={`Figyelmet igényel: ${summary.attention}`} color="warning" variant="outlined" />
        </Stack>
      </Paper>

      <Paper>
        {loading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
        {!loading && rooms.length === 0 && (
          <Alert severity="info" sx={{ m: 2 }}>
            Ehhez a szálláshelyhez nincs rögzített szoba. Hozz létre szobát az Accommodations felületen.
          </Alert>
        )}
        {!loading && rooms.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Szoba</TableCell>
                  <TableCell>Emelet</TableCell>
                  <TableCell>Ágyak</TableCell>
                  <TableCell>Átlag pont</TableCell>
                  <TableCell>Utolsó pont</TableCell>
                  <TableCell>Jegy</TableCell>
                  <TableCell>Trend</TableCell>
                  <TableCell>Ellenőrzések</TableCell>
                  <TableCell>Utolsó dátum</TableCell>
                  <TableCell align="right">Történet</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rooms.map((r) => {
                  const t = roomTrends[r.id];
                  const trendRow = t?.trend;
                  const last = t?.history?.[0];
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{r.room_number}</TableCell>
                      <TableCell>{r.floor ?? '—'}</TableCell>
                      <TableCell>{r.beds ?? '—'}</TableCell>
                      <TableCell>{trendRow?.avg_score ?? '—'}</TableCell>
                      <TableCell>{last?.total_score ?? '—'}</TableCell>
                      <TableCell><GradeBadge grade={last?.grade} /></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <TrendIcon trend={last?.trend} />
                          {last?.score_change != null && (
                            <Typography variant="caption" color={last.score_change > 0 ? 'success.main' : last.score_change < 0 ? 'error.main' : 'text.secondary'}>
                              {last.score_change > 0 ? '+' : ''}{last.score_change}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>{trendRow?.inspection_count ?? 0}</TableCell>
                      <TableCell>
                        {trendRow?.last_inspected_at
                          ? new Date(trendRow.last_inspected_at).toLocaleDateString('hu-HU')
                          : '—'}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Teljes történet">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => openHistory(r.id)}
                              disabled={!trendRow}
                            >
                              <TimelineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog
        open={historyDialog.open}
        onClose={() => setHistoryDialog({ open: false, roomId: null, data: null, loading: false })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Szoba történet
          {historyDialog.data?.room && (
            <Typography variant="body2" color="text.secondary">
              {historyDialog.data.room.accommodation_name} — {historyDialog.data.room.room_number}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {historyDialog.loading && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
          {!historyDialog.loading && historyDialog.data && (
            <>
              {chartData.length > 1 && (
                <Box sx={{ height: 240, mb: 3 }}>
                  <TrendChart data={chartData} />
                </Box>
              )}
              <Divider sx={{ mb: 2 }} />
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Dátum</TableCell>
                    <TableCell>Ellenőrzés</TableCell>
                    <TableCell>Műszaki</TableCell>
                    <TableCell>Higiénia</TableCell>
                    <TableCell>Esztétika</TableCell>
                    <TableCell>Összesen</TableCell>
                    <TableCell>Jegy</TableCell>
                    <TableCell>Változás</TableCell>
                    <TableCell>Lakók</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyDialog.data.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{new Date(h.completed_at || h.created_at).toLocaleDateString('hu-HU')}</TableCell>
                      <TableCell>{h.inspection_number}</TableCell>
                      <TableCell>{h.technical_score}</TableCell>
                      <TableCell>{h.hygiene_score}</TableCell>
                      <TableCell>{h.aesthetic_score}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{h.total_score}</TableCell>
                      <TableCell><GradeBadge grade={h.grade} /></TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <TrendIcon trend={h.trend} />
                          {h.score_change != null && (
                            <Typography variant="caption">
                              {h.score_change > 0 ? '+' : ''}{h.score_change}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {Array.isArray(h.residents_snapshot) ? h.residents_snapshot.length : 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
          {!historyDialog.loading && !historyDialog.data && (
            <Alert severity="info">Nincs megjeleníthető történet.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialog({ open: false, roomId: null, data: null, loading: false })}>Bezár</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
