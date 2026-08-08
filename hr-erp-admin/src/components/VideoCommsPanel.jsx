import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Tabs, Tab, Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Typography, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Alert, Switch, FormControlLabel, LinearProgress, Divider, IconButton,
} from '@mui/material';
import { Delete as DeleteIcon, Send as SendIcon, Add as AddIcon } from '@mui/icons-material';
import { videoCommsAPI, videosAPI } from '../services/api';
import { toast } from 'react-toastify';

/**
 * Resident video communication (mig 143) — the SEND side of the video module.
 *
 *   Küldés     Mode B: pick a video + audience + send now
 *   Sorozatok  Modes A1/A2: several sequences, created here without code changes —
 *              move-in anchored, employment-start anchored, or annually recurring calendar
 *   Előzmények delivery record + who was SENT it vs. who WATCHED it (mandatory evidence)
 *   Beállítás  per-day cap and the mandatory re-nag window
 *
 * The audience preview is deliberately prominent: "whoever it concerns" is the default,
 * and a blanket send has to be chosen on purpose.
 */

const ANCHOR_LABELS = {
  move_in: 'Beköltözéstől (arrival_date)',
  employment_start: 'Munkakezdéstől (start_date)',
  calendar: 'Naptári dátum (évente ismétlődő)',
};

const emptyAudience = { all: false, accommodation_ids: [], workplace_ids: [], megbizo_ids: [], nationalities: [], languages: [] };

function AudiencePicker({ options, value, onChange, preview, onPreview }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const multi = (label, key, items, getLabel) => (
    <FormControl fullWidth size="small" sx={{ mb: 1.5 }} disabled={value.all}>
      <InputLabel>{label}</InputLabel>
      <Select
        multiple
        value={value[key] || []}
        onChange={(e) => set(key, e.target.value)}
        label={label}
        renderValue={(sel) => `${sel.length} kiválasztva`}
      >
        {(items || []).map((o) => (
          <MenuItem key={o.id || o.value} value={o.id || o.value}>
            {getLabel(o)} {o.residents != null && <Chip size="small" label={`${o.residents} fő`} sx={{ ml: 1 }} />}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box>
      <FormControlLabel
        control={<Switch checked={!!value.all} onChange={(e) => onChange({ ...emptyAudience, all: e.target.checked })} />}
        label={<b>Mindenki (teljes lakókör)</b>}
      />
      <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
        Szűrő nélkül senki nem kapja meg — a körlevél tudatos döntés, nem véletlen.
      </Typography>
      {multi('Szálláshely', 'accommodation_ids', options?.accommodations, (o) => o.name)}
      {multi('Munkahely', 'workplace_ids', options?.workplaces, (o) => o.name)}
      {multi('Megbízó', 'megbizo_ids', options?.megbizok, (o) => o.name)}
      {multi('Nemzetiség', 'nationalities', options?.nationalities, (o) => o.value)}
      {multi('Nyelv', 'languages', options?.languages, (o) => o.value)}

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <Button size="small" variant="outlined" onClick={onPreview}>Címzettek előnézete</Button>
        {preview && (
          <Typography variant="body2">
            <b>{preview.count} fő</b>
            {preview.by_language && Object.keys(preview.by_language).length > 0 &&
              ` · ${Object.entries(preview.by_language).map(([l, n]) => `${l}: ${n}`).join(', ')}`}
          </Typography>
        )}
      </Stack>
      {preview?.warnings?.map((w, i) => <Alert key={i} severity="warning" sx={{ mt: 1, py: 0 }}>{w}</Alert>)}
    </Box>
  );
}

export default function VideoCommsPanel() {
  const [tab, setTab] = useState(0);
  const [videos, setVideos] = useState([]);
  const [options, setOptions] = useState(null);

  // send
  const [videoId, setVideoId] = useState('');
  const [audience, setAudience] = useState({ ...emptyAudience });
  const [mandatory, setMandatory] = useState(false);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);

  // sequences
  const [sequences, setSequences] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newSeq, setNewSeq] = useState({ name: '', anchor_type: 'move_in' });
  const [newStep, setNewStep] = useState({ video_id: '', day_offset: 1, month_day: '', is_mandatory: false });

  // history + config
  const [announcements, setAnnouncements] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [config, setConfig] = useState(null);

  const load = useCallback(async () => {
    try {
      const [v, o] = await Promise.all([videosAPI.getAll({ limit: 200 }), videoCommsAPI.audienceOptions()]);
      setVideos(v.data?.videos || []);
      setOptions(o.data);
    } catch { toast.error('Betöltési hiba'); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab === 1) videoCommsAPI.listSequences().then((r) => setSequences(r.data.sequences)).catch(() => {});
    if (tab === 2) videoCommsAPI.listAnnouncements().then((r) => setAnnouncements(r.data.announcements)).catch(() => {});
    if (tab === 3) videoCommsAPI.getConfig().then((r) => setConfig(r.data)).catch(() => {});
  }, [tab]);

  const doPreview = async () => {
    try { setPreview((await videoCommsAPI.previewAudience(audience)).data); }
    catch { toast.error('Előnézeti hiba'); }
  };

  const doSend = async () => {
    if (!videoId) return toast.error('Válassz videót');
    setSending(true);
    try {
      const r = await videoCommsAPI.send({ video_id: videoId, audience, is_mandatory: mandatory });
      toast.success(`Elküldve ${r.data.recipient_count} címzettnek (${r.data.languages.join(', ')})`);
      setPreview(null);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Küldési hiba');
    } finally { setSending(false); }
  };

  const openSequence = async (id) => {
    try { setSelected((await videoCommsAPI.getSequence(id)).data.sequence); }
    catch { toast.error('Lekérési hiba'); }
  };

  return (
    <Box>
      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2, '& .Mui-selected': { color: '#8B6B33' }, '& .MuiTabs-indicator': { bgcolor: '#8B6B33' } }}>
        <Tab label="Küldés most" />
        <Tab label="Sorozatok" />
        <Tab label="Előzmények & nézettség" />
        <Tab label="Beállítások" />
      </Tabs>

      {/* ── Mode B ─────────────────────────────────────────────── */}
      {tab === 0 && (
        <Box>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Videó</InputLabel>
            <Select value={videoId} onChange={(e) => setVideoId(e.target.value)} label="Videó">
              {videos.map((v) => <MenuItem key={v.id} value={v.id}>{v.title}</MenuItem>)}
            </Select>
          </FormControl>
          <AudiencePicker options={options} value={audience} onChange={setAudience} preview={preview} onPreview={doPreview} />
          <FormControlLabel
            sx={{ mt: 1 }}
            control={<Switch checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />}
            label="Kötelező megtekintés (emlékeztető, ha 3 napig nem nézte meg)"
          />
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" startIcon={<SendIcon />} onClick={doSend} disabled={sending}
              sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6F5529' } }}>
              {sending ? 'Küldés…' : 'Küldés most'}
            </Button>
          </Box>
        </Box>
      )}

      {/* ── Modes A1/A2 ────────────────────────────────────────── */}
      {tab === 1 && (
        <Box>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Új sorozat</Typography>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Név" value={newSeq.name} onChange={(e) => setNewSeq({ ...newSeq, name: e.target.value })} sx={{ flex: 1 }} />
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel>Horgony</InputLabel>
                <Select value={newSeq.anchor_type} label="Horgony" onChange={(e) => setNewSeq({ ...newSeq, anchor_type: e.target.value })}>
                  {Object.entries(ANCHOR_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={async () => {
                try {
                  await videoCommsAPI.createSequence({ ...newSeq, audience });
                  toast.success('Sorozat létrehozva');
                  setNewSeq({ name: '', anchor_type: 'move_in' });
                  setSequences((await videoCommsAPI.listSequences()).data.sequences);
                } catch (e) { toast.error(e?.response?.data?.message || 'Hiba'); }
              }}>Létrehoz</Button>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              A célközönség a fenti „Küldés most” fülön beállított szűrő lesz.
            </Typography>
          </Paper>

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Név</TableCell><TableCell>Horgony</TableCell><TableCell align="right">Lépés</TableCell>
                <TableCell align="right">Kiküldve</TableCell><TableCell align="center">Aktív</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {sequences.map((s) => (
                  <TableRow key={s.id} hover onClick={() => openSequence(s.id)} sx={{ cursor: 'pointer' }}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{ANCHOR_LABELS[s.anchor_type]}</TableCell>
                    <TableCell align="right">{s.step_count}</TableCell>
                    <TableCell align="right">{s.sends}</TableCell>
                    <TableCell align="center">
                      <Switch size="small" checked={s.is_active} onClick={(e) => e.stopPropagation()}
                        onChange={async (e) => {
                          await videoCommsAPI.updateSequence(s.id, { is_active: e.target.checked });
                          setSequences((await videoCommsAPI.listSequences()).data.sequences);
                        }} />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={async (e) => {
                        e.stopPropagation();
                        await videoCommsAPI.deleteSequence(s.id);
                        setSequences((await videoCommsAPI.listSequences()).data.sequences);
                      }}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {selected && (
            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selected.name} — lépések</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                A nap-index tetszőleges (1, 2, 3, 7, 14, 30) — az első héten sűrűbben, utána ritkábban.
              </Typography>
              <Table size="small">
                <TableBody>
                  {(selected.steps || []).map((st) => (
                    <TableRow key={st.id}>
                      <TableCell width={110}>
                        {selected.anchor_type === 'calendar' ? st.month_day : `${st.day_offset}. nap`}
                      </TableCell>
                      <TableCell>{st.video_title}</TableCell>
                      <TableCell>{st.is_mandatory && <Chip size="small" color="warning" label="kötelező" />}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={async () => {
                          await videoCommsAPI.deleteStep(selected.id, st.id);
                          openSequence(selected.id);
                        }}><DeleteIcon fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel>Videó</InputLabel>
                  <Select value={newStep.video_id} label="Videó" onChange={(e) => setNewStep({ ...newStep, video_id: e.target.value })}>
                    {videos.map((v) => <MenuItem key={v.id} value={v.id}>{v.title}</MenuItem>)}
                  </Select>
                </FormControl>
                {selected.anchor_type === 'calendar' ? (
                  <TextField size="small" label="Hónap-nap (HH-NN)" placeholder="12-20" value={newStep.month_day}
                    onChange={(e) => setNewStep({ ...newStep, month_day: e.target.value })} sx={{ width: 160 }} />
                ) : (
                  <TextField size="small" type="number" label="Nap-index" value={newStep.day_offset}
                    onChange={(e) => setNewStep({ ...newStep, day_offset: e.target.value })} sx={{ width: 120 }} />
                )}
                <FormControlLabel control={<Switch checked={newStep.is_mandatory}
                  onChange={(e) => setNewStep({ ...newStep, is_mandatory: e.target.checked })} />} label="Kötelező" />
                <Button variant="outlined" onClick={async () => {
                  try {
                    await videoCommsAPI.addStep(selected.id, newStep);
                    setNewStep({ video_id: '', day_offset: 1, month_day: '', is_mandatory: false });
                    openSequence(selected.id);
                  } catch (e) { toast.error(e?.response?.data?.message || 'Hiba'); }
                }}>Lépés hozzáadása</Button>
              </Stack>
            </Paper>
          )}
        </Box>
      )}

      {/* ── history + compliance ───────────────────────────────── */}
      {tab === 2 && (
        <Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Videó</TableCell><TableCell>Mód</TableCell><TableCell>Küldve</TableCell>
                <TableCell align="right">Címzett</TableCell><TableCell align="right">Megnézte</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {announcements.map((a) => (
                  <TableRow key={a.id} hover>
                    <TableCell>{a.video_title} {a.is_mandatory && <Chip size="small" color="warning" label="kötelező" sx={{ ml: 1 }} />}</TableCell>
                    <TableCell>{a.source === 'sequence' ? 'sorozat' : 'egyedi'}</TableCell>
                    <TableCell>{new Date(a.sent_at).toLocaleString('hu-HU')}</TableCell>
                    <TableCell align="right">{a.recipient_count}</TableCell>
                    <TableCell align="right">{a.watched_count}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={async () => setCompliance((await videoCommsAPI.compliance(a.id)).data)}>Részletek</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {compliance && (
            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {compliance.announcement.video_title} — {compliance.watched}/{compliance.sent} megnézte ({compliance.watched_pct}%)
              </Typography>
              <LinearProgress variant="determinate" value={compliance.watched_pct} sx={{ my: 1 }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Kötelező tájékoztatásnál ez a bizonyíték: kinek küldtük ki, és ki nézte meg ténylegesen.
              </Typography>
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead><TableRow>
                  <TableCell>Név</TableCell><TableCell>Szállás</TableCell><TableCell>Nyelv</TableCell>
                  <TableCell align="center">Push</TableCell><TableCell align="center">Megnézte</TableCell><TableCell>Mikor</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {compliance.recipients.map((r) => (
                    <TableRow key={r.user_id} sx={{ bgcolor: r.watched ? 'inherit' : 'rgba(255,193,7,0.08)' }}>
                      <TableCell>{r.last_name} {r.first_name}</TableCell>
                      <TableCell>{r.accommodation || '-'}</TableCell>
                      <TableCell>{r.language}</TableCell>
                      <TableCell align="center">{r.push_ok ? '✓' : '—'}</TableCell>
                      <TableCell align="center">{r.watched ? '✓' : '—'}</TableCell>
                      <TableCell>{r.completed_at ? new Date(r.completed_at).toLocaleDateString('hu-HU') : (r.renag_sent_at ? 'emlékeztetve' : '-')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>
      )}

      {/* ── config ─────────────────────────────────────────────── */}
      {tab === 3 && config && (
        <Paper variant="outlined" sx={{ p: 2, maxWidth: 520 }}>
          <FormControlLabel control={<Switch checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />} label="Automatikus sorozatok bekapcsolva" />
          <TextField fullWidth size="small" type="number" sx={{ mt: 2 }}
            label="Napi videó-korlát fejenként (összes sorozatra)"
            value={config.max_videos_per_day}
            onChange={(e) => setConfig({ ...config, max_videos_per_day: e.target.value })}
            helperText="A többi automatikusan a következő napra csúszik — senki nem kap egyszerre több videót." />
          <TextField fullWidth size="small" type="number" sx={{ mt: 2 }}
            label="Kötelező videó emlékeztető (nap)"
            value={config.renag_after_days}
            onChange={(e) => setConfig({ ...config, renag_after_days: e.target.value })}
            helperText="Egyszeri emlékeztető push, ha ennyi nap után sem nézte meg." />
          <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={config.renag_enabled}
            onChange={(e) => setConfig({ ...config, renag_enabled: e.target.checked })} />} label="Emlékeztető bekapcsolva" />
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6F5529' } }}
              onClick={async () => {
                try { setConfig((await videoCommsAPI.updateConfig(config)).data); toast.success('Mentve'); }
                catch { toast.error('Mentési hiba'); }
              }}>Mentés</Button>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
