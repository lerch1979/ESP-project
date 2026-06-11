import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, Button, Table, TableBody, TableCell, TableHead, TableRow,
  Checkbox, TextField, Alert, Snackbar, CircularProgress, Chip, Divider, List, ListItem, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { Warning as WarningIcon, Lock as LockIcon } from '@mui/icons-material';
import { anonymizationAPI } from '../services/api';

// COUNT-only summary keys → Hungarian labels for the preview dialog.
const SUMMARY_LABELS = {
  employee_pii_fields_nulled: 'Törölt személyes mezők',
  documents_deleted: 'Törölt dokumentumok',
  documents_kept_statutory: 'Megőrzött (jogszabályi) dokumentumok',
  files_to_delete: 'Fizikailag törölt fájlok',
  health_rows_deleted: 'Törölt egészség/jóllét rekordok',
  notifications_deleted: 'Törölt értesítések',
  tickets_kept_intact: 'Érintetlenül hagyott hibajegyek',
};

export default function GDPRAnonymization() {
  const [config, setConfig] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [graceMonths, setGraceMonths] = useState(24);
  const [logs, setLogs] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [plans, setPlans] = useState([]);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cfg, prop, lg] = await Promise.all([
        anonymizationAPI.getConfig(), anonymizationAPI.getProposals(), anonymizationAPI.getLogs(),
      ]);
      setConfig(cfg.data); setGraceMonths(cfg.data.retention_grace_months);
      setProposals(prop.data.proposals || []);
      setLogs(lg.data.logs || []);
    } catch { setToast({ severity: 'error', msg: 'Betöltés sikertelen (superadmin jogosultság szükséges).' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const saveConfig = async () => {
    try {
      await anonymizationAPI.updateConfig({ retention_grace_months: Number(graceMonths) });
      setToast({ severity: 'success', msg: 'Beállítás mentve.' });
      load();
    } catch { setToast({ severity: 'error', msg: 'Mentés sikertelen.' }); }
  };

  const openPreview = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    try {
      const r = await anonymizationAPI.preview(selectedIds, 'retention_expiry');
      setPlans(r.data.plans || []);
      setConfirmText('');
      setPreviewOpen(true);
    } catch { setToast({ severity: 'error', msg: 'Az előnézet sikertelen.' }); }
    finally { setBusy(false); }
  };

  const doExecute = async () => {
    setBusy(true);
    try {
      const r = await anonymizationAPI.execute(selectedIds, 'retention_expiry');
      const okCount = (r.data.results || []).filter((x) => x.ok).length;
      setPreviewOpen(false); setSelected({});
      setToast({ severity: 'success', msg: `${okCount} munkavállaló anonimizálva (visszafordíthatatlan).` });
      load();
    } catch { setToast({ severity: 'error', msg: 'Az anonimizálás sikertelen.' }); }
    finally { setBusy(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <LockIcon color="error" />
        <Typography variant="h4">GDPR — Anonimizálás</Typography>
      </Box>
      <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
        Az anonimizálás <strong>visszafordíthatatlan</strong>: a személyes adatok véglegesen törlődnek vagy álnevesítve
        lesznek (TÖRÖLT-&lt;azonosító&gt;), a dokumentum-szkennek fizikailag törlődnek. A jogszabályi megőrzés alá eső
        adatok (bér, szerződés, számlázás) megmaradnak álnevesítve. A biztonsági mentések {config?.backup_retention_days ?? 30} nap
        után elévülnek (dokumentált „ages out" garancia). A rendszer csak <em>javasol</em> — a végrehajtás emberi döntés.
      </Alert>

      <Grid container spacing={3}>
        {/* Config */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Beállítások</Typography>
            <TextField type="number" fullWidth margin="normal" label="Türelmi idő (hónap)"
              value={graceMonths} onChange={(e) => setGraceMonths(e.target.value)}
              helperText="Inaktiválás (end_date) után ennyivel kerül a javaslati listára." />
            <Typography variant="caption" color="text.secondary">
              Megőrzendő dokumentumtípusok: {(config?.statutory_document_types || []).join(', ') || '—'}
            </Typography>
            <Box sx={{ mt: 2 }}><Button variant="contained" onClick={saveConfig}>Mentés</Button></Box>
          </Paper>
        </Grid>

        {/* Proposal queue */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6">Anonimizálásra javasolt ({proposals.length})</Typography>
              <Button variant="contained" color="error" disabled={selectedIds.length === 0 || busy} onClick={openPreview}>
                Előnézet és anonimizálás ({selectedIds.length})
              </Button>
            </Box>
            {proposals.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Nincs javasolt munkavállaló (a türelmi időt senki sem lépte túl).</Typography>
            ) : (
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Név</TableCell><TableCell>Kilépés (end_date)</TableCell><TableCell>Eltelt napok</TableCell><TableCell>Hozzájárulás</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {proposals.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox checked={!!selected[p.id]} onChange={(e) => setSelected({ ...selected, [p.id]: e.target.checked })} />
                      </TableCell>
                      <TableCell>{p.last_name} {p.first_name}</TableCell>
                      <TableCell>{p.end_date}</TableCell>
                      <TableCell>{p.days_since_end}</TableCell>
                      <TableCell>{p.data_consent_at ? <Chip size="small" color="success" label="rögzítve" /> : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>
        </Grid>

        {/* Log */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Anonimizálási napló</Typography>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Időpont</TableCell><TableCell>Álnév</TableCell><TableCell>Ok</TableCell><TableCell>Próba?</TableCell><TableCell>Összegzés (csak darabszámok)</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {logs.slice(0, 50).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{new Date(l.executed_at).toLocaleString('hu-HU')}</TableCell>
                    <TableCell>{l.pseudonym}</TableCell>
                    <TableCell>{l.reason === 'gdpr_request' ? 'GDPR kérés' : 'Megőrzés lejárt'}</TableCell>
                    <TableCell>{l.dry_run ? 'igen' : 'nem'}</TableCell>
                    <TableCell><Typography variant="caption">{JSON.stringify(l.summary)}</Typography></TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">Nincs bejegyzés.</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>

      {/* Preview + double-confirm dialog */}
      <Dialog open={previewOpen} onClose={() => !busy && setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Anonimizálás előnézet — {selectedIds.length} munkavállaló</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            Ez a művelet <strong>VISSZAFORDÍTHATATLAN</strong>. Az alábbi tételek törlődnek/álnevesítve lesznek.
            A hibajegyek érintetlenül maradnak — kérjük, kézzel ellenőrizze a szabad szöveges mezőket.
          </Alert>
          {plans.map((p) => (
            <Paper variant="outlined" key={p.employeeId} sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2">{p.plan?.currentName || p.employeeId} → {p.plan?.pseudonym}</Typography>
              {p.plan ? (
                <List dense>
                  <ListItem><ListItemText primary={`Törölt személyes mezők: ${p.plan.nullEmployeeFields}`} /></ListItem>
                  <ListItem><ListItemText primary={`Dokumentum: ${p.plan.documents.delete} törlés / ${p.plan.documents.keepStatutory} megőrzés`} /></ListItem>
                  <ListItem><ListItemText primary={`Fizikailag törölt fájlok: ${p.plan.filesToDelete.length}`} /></ListItem>
                  <ListItem><ListItemText primary={`Egészség/jóllét rekordok törlése: ${p.plan.healthRowsToDelete}`} /></ListItem>
                  <ListItem><ListItemText primary={`Értesítések törlése: ${p.plan.notificationsToDelete}`} /></ListItem>
                  <ListItem><ListItemText primary={`Érintetlen hibajegyek (kézi ellenőrzésre): ${p.plan.ticketsKeptIntact?.length || 0}`}
                    secondary={(p.plan.ticketsKeptIntact || []).slice(0, 5).map((t) => t.ticket_number).join(', ')} /></ListItem>
                </List>
              ) : <Typography variant="body2" color="error">{p.error || 'Nem készíthető előnézet'}</Typography>}
            </Paper>
          ))}
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" sx={{ mb: 1 }}>A megerősítéshez írja be: <strong>ANONIMIZÁL</strong></Typography>
          <TextField fullWidth value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ANONIMIZÁL" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} disabled={busy}>Mégse</Button>
          <Button variant="contained" color="error" disabled={confirmText !== 'ANONIMIZÁL' || busy}
            onClick={doExecute}>{busy ? <CircularProgress size={20} /> : 'Végleges anonimizálás'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)}>
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
