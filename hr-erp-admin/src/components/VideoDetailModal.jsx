import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  Chip,
  Stack,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  AccessTime as TimeIcon,
  CheckCircle as CheckIcon,
  Lock as LockIcon,
  Public as PublicIcon,
  Translate as TranslateIcon,
  FactCheck as ComplianceIcon,
  OpenInNew as OpenIcon,
} from '@mui/icons-material';
import { videosAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateVideoModal from './CreateVideoModal';
import VideoComplianceModal from './VideoComplianceModal';

const SCOPE_LABELS = { global: 'Mindenki', workplace: 'Munkahely', contractor: 'Megbízó' };
const LANG_LABELS = { hu: 'Magyar', en: 'English', uk: 'Українська', tl: 'Tagalog', de: 'Deutsch' };

const CATEGORY_LABELS = {
  munkabiztonság: 'Munkabiztonság',
  beilleszkedés: 'Beilleszkedés',
  nyelvi_kurzus: 'Nyelvi kurzus',
  adminisztráció: 'Adminisztráció',
  szakmai_kepzes: 'Szakmai képzés',
  ceg_info: 'Céginformáció',
};

const CATEGORY_COLORS = {
  munkabiztonság: '#dc2626',
  beilleszkedés: '#8B6B33',
  nyelvi_kurzus: '#7c3aed',
  adminisztráció: '#06b6d4',
  szakmai_kepzes: '#0891b2',
  ceg_info: '#16a34a',
};

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getEmbedUrl(url) {
  if (!url) return null;

  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;

  // Vimeo
  const vimeoMatch = url.match(/(?:vimeo\.com\/)(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;

  // Direct URL (fallback)
  return url;
}

function VideoDetailModal({ open, onClose, video, isAdmin }) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [currentVideo, setCurrentVideo] = useState(video);
  const [viewRecorded, setViewRecorded] = useState(false);

  useEffect(() => {
    setCurrentVideo(video);
    setViewRecorded(false);
  }, [video]);

  // Fetch the full video (versions/subtitles/scope) — the list row lacks them,
  // and the edit form + dub info need them.
  useEffect(() => {
    if (open && video?.id) {
      videosAPI.getById(video.id).then((r) => { if (r?.data) setCurrentVideo(r.data); }).catch(() => {});
    }
  }, [open, video]);

  // Record view on open (residents); harmless for admins.
  useEffect(() => {
    if (open && video && !viewRecorded) {
      videosAPI.recordView(video.id).catch(() => {});
      setViewRecorded(true);
    }
  }, [open, video]);

  const handleDelete = async () => {
    if (!window.confirm('Biztosan törölni szeretné ezt a videót?')) return;

    try {
      await videosAPI.delete(currentVideo.id);
      toast.success('Videó sikeresen törölve');
      onClose();
    } catch (error) {
      toast.error('Videó törlése sikertelen');
    }
  };

  const handleEditSuccess = async () => {
    setEditModalOpen(false);
    try {
      const result = await videosAPI.getById(currentVideo.id);
      setCurrentVideo(result.data);
    } catch (error) {
      // ignore
    }
    toast.success('Videó sikeresen frissítve');
  };

  const handleMarkCompleted = async () => {
    try {
      await videosAPI.recordView(currentVideo.id, { completed: true });
      toast.success('Megtekintve jelölve');
    } catch (error) {
      toast.error('Hiba történt');
    }
  };

  if (!currentVideo) return null;

  const embedUrl = getEmbedUrl(currentVideo.url);
  const catColor = CATEGORY_COLORS[currentVideo.category] || '#94a3b8';

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, pr: 2 }}>
            {currentVideo.title}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {/* Video player */}
          <Box sx={{ position: 'relative', paddingTop: '56.25%', bgcolor: '#000' }}>
            <iframe
              src={embedUrl}
              title={currentVideo.title}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </Box>

          {/* Video info */}
          <Box sx={{ p: 3 }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Chip
                label={CATEGORY_LABELS[currentVideo.category] || currentVideo.category}
                sx={{
                  bgcolor: catColor + '18',
                  color: catColor,
                  fontWeight: 600,
                }}
              />
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <TimeIcon sx={{ fontSize: 18, color: '#64748b' }} />
                <Typography variant="body2" color="text.secondary">
                  {formatDuration(currentVideo.duration)}
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <ViewIcon sx={{ fontSize: 18, color: '#64748b' }} />
                <Typography variant="body2" color="text.secondary">
                  {currentVideo.view_count || 0} megtekintés
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {new Date(currentVideo.created_at).toLocaleDateString('hu-HU')}
              </Typography>
            </Stack>

            {/* Visibility + dub info */}
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }} alignItems="center">
              <Chip
                size="small"
                icon={currentVideo.scope === 'global' ? <PublicIcon /> : <LockIcon />}
                label={SCOPE_LABELS[currentVideo.scope] || 'Mindenki'}
                sx={{ bgcolor: currentVideo.scope === 'global' ? '#dcfce7' : '#fef3c7',
                      color: currentVideo.scope === 'global' ? '#16a34a' : '#b45309', fontWeight: 600 }}
              />
              {currentVideo.is_featured && <Chip size="small" label="Kiemelt" sx={{ bgcolor: '#ede9fe', color: '#7c3aed', fontWeight: 600 }} />}
              <Chip size="small" icon={<TranslateIcon />}
                label={`${(currentVideo.versions || []).length} nyelvi verzió`}
                sx={{ bgcolor: '#dbeafe', color: '#8B6B33', fontWeight: 600 }} />
              {(currentVideo.subtitles || []).length > 0 && (
                <Chip size="small" label={`${currentVideo.subtitles.length} felirat`} variant="outlined" />
              )}
            </Stack>

            {(currentVideo.versions || []).length > 0 && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>NYELVI VIDEÓVERZIÓK</Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {currentVideo.versions.map((v) => (
                    <Stack key={v.language} direction="row" spacing={1} alignItems="center">
                      <Chip label={v.language.toUpperCase()} size="small" sx={{ height: 20, fontWeight: 700 }} />
                      <Typography variant="caption" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {LANG_LABELS[v.language]} · {v.playback_url}
                      </Typography>
                      <IconButton size="small" href={v.playback_url} target="_blank" rel="noopener"><OpenIcon fontSize="inherit" /></IconButton>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {currentVideo.description && (
              <>
                <Divider sx={{ mb: 2 }} />
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', color: '#475569' }}>
                  {currentVideo.description}
                </Typography>
              </>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          <Button
            variant="outlined"
            startIcon={<CheckIcon />}
            onClick={handleMarkCompleted}
            sx={{ borderColor: '#16a34a', color: '#16a34a' }}
          >
            Megtekintve
          </Button>
          <Stack direction="row" spacing={1}>
            {isAdmin && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<ComplianceIcon />}
                  onClick={() => setComplianceOpen(true)}
                  sx={{ borderColor: '#0891b2', color: '#0891b2' }}
                >
                  Megfelelőség
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => setEditModalOpen(true)}
                >
                  Szerkesztés
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleDelete}
                >
                  Törlés
                </Button>
              </>
            )}
          </Stack>
        </DialogActions>
      </Dialog>

      {/* Edit modal */}
      <CreateVideoModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSuccess={handleEditSuccess}
        editData={currentVideo}
      />

      {/* Compliance dashboard */}
      <VideoComplianceModal
        open={complianceOpen}
        onClose={() => setComplianceOpen(false)}
        video={currentVideo}
      />
    </>
  );
}

export default VideoDetailModal;
