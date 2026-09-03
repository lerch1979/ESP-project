import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Stack, Chip, IconButton, Divider,
  ToggleButton, ToggleButtonGroup, MenuItem, CircularProgress, Tooltip, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid,
} from '@mui/material';
import NoteIcon from '@mui/icons-material/StickyNote2';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import GroupsIcon from '@mui/icons-material/Groups';
import EventIcon from '@mui/icons-material/Event';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { toast } from 'react-toastify';
import api from '../services/api';

/**
 * Gyors aktivitás-rögzítés — the quick-note box plus the timeline underneath it.
 *
 * WHY THIS IS NOT A DIALOG
 * ------------------------
 * The capture path is "hang up the phone, type two sentences, done" — target ~20
 * seconds. A dialog costs a click to open, steals focus from the record you are
 * looking at, and hides the previous notes exactly when you want to glance at them.
 * So the box is always open, always at the top, and the history is visible behind it.
 *
 * ONE COMPONENT, FOUR PARTIES
 * ---------------------------
 * `party` is exactly one of { lead_id | opportunity_id | contractor_id |
 * accommodation_id } — the same "exactly one party" rule the table enforces
 * (partner_activities_party_chk). Passing it straight through means the partner tab,
 * the lead drawer and the opportunity drawer are the same code, and a fix to the
 * capture flow lands in all three.
 *
 * The type buttons are a ToggleButtonGroup rather than a Select on purpose: one click
 * instead of open-scroll-pick, which is most of the difference between a 20-second and
 * a 40-second capture.
 *
 * EDITING KEEPS ITS DIALOG — DELIBERATELY
 * ---------------------------------------
 * Capture is one keystroke away; correcting the record is not. The edit dialog lives
 * here rather than in each page so all three surfaces behave identically, and it exposes
 * the fields the quick box hides (tárgy, mikor történt, kivel) — which is exactly what
 * you need when fixing an entry and never what you need when taking one.
 */

const KINDS = [
  { value: 'call',    label: 'Telefon',  icon: <PhoneIcon fontSize="small" /> },
  { value: 'note',    label: 'Jegyzet',  icon: <NoteIcon fontSize="small" /> },
  { value: 'email',   label: 'E-mail',   icon: <EmailIcon fontSize="small" /> },
  { value: 'meeting', label: 'Személyes találkozó', icon: <GroupsIcon fontSize="small" /> },
];
// offer_sent is written by the quote flow, never picked by hand — but it must still
// render in the history, so it lives in the label map and not in the buttons.
const KIND_LABEL = {
  note: 'Jegyzet', call: 'Telefon', meeting: 'Személyes találkozó',
  email: 'E-mail', offer_sent: 'Ajánlat kiküldve',
};
const KIND_COLOR = { call: 'primary', meeting: 'secondary', email: 'info', offer_sent: 'success' };

const fmtDateTime = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}. `
    + `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
};
const fmtDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—'
    : `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}.`;
};

export default function ActivityPanel({
  party,               // { lead_id } | { opportunity_id } | { contractor_id } | { accommodation_id }
  contacts = [],       // optional — offered in the "kivel" selector
  title = 'Aktivitás',
  onChanged,           // optional — parent may want to refresh a count
  maxHeight,           // optional — scroll the history instead of growing the page
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const [kind, setKind] = useState('call');
  const [body, setBody] = useState('');
  const [contactId, setContactId] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [editing, setEditing] = useState(null);
  const bodyRef = useRef(null);

  const partyKey = party ? Object.keys(party).find((k) => party[k]) : null;
  const partyId = partyKey ? party[partyKey] : null;

  const load = useCallback(async () => {
    if (!partyId) { setItems([]); setLoading(false); return; }
    setLoading(true); setErr(null);
    try {
      const r = await api.get('/partners/activities', { params: { [partyKey]: partyId } });
      setItems(r.data?.data || []);
    } catch (e) {
      setErr(e.response?.data?.message || 'Az aktivitások betöltése nem sikerült');
    } finally { setLoading(false); }
  }, [partyKey, partyId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const text = body.trim();
    if (!text) { bodyRef.current?.focus(); return; }
    setSaving(true);
    try {
      await api.post('/partners/activities', {
        [partyKey]: partyId,
        kind,
        body: text,
        contact_id: contactId || undefined,
        // A bare date would make the reminder due at midnight; 09:00 local is when
        // someone would actually act on it.
        follow_up_at: followUp ? `${followUp}T09:00` : undefined,
      });
      setBody(''); setFollowUp(''); setContactId('');
      toast.success(followUp ? 'Rögzítve — a visszahívás bekerült a teendők közé' : 'Rögzítve');
      await load();
      onChanged?.();
      bodyRef.current?.focus();
    } catch (e) {
      toast.error(e.response?.data?.message || 'A mentés nem sikerült');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/partners/activities/${id}`);
      toast.success('Bejegyzés törölve');
      await load(); onChanged?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'A törlés nem sikerült');
    }
  };

  const saveEdit = async (form) => {
    await api.put(`/partners/activities/${form.id}`, {
      kind: form.kind,
      subject: form.subject || null,
      body: form.body || null,
      contact_id: form.contact_id || null,
      occurred_at: form.occurred_at || undefined,
    });
    setEditing(null);
    toast.success('Bejegyzés módosítva');
    await load(); onChanged?.();
  };

  // Ctrl/Cmd+Enter saves without reaching for the mouse.
  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
  };

  if (!partyId) return null;

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Gyors bejegyzés
        </Typography>

        <ToggleButtonGroup
          size="small" exclusive value={kind}
          onChange={(_, v) => v && setKind(v)}
          sx={{ mb: 1.5, flexWrap: 'wrap' }}
        >
          {KINDS.map((k) => (
            <ToggleButton key={k.value} value={k.value} sx={{ px: 1.5, textTransform: 'none' }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                {k.icon}<span>{k.label}</span>
              </Stack>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <TextField
          fullWidth multiline minRows={3} autoComplete="off"
          inputRef={bodyRef}
          placeholder="Miről volt szó? (Ctrl+Enter a mentéshez)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
        />

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mt: 1.5 }}>
          {contacts.length > 0 && (
            <TextField
              select size="small" label="Kivel" sx={{ minWidth: 180 }}
              value={contactId} onChange={(e) => setContactId(e.target.value)}
            >
              <MenuItem value="">—</MenuItem>
              {contacts.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          )}
          <Tooltip title="Valódi feladatot hoz létre a Teendők között, a partnerhez kötve">
            <TextField
              size="small" type="date" label="Visszahívás / emlékeztető"
              InputLabelProps={{ shrink: true }} sx={{ minWidth: 210 }}
              value={followUp} onChange={(e) => setFollowUp(e.target.value)}
            />
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained" onClick={save}
            disabled={saving || !body.trim()}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            Mentés
          </Button>
        </Stack>
      </Paper>

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        {title} {items.length > 0 && `(${items.length})`}
      </Typography>

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          Még nincs rögzített aktivitás. Az első bejegyzés a fenti dobozzal készül.
        </Typography>
      ) : (
        <Box sx={maxHeight ? { maxHeight, overflowY: 'auto', pr: 1 } : undefined}>
          {items.map((a) => (
            <Box key={a.id} sx={{ py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }} flexWrap="wrap">
                <Chip size="small" variant="outlined" color={KIND_COLOR[a.kind] || 'default'}
                      label={KIND_LABEL[a.kind] || a.kind} />
                <Typography variant="caption" color="text.secondary">
                  {fmtDateTime(a.occurred_at)}
                </Typography>
                {/* Who took the note. Stored since mig 145, surfaced from mig 152 on. */}
                <Typography variant="caption" color="text.secondary">
                  · {a.author_name?.trim() || a.author_email || 'ismeretlen'}
                </Typography>
                {a.contact_name && (
                  <Typography variant="caption" color="text.secondary">· {a.contact_name}</Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" onClick={() => setEditing({ ...a })}>
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => remove(a.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
              {a.subject && (
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.subject}</Typography>
              )}
              {a.body && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{a.body}</Typography>
              )}
              {a.follow_up_at && (
                <Chip
                  size="small" sx={{ mt: 0.75 }} icon={<EventIcon />}
                  color={a.follow_up_status === 'done' ? 'success' : 'warning'}
                  label={`Visszahívás: ${fmtDate(a.follow_up_at)}${a.follow_up_status === 'done' ? ' — kész' : ' — nyitott'}`}
                />
              )}
            </Box>
          ))}
        </Box>
      )}
      <EditActivityDialog
        value={editing} contacts={contacts}
        onClose={() => setEditing(null)} onSave={saveEdit}
      />
    </Box>
  );
}

/** Correcting an existing entry. Never the capture path — see the panel's header note. */
function EditActivityDialog({ value, contacts = [], onClose, onSave }) {
  const [form, setForm] = useState(value || {});
  const [err, setErr] = useState(null);
  useEffect(() => { setForm(value || {}); setErr(null); }, [value]);
  if (!value) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async () => {
    try { await onSave(form); } catch (e) { setErr(e.response?.data?.message || 'Mentés sikertelen'); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Bejegyzés szerkesztése</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Típus" value={form.kind || 'note'} onChange={set('kind')}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField select fullWidth label="Kapcsolattartó" value={form.contact_id || ''} onChange={set('contact_id')}>
              <MenuItem value="">—</MenuItem>
              {contacts.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth label="Tárgy" value={form.subject || ''} onChange={set('subject')} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={4} label="Leírás" value={form.body || ''} onChange={set('body')} />
          </Grid>
        </Grid>
        {/* The follow-up is intentionally absent: editing must not silently spawn a
            second task, and the existing one already lives in the Teendők board. */}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Mégse</Button>
        <Button variant="contained" onClick={submit}>Mentés</Button>
      </DialogActions>
    </Dialog>
  );
}

export { KIND_LABEL };
