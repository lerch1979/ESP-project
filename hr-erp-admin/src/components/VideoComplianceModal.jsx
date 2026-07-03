import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Typography, Button, Box,
  Chip, Stack, IconButton, CircularProgress, Table, TableHead, TableBody,
  TableRow, TableCell, TableContainer, Paper, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { Close as CloseIcon, FileDownload as DownloadIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import { videosAPI, workplacesAPI } from '../services/api';
import { toast } from 'react-toastify';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('hu-HU') : '—');

function SummaryCard({ label, value, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: 1, textAlign: 'center' }}>
      <Typography variant="h5" sx={{ fontWeight: 700, color }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Paper>
  );
}

function VideoComplianceModal({ open, onClose, video }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [workplaces, setWorkplaces] = useState([]);
  const [workplaceFilter, setWorkplaceFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    workplacesAPI.list({ is_active: 'true' })
      .then((r) => setWorkplaces(r?.data?.workplaces || r?.workplaces || r?.data || []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !video) return;
    setLoading(true);
    const params = workplaceFilter ? { workplace_id: workplaceFilter } : {};
    videosAPI.getCompliance(video.id, params)
      .then((r) => setData(r?.data || null))
      .catch(() => toast.error('Megfelelőségi riport betöltése sikertelen'))
      .finally(() => setLoading(false));
  }, [open, video, workplaceFilter]);

  const exportCsv = () => {
    if (!data?.rows?.length) return;
    const headers = ['Név', 'Munkahely', 'Megnézte', 'Dátum', 'Haladás %', 'Nyelv'];
    const rows = data.rows.map((r) => [
      `${r.last_name || ''} ${r.first_name || ''}`.trim(),
      r.workplace || '', r.completed ? 'Igen' : 'Nem', fmtDate(r.completed_at),
      r.progress_pct ?? 0, r.language_watched || '',
    ]);
    const csv = '﻿' + [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `megfeleloseg_${(video.title || 'video').slice(0, 30)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const s = data?.summary;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Megfelelőség — ki nézte meg</Typography>
          <Typography variant="caption" color="text.secondary">{video?.title}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Munkahely szűrő</InputLabel>
            <Select value={workplaceFilter} onChange={(e) => setWorkplaceFilter(e.target.value)} label="Munkahely szűrő">
              <MenuItem value="">{video?.scope === 'workplace' ? 'A videó munkahelye' : 'Mind'}</MenuItem>
              {workplaces.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!data?.rows?.length}>
            CSV export
          </Button>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box>
        ) : !data ? null : (
          <>
            <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
              <SummaryCard label="Célközönség" value={s.total} color="#475569" />
              <SummaryCard label="Megnézte" value={s.completed} color="#16a34a" />
              <SummaryCard label="Hiányzik" value={s.pending} color="#dc2626" />
              <SummaryCard label="Teljesítés" value={`${s.completionPct}%`} color="#8B6B33" />
            </Stack>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Név</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Munkahely</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700 }}>Megnézte</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Dátum</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Haladás</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Nyelv</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.employee_id} hover>
                      <TableCell>{`${r.last_name || ''} ${r.first_name || ''}`.trim() || '—'}</TableCell>
                      <TableCell>{r.workplace || '—'}</TableCell>
                      <TableCell align="center">
                        {r.completed
                          ? <CheckIcon sx={{ color: '#16a34a', fontSize: 20 }} />
                          : <Chip label="Hiányzik" size="small" sx={{ bgcolor: '#fee2e2', color: '#dc2626', height: 22 }} />}
                      </TableCell>
                      <TableCell>{fmtDate(r.completed_at)}</TableCell>
                      <TableCell align="right">{r.progress_pct ?? 0}%</TableCell>
                      <TableCell>{(r.language_watched || '').toUpperCase()}</TableCell>
                    </TableRow>
                  ))}
                  {data.rows.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ color: '#94a3b8', py: 3 }}>
                      Nincs célközönség (a munkahelyhez még nincs lakó rendelve / regisztrálva).
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Bezárás</Button>
      </DialogActions>
    </Dialog>
  );
}

export default VideoComplianceModal;
