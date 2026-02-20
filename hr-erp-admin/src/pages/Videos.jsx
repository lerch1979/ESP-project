import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActionArea,
  Chip,
  Stack,
  CircularProgress,
  TablePagination,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  PlayCircleOutline as PlayIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';
import { videosAPI } from '../services/api';
import { toast } from 'react-toastify';
import CreateVideoModal from '../components/CreateVideoModal';
import VideoDetailModal from '../components/VideoDetailModal';

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
  adminisztráció: '#ec4899',
  szakmai_kepzes: '#0891b2',
  ceg_info: '#16a34a',
};

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getYouTubeThumbnail(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (match) return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
  return null;
}

function Videos() {
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      const roles = user.roleSlugs || user.roles || [];
      setIsAdmin(roles.some(r => ['superadmin', 'data_controller', 'admin'].includes(r)));
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [page, rowsPerPage, search, categoryFilter]);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
      };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;

      const result = await videosAPI.getAll(params);
      setVideos(result.data.videos);
      setTotalCount(result.data.total);
    } catch (error) {
      toast.error('Videók betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoClick = (video) => {
    setSelectedVideo(video);
    setDetailModalOpen(true);
  };

  const handleCreateSuccess = () => {
    setCreateModalOpen(false);
    loadVideos();
    toast.success('Videó sikeresen létrehozva');
  };

  const handleDetailClose = () => {
    setDetailModalOpen(false);
    setSelectedVideo(null);
    loadVideos();
  };

  let searchTimer;
  const handleSearchChange = (e) => {
    const value = e.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      setSearch(value);
      setPage(0);
    }, 300);
  };

  const categoryChips = [
    { value: null, label: 'Összes' },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Videók
        </Typography>
        {isAdmin && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateModalOpen(true)}
            sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            Új videó
          </Button>
        )}
      </Box>

      {/* Search */}
      <TextField
        placeholder="Keresés videók között..."
        size="small"
        onChange={handleSearchChange}
        sx={{ mb: 2, width: { xs: '100%', sm: 350 } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: '#94a3b8' }} />
            </InputAdornment>
          ),
        }}
      />

      {/* Category chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
        {categoryChips.map((cat) => (
          <Chip
            key={cat.value || 'all'}
            label={cat.label}
            variant={categoryFilter === cat.value ? 'filled' : 'outlined'}
            onClick={() => {
              setCategoryFilter(cat.value);
              setPage(0);
            }}
            sx={{
              fontWeight: 600,
              ...(categoryFilter === cat.value
                ? {
                    bgcolor: cat.value ? CATEGORY_COLORS[cat.value] : '#2563eb',
                    color: 'white',
                    '&:hover': { bgcolor: cat.value ? CATEGORY_COLORS[cat.value] : '#1d4ed8' },
                  }
                : {
                    borderColor: cat.value ? CATEGORY_COLORS[cat.value] : '#94a3b8',
                    color: cat.value ? CATEGORY_COLORS[cat.value] : '#64748b',
                  }),
            }}
          />
        ))}
      </Stack>

      {/* Video grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#2563eb' }} />
        </Box>
      ) : videos.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            Nincs találat
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {search || categoryFilter ? 'Próbáljon más keresési feltételeket' : 'Még nincsenek videók feltöltve'}
          </Typography>
        </Box>
      ) : (
        <>
          <Grid container spacing={2.5}>
            {videos.map((video) => {
              const thumbnail = video.thumbnail_url || getYouTubeThumbnail(video.url);
              const catColor = CATEGORY_COLORS[video.category] || '#94a3b8';

              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
                  <Card
                    sx={{
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 3,
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 8px 25px rgba(0,0,0,0.12)',
                      },
                    }}
                  >
                    <CardActionArea onClick={() => handleVideoClick(video)}>
                      {/* Thumbnail */}
                      <Box sx={{ position: 'relative', paddingTop: '56.25%', bgcolor: '#1e293b' }}>
                        {thumbnail ? (
                          <CardMedia
                            component="img"
                            image={thumbnail}
                            alt={video.title}
                            sx={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <PlayIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.7)' }} />
                          </Box>
                        )}

                        {/* Play overlay */}
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'rgba(0,0,0,0.15)',
                            opacity: 0,
                            transition: 'opacity 0.2s',
                            '&:hover': { opacity: 1 },
                          }}
                        >
                          <PlayIcon sx={{ fontSize: 56, color: 'white' }} />
                        </Box>

                        {/* Duration badge */}
                        {video.duration > 0 && (
                          <Chip
                            label={formatDuration(video.duration)}
                            size="small"
                            sx={{
                              position: 'absolute',
                              bottom: 8,
                              right: 8,
                              bgcolor: 'rgba(0,0,0,0.75)',
                              color: 'white',
                              fontSize: 12,
                              fontWeight: 600,
                              height: 24,
                            }}
                          />
                        )}
                      </Box>

                      {/* Card content */}
                      <CardContent sx={{ flexGrow: 1, pb: '12px !important' }}>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 600,
                            lineHeight: 1.3,
                            mb: 1,
                            display: '-webkit-box',
                            WebkitBoxOrient: 'vertical',
                            WebkitLineClamp: 2,
                            overflow: 'hidden',
                          }}
                        >
                          {video.title}
                        </Typography>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Chip
                            label={CATEGORY_LABELS[video.category] || video.category}
                            size="small"
                            sx={{
                              bgcolor: catColor + '18',
                              color: catColor,
                              fontWeight: 600,
                              fontSize: 11,
                              height: 24,
                            }}
                          />
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <ViewIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                            <Typography variant="caption" color="text.secondary">
                              {video.view_count}
                            </Typography>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          {/* Pagination */}
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[12, 24, 48]}
            labelRowsPerPage="Oldalanként:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
            sx={{ mt: 2 }}
          />
        </>
      )}

      {/* Create modal */}
      <CreateVideoModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Detail modal */}
      {selectedVideo && (
        <VideoDetailModal
          open={detailModalOpen}
          onClose={handleDetailClose}
          video={selectedVideo}
          isAdmin={isAdmin}
        />
      )}
    </Box>
  );
}

export default Videos;
