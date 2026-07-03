import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Stack, CircularProgress,
  FormControlLabel, Checkbox, Divider, Typography, Box, InputAdornment,
} from '@mui/material';
import { videosAPI, workplacesAPI, contractorsAPI } from '../services/api';
import { toast } from 'react-toastify';

const CATEGORIES = [
  { value: 'munkabiztonság', label: 'Munkabiztonság' },
  { value: 'beilleszkedés', label: 'Beilleszkedés' },
  { value: 'nyelvi_kurzus', label: 'Nyelvi kurzus' },
  { value: 'adminisztráció', label: 'Adminisztráció' },
  { value: 'szakmai_kepzes', label: 'Szakmai képzés' },
  { value: 'ceg_info', label: 'Céginformáció' },
];

// The 5 supported languages (Eszti's full-dub versions).
const LANGS = [
  { code: 'hu', label: 'Magyar' },
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Українська' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'de', label: 'Deutsch' },
];
const emptyLangMap = () => Object.fromEntries(LANGS.map((l) => [l.code, '']));

function CreateVideoModal({ open, onClose, onSuccess, editData }) {
  const [formData, setFormData] = useState({
    title: '', description: '', url: '', thumbnail_url: '', category: 'ceg_info',
    duration: '', scope: 'global', workplace_id: '', contractor_id: '',
    base_language: 'hu', is_featured: false,
  });
  const [versions, setVersions] = useState(emptyLangMap());   // playback_url per language
  const [subtitles, setSubtitles] = useState(emptyLangMap()); // vtt_url per language
  const [workplaces, setWorkplaces] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(editData);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [wpRes, ccRes] = await Promise.all([
          workplacesAPI.list({ is_active: 'true' }),
          contractorsAPI.getAll({ limit: 500 }),
        ]);
        const wps = wpRes?.data?.workplaces || wpRes?.workplaces || wpRes?.data || [];
        setWorkplaces(Array.isArray(wps) ? wps.filter((w) => w.is_active !== false) : []);
        const ccs = ccRes?.data?.contractors || ccRes?.contractors || ccRes?.data || [];
        setContractors(Array.isArray(ccs) ? ccs : []);
      } catch { /* selectors stay empty */ }
    })();
  }, [open]);

  useEffect(() => {
    if (editData) {
      setFormData({
        title: editData.title || '', description: editData.description || '',
        url: editData.url || '', thumbnail_url: editData.thumbnail_url || '',
        category: editData.category || 'ceg_info',
        duration: editData.duration ? String(editData.duration) : '',
        scope: editData.scope || 'global',
        workplace_id: editData.workplace_id || '', contractor_id: editData.contractor_id || '',
        base_language: editData.base_language || 'hu', is_featured: !!editData.is_featured,
      });
      const v = emptyLangMap();
      (editData.versions || []).forEach((r) => { if (r.language in v) v[r.language] = r.playback_url || ''; });
      setVersions(v);
      const s = emptyLangMap();
      (editData.subtitles || []).forEach((r) => { if (r.language in s) s[r.language] = r.vtt_url || ''; });
      setSubtitles(s);
    } else {
      setFormData({
        title: '', description: '', url: '', thumbnail_url: '', category: 'ceg_info',
        duration: '', scope: 'global', workplace_id: '', contractor_id: '',
        base_language: 'hu', is_featured: false,
      });
      setVersions(emptyLangMap());
      setSubtitles(emptyLangMap());
    }
  }, [editData, open]);

  const handleChange = (field) => (e) => setFormData((p) => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async () => {
    if (!formData.title.trim()) { toast.error('Cím megadása kötelező'); return; }
    if (formData.scope === 'workplace' && !formData.workplace_id) { toast.error('Válassz munkahelyet (scope=workplace)'); return; }
    if (formData.scope === 'contractor' && !formData.contractor_id) { toast.error('Válassz megbízót (scope=contractor)'); return; }

    const versionList = LANGS.filter((l) => versions[l.code].trim())
      .map((l) => ({ language: l.code, playback_url: versions[l.code].trim() }));
    const subtitleList = LANGS.filter((l) => subtitles[l.code].trim())
      .map((l) => ({ language: l.code, vtt_url: subtitles[l.code].trim() }));

    if (!formData.url.trim() && versionList.length === 0) {
      toast.error('Adj meg egy fallback URL-t VAGY legalább egy nyelvi videóverziót');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description || null,
        url: formData.url.trim() || null,
        thumbnail_url: formData.thumbnail_url || null,
        category: formData.category,
        duration: parseInt(formData.duration) || 0,
        scope: formData.scope,
        workplace_id: formData.scope === 'workplace' ? formData.workplace_id : null,
        contractor_id: formData.scope === 'contractor' ? formData.contractor_id : null,
        base_language: formData.base_language,
        is_featured: formData.is_featured,
        versions: versionList,
        subtitles: subtitleList,
      };
      if (isEdit) {
        await videosAPI.update(editData.id, payload);
        toast.success('Videó sikeresen frissítve');
      } else {
        await videosAPI.create(payload);
        toast.success('Videó létrehozva');
      }
      onSuccess();
    } catch (error) {
      toast.error(error?.response?.data?.message || (isEdit ? 'Videó frissítése sikertelen' : 'Videó létrehozása sikertelen'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {isEdit ? 'Videó szerkesztése' : 'Új videó hozzáadása'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField label="Cím *" value={formData.title} onChange={handleChange('title')} fullWidth />
          <TextField label="Leírás" value={formData.description} onChange={handleChange('description')} fullWidth multiline rows={2}
            helperText="A címet/leírást a rendszer a néző nyelvére fordítja olvasáskor" />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Kategória</InputLabel>
              <Select value={formData.category} onChange={handleChange('category')} label="Kategória">
                {CATEGORIES.map((c) => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Eredeti nyelv</InputLabel>
              <Select value={formData.base_language} onChange={handleChange('base_language')} label="Eredeti nyelv">
                {LANGS.map((l) => <MenuItem key={l.code} value={l.code}>{l.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          {/* Visibility / scoping */}
          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">LÁTHATÓSÁG</Typography></Divider>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Kinek látható</InputLabel>
              <Select value={formData.scope} onChange={handleChange('scope')} label="Kinek látható">
                <MenuItem value="global">Mindenki (global)</MenuItem>
                <MenuItem value="workplace">Egy munkahely (pl. Autoliv)</MenuItem>
                <MenuItem value="contractor">Egy megbízó</MenuItem>
              </Select>
            </FormControl>
            {formData.scope === 'workplace' && (
              <FormControl fullWidth required>
                <InputLabel>Munkahely</InputLabel>
                <Select value={formData.workplace_id} onChange={handleChange('workplace_id')} label="Munkahely">
                  {workplaces.map((w) => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {formData.scope === 'contractor' && (
              <FormControl fullWidth required>
                <InputLabel>Megbízó</InputLabel>
                <Select value={formData.contractor_id} onChange={handleChange('contractor_id')} label="Megbízó">
                  {contractors.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
          </Stack>
          {formData.scope === 'workplace' && (
            <Typography variant="caption" color="text.secondary">
              Csak az adott munkahelyen dolgozó lakók látják (pl. Autoliv tűzvédelem → csak az Autoliv munkások).
            </Typography>
          )}

          {/* Per-language full-dub versions */}
          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">NYELVI VIDEÓVERZIÓK (TELJES SZINKRON)</Typography></Divider>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            Illeszd be az egyes nyelvek Bunny Stream lejátszási URL-jét (Eszti szinkron). A lejátszó a lakó nyelvét választja, hiányzó nyelvnél az eredeti nyelvre esik vissza.
          </Typography>
          {LANGS.map((l) => (
            <TextField
              key={l.code}
              label={`Videó URL — ${l.label}`}
              value={versions[l.code]}
              onChange={(e) => setVersions((p) => ({ ...p, [l.code]: e.target.value }))}
              fullWidth size="small"
              placeholder="https://…/playlist.m3u8"
              InputProps={{ startAdornment: <InputAdornment position="start">{l.code.toUpperCase()}</InputAdornment> }}
            />
          ))}

          {/* Optional subtitles */}
          <Divider textAlign="left"><Typography variant="caption" color="text.secondary">FELIRATOK (OPCIONÁLIS, WEBVTT)</Typography></Divider>
          {LANGS.map((l) => (
            <TextField
              key={l.code}
              label={`Felirat URL — ${l.label}`}
              value={subtitles[l.code]}
              onChange={(e) => setSubtitles((p) => ({ ...p, [l.code]: e.target.value }))}
              fullWidth size="small"
              placeholder="https://…/subtitle.vtt"
              InputProps={{ startAdornment: <InputAdornment position="start">{l.code.toUpperCase()}</InputAdornment> }}
            />
          ))}

          <Divider />
          <TextField label="Fallback / külső URL (opcionális)" value={formData.url} onChange={handleChange('url')} fullWidth
            placeholder="https://www.youtube.com/watch?v=…" helperText="Ha nincs szinkronverzió, ez játszódik le (YouTube/Vimeo is)" />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Borítókép URL" value={formData.thumbnail_url} onChange={handleChange('thumbnail_url')} fullWidth size="small" />
            <TextField label="Időtartam (mp)" value={formData.duration} onChange={handleChange('duration')} type="number" size="small" sx={{ minWidth: 160 }} />
          </Stack>
          <FormControlLabel
            control={<Checkbox checked={formData.is_featured} onChange={(e) => setFormData((p) => ({ ...p, is_featured: e.target.checked }))} />}
            label="Kiemelt videó (lista tetején)"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>Mégse</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}
          sx={{ bgcolor: '#8B6B33', '&:hover': { bgcolor: '#6f552a' } }}>
          {saving ? <CircularProgress size={24} /> : isEdit ? 'Mentés' : 'Létrehozás'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default CreateVideoModal;
