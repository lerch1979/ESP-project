import React, { useState } from 'react';
import {
  Box, ImageList, ImageListItem, ImageListItemBar, Dialog, DialogContent,
  IconButton, Typography, Card,
} from '@mui/material';
import { Close as CloseIcon, BrokenImage as BrokenImageIcon } from '@mui/icons-material';
import { UPLOADS_BASE_URL } from '../../services/api';

/**
 * Resolve a photo path to a URL. Backend serves uploads at /uploads/... via UPLOADS_BASE_URL.
 */
const resolveUrl = (p) => {
  if (!p) return '';
  if (/^https?:/i.test(p)) return p;
  if (p.startsWith('/')) return `${UPLOADS_BASE_URL}${p}`;
  return `${UPLOADS_BASE_URL}/uploads/${p}`;
};

export default function PhotoGallery({ photos = [] }) {
  const [lightbox, setLightbox] = useState(null);

  if (!photos || photos.length === 0) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: 'center', bgcolor: '#fafafa' }}>
        <BrokenImageIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Nincs feltöltött fotó ehhez az ellenőrzéshez.
        </Typography>
      </Card>
    );
  }

  return (
    <>
      <ImageList cols={4} gap={8} sx={{ m: 0 }}>
        {photos.slice(0, 24).map((photo) => {
          const thumb = resolveUrl(photo.thumbnail_path || photo.file_path);
          return (
            <ImageListItem
              key={photo.id}
              sx={{ cursor: 'pointer', borderRadius: 1, overflow: 'hidden', border: '1px solid #e5e7eb' }}
              onClick={() => setLightbox(photo)}
            >
              <img
                src={thumb}
                alt={photo.caption || 'Fotó'}
                loading="lazy"
                style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                onError={(e) => { e.currentTarget.src = ''; e.currentTarget.style.background = '#f3f4f6'; }}
              />
              {(photo.caption || photo.taken_at) && (
                <ImageListItemBar
                  title={photo.caption || ''}
                  subtitle={photo.taken_at ? new Date(photo.taken_at).toLocaleString('hu-HU') : ''}
                  sx={{ '& .MuiImageListItemBar-title': { fontSize: '0.75rem' } }}
                />
              )}
            </ImageListItem>
          );
        })}
      </ImageList>

      <Dialog open={Boolean(lightbox)} onClose={() => setLightbox(null)} maxWidth="lg" fullWidth>
        <DialogContent sx={{ p: 0, position: 'relative', bgcolor: '#000' }}>
          <IconButton
            onClick={() => setLightbox(null)}
            sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', bgcolor: 'rgba(0,0,0,0.5)', zIndex: 2 }}
          >
            <CloseIcon />
          </IconButton>
          {lightbox && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <img
                src={resolveUrl(lightbox.file_path)}
                alt={lightbox.caption || ''}
                style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
              />
              {(lightbox.caption || lightbox.taken_at) && (
                <Box sx={{ p: 2, width: '100%', color: '#fff' }}>
                  {lightbox.caption && <Typography variant="body2">{lightbox.caption}</Typography>}
                  {lightbox.taken_at && (
                    <Typography variant="caption" sx={{ opacity: 0.7 }}>
                      {new Date(lightbox.taken_at).toLocaleString('hu-HU')}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
