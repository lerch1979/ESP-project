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
  Category as CategoryIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { videosAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateVideoModal from './CreateVideoModal';

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
  beilleszkedés: '#2563eb',
  nyelvi_kurzus: '#7c3aed',
  adminisztráció: '#f59e0b',
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
  const [currentVideo, setCurrentVideo] = useState(video);
  const [viewRecorded, setViewRecorded] = useState(false);

  useEffect(() => {
    setCurrentVideo(video);
    setViewRecorded(false);
  }, [video]);

  // Record view on open
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
    </>
  );
}

export default VideoDetailModal;
