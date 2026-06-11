import React, { useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Alert, List, ListItem,
  ListItemText, TextField, CircularProgress, Snackbar, Typography, Divider,
} from '@mui/material';
import { Lock as LockIcon, VerifiedUser as VerifiedUserIcon } from '@mui/icons-material';
import { anonymizationAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

/**
 * Per-employee GDPR controls for the employee detail modal:
 *  • consent chip / record (HR admins)
 *  • "GDPR anonimizálás" → dry-run preview → typed double-confirm → execute (superadmin only)
 * Self-contained so it can be dropped into the modal footer with one line.
 */
export default function EmployeeGdprAction({ employee, onDone }) {
  const { user } = useAuth();
  const isSuper = !!user?.roleSlugs?.includes('superadmin');
  const [consentAt, setConsentAt] = useState(employee?.data_consent_at || null);
  const [recording, setRecording] = useState(false);
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  if (!employee) return null;
  if (employee.anonymized_at) {
    return <Chip size="small" color="default" label="Anonimizálva" icon={<LockIcon />} />;
  }

  const recordConsent = async () => {
    setRecording(true);
    try {
      const r = await anonymizationAPI.recordConsent(employee.id);
      setConsentAt(r.data.data_consent_at);
      setToast({ severity: 'success', msg: 'Hozzájárulás rögzítve.' });
    } catch { setToast({ severity: 'error', msg: 'Rögzítés sikertelen.' }); }
    finally { setRecording(false); }
  };

  const openPreview = async () => {
    setBusy(true);
    try {
      const r = await anonymizationAPI.preview([employee.id], 'gdpr_request');
      setPlan(r.data.plans?.[0] || null);
      setConfirmText('');
      setOpen(true);
    } catch { setToast({ severity: 'error', msg: 'Előnézet sikertelen (superadmin szükséges).' }); }
    finally { setBusy(false); }
  };

  const execute = async () => {
    setBusy(true);
    try {
      await anonymizationAPI.execute([employee.id], 'gdpr_request');
      setOpen(false);
      setToast({ severity: 'success', msg: 'Anonimizálva (visszafordíthatatlan).' });
      setTimeout(() => onDone && onDone(), 800);
    } catch { setToast({ severity: 'error', msg: 'Anonimizálás sikertelen.' }); }
    finally { setBusy(false); }
  };

  const p = plan?.plan;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {consentAt ? (
        <Chip size="small" color="success" variant="outlined" icon={<VerifiedUserIcon />}
          label={`Hozzájárulás: ${new Date(consentAt).toLocaleDateString('hu-HU')}`} />
      ) : (
        <Button size="small" onClick={recordConsent} disabled={recording}>Hozzájárulás rögzítése</Button>
      )}

      {isSuper && (
        <Button size="small" color="error" startIcon={<LockIcon />} onClick={openPreview} disabled={busy}>
          GDPR anonimizálás
        </Button>
      )}

      <Dialog open={open} onClose={() => !busy && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>GDPR anonimizálás — {p?.currentName || ''}</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>VISSZAFORDÍTHATATLAN.</strong> A személyes adatok törlődnek/álnevesítve lesznek
            ({p?.pseudonym}), a nem-jogszabályi dokumentum-szkennek fizikailag törlődnek. A hibajegyek
            érintetlenül maradnak — ellenőrizze a szabad szöveges mezőket.
          </Alert>
          {p ? (
            <List dense>
              <ListItem><ListItemText primary={`Törölt személyes mezők: ${p.nullEmployeeFields}`} /></ListItem>
              <ListItem><ListItemText primary={`Dokumentum: ${p.documents.delete} törlés / ${p.documents.keepStatutory} megőrzés (jogszabályi)`} /></ListItem>
              <ListItem><ListItemText primary={`Fizikailag törölt fájlok: ${p.filesToDelete.length}`} /></ListItem>
              <ListItem><ListItemText primary={`Egészség/jóllét rekordok törlése: ${p.healthRowsToDelete}`} /></ListItem>
              <ListItem><ListItemText primary={`Értesítések törlése: ${p.notificationsToDelete}`} /></ListItem>
              <ListItem><ListItemText primary={`Érintetlen hibajegyek (kézi ellenőrzésre): ${p.ticketsKeptIntact?.length || 0}`}
                secondary={(p.ticketsKeptIntact || []).slice(0, 6).map((t) => t.ticket_number).join(', ')} /></ListItem>
            </List>
          ) : <Typography color="error" variant="body2">{plan?.error || 'Nem készíthető előnézet.'}</Typography>}
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" sx={{ mb: 1 }}>A megerősítéshez írja be: <strong>ANONIMIZÁL</strong></Typography>
          <TextField fullWidth size="small" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ANONIMIZÁL" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={busy}>Mégse</Button>
          <Button variant="contained" color="error" disabled={confirmText !== 'ANONIMIZÁL' || busy || !p} onClick={execute}>
            {busy ? <CircularProgress size={20} /> : 'Végleges anonimizálás'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}>
        {toast && <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.msg}</Alert>}
      </Snackbar>
    </Box>
  );
}
