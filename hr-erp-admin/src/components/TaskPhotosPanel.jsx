import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Stack, Typography, Button, IconButton, Tooltip, Chip,
  CircularProgress, Tabs, Tab, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, ImageList, ImageListItem,
  ImageListItemBar, Backdrop, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Close as CloseIcon, Delete as DeleteIcon,
  ChevronLeft as PrevIcon, ChevronRight as NextIcon,
  PhotoCamera as CameraIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { tasksAPI, UPLOADS_BASE_URL } from '../services/api';

const TYPE_TABS = [
  { value: 'all',     label: 'Mind' },
  { value: 'before',  label: 'Előtte' },
  { value: 'during',  label: 'Közben' },
  { value: 'after',   label: 'Utána' },
  { value: 'general', label: 'Általános' },
];

const TYPE_LABEL = {
  before:  'Előtte',
  during:  'Közben',
  after:   'Utána',
  general: 'Általános',
};

const fmtDateTime = (s) => s ? new Date(s).toLocaleString('hu-HU', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}) : '';

// Resolve a stored photo_url ('/uploads/...') to an absolute URL the
// browser can load. Same convention as other galleries in the app.
const fullUrl = (u) => u ? `${UPLOADS_BASE_URL}${u}` : '';

/**
 * Photo gallery for a task. Shows existing uploads with type filter
 * tabs, lets the actor add new photos through a small upload dialog,
 * and opens a lightbox for the selected thumbnail.
 *
 * Backend caps at 10 photos per task. We surface the current count so
 * the user understands the limit before the request fails.
 */
export default function TaskPhotosPanel({ taskId, currentUser }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('all');

  // Upload dialog state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedFiles, setPickedFiles] = useState([]);
  const [pickedPreviews, setPickedPreviews] = useState([]); // object URLs
  const [pickedType, setPickedType] = useState('general');
  const [pickedCaption, setPickedCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Lightbox state
  const [lightboxIdx, setLightboxIdx] = useState(-1);

  const myId = currentUser?.id;
  const slugs = currentUser?.roleSlugs || currentUser?.roles || [];
  const isAdmin = slugs.includes('admin') || slugs.includes('superadmin');

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const r = await tasksAPI.listPhotos(taskId);
      if (r?.success) setPhotos(r.data?.photos || []);
    } catch {
      toast.error('Fotók betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => tab === 'all' ? photos : photos.filter(p => p.photo_type === tab),
    [photos, tab]
  );

  // ── Upload flow ──────────────────────────────────────────────────────
  const onPickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPickedFiles(files);
    // Generate object-URL previews. Revoked when the dialog closes.
    setPickedPreviews(files.map(f => URL.createObjectURL(f)));
    setPickerOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeUploadDialog = () => {
    pickedPreviews.forEach(u => URL.revokeObjectURL(u));
    setPickedFiles([]);
    setPickedPreviews([]);
    setPickedType('general');
    setPickedCaption('');
    setPickerOpen(false);
  };

  const submitUpload = async () => {
    if (pickedFiles.length === 0) return;
    if (photos.length + pickedFiles.length > 10) {
      toast.error('Maximum 10 fotó tölthető fel feladatonként');
      return;
    }
    setUploading(true);
    try {
      const r = await tasksAPI.uploadPhotos(taskId, pickedFiles, {
        photo_type: pickedType,
        caption: pickedCaption,
      });
      if (r?.success) {
        toast.success(`${r.data.photos.length} fotó feltöltve`);
        closeUploadDialog();
        load();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Feltöltés sikertelen');
    } finally {
      setUploading(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────
  const removePhoto = async (photo) => {
    if (!confirm('Biztosan törlöd ezt a fotót?')) return;
    try {
      const r = await tasksAPI.deletePhoto(taskId, photo.id);
      if (r?.success) {
        toast.success('Fotó törölve');
        setPhotos(prev => prev.filter(p => p.id !== photo.id));
        // close lightbox if we just deleted the visible photo
        if (lightboxIdx >= 0 && filtered[lightboxIdx]?.id === photo.id) setLightboxIdx(-1);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Törlés sikertelen');
    }
  };

  // ── Lightbox keyboard nav ────────────────────────────────────────────
  useEffect(() => {
    if (lightboxIdx < 0) return;
    const onKey = (e) => {
      if (e.key === 'Escape')    setLightboxIdx(-1);
      if (e.key === 'ArrowLeft') setLightboxIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setLightboxIdx(i => Math.min(filtered.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, filtered.length]);

  const lightbox = lightboxIdx >= 0 ? filtered[lightboxIdx] : null;
  const canDeleteLightbox = lightbox && (lightbox.uploaded_by === myId || isAdmin);

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          📸 Fotók ({photos.length}/10)
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => fileInputRef.current?.click()}
          disabled={photos.length >= 10}
        >
          Feltöltés
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={onPickFiles}
        />
      </Stack>

      {photos.length > 0 && (
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: 12 } }}
        >
          {TYPE_TABS.map(t => (
            <Tab key={t.value} value={t.value} label={t.label} />
          ))}
        </Tabs>
      )}

      {loading && photos.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>
      ) : filtered.length === 0 ? (
        <Box sx={{
          textAlign: 'center', py: 3, color: 'text.secondary',
          border: '1px dashed #d1d5db', borderRadius: 1, mt: 1.5,
        }}>
          <CameraIcon sx={{ fontSize: 36, color: '#9ca3af', mb: 0.5 }} />
          <Typography variant="body2">
            {tab === 'all' ? 'Még nincs feltöltött fotó' : 'Ebben a kategóriában nincs fotó'}
          </Typography>
        </Box>
      ) : (
        <ImageList cols={3} gap={6} sx={{ mt: 1.5, mb: 0 }}>
          {filtered.map((p, i) => (
            <ImageListItem
              key={p.id}
              sx={{ cursor: 'pointer', borderRadius: 1, overflow: 'hidden' }}
              onClick={() => setLightboxIdx(i)}
            >
              <img
                src={fullUrl(p.thumbnail_url || p.photo_url)}
                alt={p.caption || ''}
                loading="lazy"
                style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }}
              />
              <ImageListItemBar
                subtitle={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Chip
                      size="small" label={TYPE_LABEL[p.photo_type] || p.photo_type}
                      sx={{ height: 16, fontSize: 10, bgcolor: 'rgba(255,255,255,0.85)' }}
                    />
                  </Stack>
                }
                position="bottom"
                sx={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)' }}
              />
            </ImageListItem>
          ))}
        </ImageList>
      )}

      {/* ── Upload dialog ─────────────────────────────────────────── */}
      <Dialog open={pickerOpen} onClose={uploading ? null : closeUploadDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {pickedFiles.length} fotó feltöltése
        </DialogTitle>
        <DialogContent>
          {/* GDPR / privacy warning. Always visible above the file
              previews so users see it before they confirm the upload. */}
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
              ⚠️ Figyelem — Adatvédelem!
            </Typography>
            <Typography variant="body2">
              NE töltsetek fel személyazonosító dokumentumokat
              (igazolvány, útlevél, lakcímkártya, bankkártya)!
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Ezeket a következő frissítésben elérhető biztonságos
              dokumentumtárba kell tenni.
            </Typography>
          </Alert>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {pickedPreviews.map((src, i) => (
              <img
                key={src} src={src} alt={pickedFiles[i].name}
                style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 4 }}
              />
            ))}
          </Box>
          <TextField
            select fullWidth size="small" sx={{ mb: 2 }}
            label="Típus"
            value={pickedType}
            onChange={e => setPickedType(e.target.value)}
          >
            {TYPE_TABS.filter(t => t.value !== 'all').map(t => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth size="small" multiline rows={2}
            label="Megjegyzés (opcionális)"
            placeholder="pl. mi látszik a képen"
            value={pickedCaption}
            onChange={e => setPickedCaption(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUploadDialog} disabled={uploading}>Mégse</Button>
          <Button
            variant="contained"
            onClick={submitUpload}
            disabled={uploading}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            {uploading
              ? <CircularProgress size={20} sx={{ color: 'white' }} />
              : 'Feltöltés'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Lightbox ──────────────────────────────────────────────── */}
      <Backdrop open={!!lightbox} sx={{ zIndex: 1300, color: 'white' }} onClick={() => setLightboxIdx(-1)}>
        {lightbox && (
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              maxWidth: '92vw', maxHeight: '92vh',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box sx={{ position: 'relative', maxWidth: '100%', maxHeight: '78vh' }}>
              <img
                src={fullUrl(lightbox.photo_url)}
                alt={lightbox.caption || ''}
                style={{ maxWidth: '92vw', maxHeight: '78vh', objectFit: 'contain', borderRadius: 6 }}
              />
              {lightboxIdx > 0 && (
                <IconButton
                  onClick={() => setLightboxIdx(i => i - 1)}
                  sx={{ position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
                ><PrevIcon /></IconButton>
              )}
              {lightboxIdx < filtered.length - 1 && (
                <IconButton
                  onClick={() => setLightboxIdx(i => i + 1)}
                  sx={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
                ><NextIcon /></IconButton>
              )}
            </Box>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: 'white', textAlign: 'center' }}>
              <Chip size="small" label={TYPE_LABEL[lightbox.photo_type] || lightbox.photo_type} sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
              {lightbox.caption && <Typography variant="body2">{lightbox.caption}</Typography>}
              <Typography variant="caption" sx={{ opacity: 0.85 }}>
                {[lightbox.first_name, lightbox.last_name].filter(Boolean).join(' ') || lightbox.email || '—'}
                {' · '}{fmtDateTime(lightbox.created_at)}
                {' · '}{lightboxIdx + 1}/{filtered.length}
              </Typography>
              {canDeleteLightbox && (
                <Tooltip title="Fotó törlése">
                  <IconButton size="small" onClick={() => removePhoto(lightbox)} sx={{ color: '#fca5a5' }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Bezárás (Esc)">
                <IconButton size="small" onClick={() => setLightboxIdx(-1)} sx={{ color: 'white' }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        )}
      </Backdrop>
    </Box>
  );
}
