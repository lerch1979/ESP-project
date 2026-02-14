import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Divider,
  TextField,
  Button,
  Stack,
  Avatar,
  IconButton,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  Chip,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Send as SendIcon,
  History as HistoryIcon,
  Comment as CommentIcon,
} from '@mui/icons-material';
import { ticketsAPI } from '../services/api';
import { toast } from 'react-toastify';

function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    loadStatuses();
  }, []);

  useEffect(() => {
    loadTicket();
  }, [id]);

  const loadStatuses = async () => {
    try {
      const response = await ticketsAPI.getStatuses();
      if (response.success) {
        setStatuses(response.data.statuses || []);
      }
    } catch (error) {
      console.error('Státuszok betöltési hiba:', error);
    }
  };

  const loadTicket = async () => {
    setLoading(true);
    try {
      const response = await ticketsAPI.getById(id);
      if (response.success) {
        setTicket(response.data.ticket);
        const t = response.data.ticket;
        const matchingStatus = statuses.find(s => s.slug === t.status_slug);
        setSelectedStatus(matchingStatus?.id || '');
      }
    } catch (error) {
      console.error('Hibajegy betöltési hiba:', error);
      toast.error('Hiba a hibajegy betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  // Update selectedStatus when statuses load after ticket
  useEffect(() => {
    if (ticket && statuses.length > 0 && !selectedStatus) {
      const matchingStatus = statuses.find(s => s.slug === ticket.status_slug);
      if (matchingStatus) setSelectedStatus(matchingStatus.id);
    }
  }, [statuses, ticket]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setSendingComment(true);
    try {
      const response = await ticketsAPI.addComment(id, {
        comment: newComment,
        is_internal: false,
      });

      if (response.success) {
        toast.success('Megjegyzés hozzáadva');
        setNewComment('');
        loadTicket();
      }
    } catch (error) {
      console.error('Megjegyzés hozzáadási hiba:', error);
      toast.error('Hiba a megjegyzés hozzáadásakor');
    } finally {
      setSendingComment(false);
    }
  };

  const handleStatusChange = async (newStatusId) => {
    if (newStatusId === selectedStatus) return;

    setUpdatingStatus(true);
    try {
      const response = await ticketsAPI.updateStatus(id, {
        status_id: newStatusId,
      });

      if (response.success) {
        toast.success('Státusz frissítve');
        setSelectedStatus(newStatusId);
        loadTicket();
      }
    } catch (error) {
      console.error('Státusz frissítési hiba:', error);
      toast.error('Hiba a státusz frissítésekor');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Build combined timeline from comments + history
  const getTimeline = () => {
    if (!ticket) return [];

    const items = [];

    if (ticket.comments) {
      ticket.comments.forEach(c => {
        items.push({
          type: 'comment',
          id: c.id,
          date: c.created_at,
          author: c.author_name || 'Ismeretlen',
          content: c.comment,
        });
      });
    }

    if (ticket.history) {
      ticket.history.forEach(h => {
        items.push({
          type: 'history',
          id: h.id,
          date: h.created_at,
          author: h.changed_by_name || 'Rendszer',
          action: h.action,
          field: h.field_name,
          oldValue: h.old_value,
          newValue: h.new_value,
        });
      });
    }

    items.sort((a, b) => new Date(a.date) - new Date(b.date));
    return items;
  };

  const formatHistoryEntry = (item) => {
    if (item.action === 'created') return 'Hibajegy létrehozva';
    if (item.field) {
      return `${item.field}: ${item.oldValue || '–'} → ${item.newValue || '–'}`;
    }
    return item.action || 'Módosítás';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!ticket) {
    return (
      <Box sx={{ textAlign: 'center', mt: 5 }}>
        <Typography variant="h5" color="text.secondary">
          Hibajegy nem található
        </Typography>
        <Button onClick={() => navigate('/tickets')} sx={{ mt: 2 }}>
          Vissza a listához
        </Button>
      </Box>
    );
  }

  const timeline = getTimeline();

  return (
    <Box>
      {/* Fejléc */}
      <Box sx={{ mb: 3 }}>
        <IconButton onClick={() => navigate('/tickets')} sx={{ mb: 2 }}>
          <BackIcon />
        </IconButton>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {ticket.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {ticket.ticket_number}
            </Typography>
          </Box>

          {/* Státusz dropdown */}
          <FormControl sx={{ minWidth: 200 }}>
            <Select
              value={selectedStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              size="small"
              disabled={updatingStatus}
              sx={{
                bgcolor: 'white',
                fontWeight: 600,
              }}
            >
              {statuses.map((status) => (
                <MenuItem key={status.id} value={status.id}>
                  {status.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Box>

      <Grid container spacing={3}>
        {/* Bal oldal */}
        <Grid item xs={12} md={8}>
          {/* Leírás */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Leírás
            </Typography>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
              {ticket.description || 'Nincs leírás megadva.'}
            </Typography>
          </Paper>

          {/* Előzmények */}
          <Paper sx={{ p: 3 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 3, display: 'block' }}>
              Előzmények
            </Typography>

            {timeline.length > 0 ? (
              <Stack spacing={3}>
                {timeline.map((item) => (
                  <Box key={`${item.type}-${item.id}`}>
                    {item.type === 'comment' ? (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                        <Avatar sx={{ width: 40, height: 40, bgcolor: '#2c5f2d', fontSize: '0.875rem' }}>
                          {item.author?.[0] || '?'}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                {item.author}
                              </Typography>
                              <CommentIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(item.date).toLocaleString('hu-HU')}
                            </Typography>
                          </Box>
                          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8f9fa' }}>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                              {item.content}
                            </Typography>
                          </Paper>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                        <Avatar sx={{ width: 40, height: 40, bgcolor: '#e0e0e0', fontSize: '0.875rem' }}>
                          <HistoryIcon sx={{ fontSize: 20, color: '#757575' }} />
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                              <strong>{item.author}</strong> — {formatHistoryEntry(item)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(item.date).toLocaleString('hu-HU')}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    )}
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3, fontStyle: 'italic' }}>
                Még nincs előzmény
              </Typography>
            )}

            {/* Új megjegyzés */}
            <Divider sx={{ my: 3 }} />
            <TextField
              fullWidth
              multiline
              rows={3}
              placeholder="Új megjegyzés írása..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              endIcon={<SendIcon />}
              onClick={handleAddComment}
              disabled={sendingComment || !newComment.trim()}
              sx={{
                bgcolor: '#2c5f2d',
                '&:hover': { bgcolor: '#234d24' },
              }}
            >
              {sendingComment ? 'Küldés...' : 'Megjegyzés hozzáadása'}
            </Button>
          </Paper>
        </Grid>

        {/* Jobb oldal */}
        <Grid item xs={12} md={4}>
          {/* Felelős */}
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Felelős
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              {ticket.assigned_to_name || 'Nincs kijelölve'}
            </Typography>
          </Paper>

          {/* Alvállalkozó */}
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Alvállalkozó
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
              {ticket.contractor_name || '-'}
            </Typography>
          </Paper>

          {/* Hibajegy adatok */}
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 2, display: 'block' }}>
              Hibajegy adatok
            </Typography>

            <Stack spacing={2}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Kategória
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  {ticket.category_name ? (
                    <Chip
                      label={ticket.category_name}
                      size="small"
                      sx={{
                        bgcolor: ticket.category_color || '#e8f5e9',
                        color: '#fff',
                      }}
                    />
                  ) : (
                    <Typography variant="body2">-</Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Prioritás
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  {ticket.priority_name ? (
                    <Chip
                      label={ticket.priority_name}
                      size="small"
                      sx={{
                        bgcolor: ticket.priority_color || '#757575',
                        color: '#fff',
                        fontWeight: 600,
                      }}
                    />
                  ) : (
                    <Typography variant="body2">-</Typography>
                  )}
                </Box>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Létrehozva
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {new Date(ticket.created_at).toLocaleString('hu-HU')}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Utoljára frissítve
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {new Date(ticket.updated_at).toLocaleString('hu-HU')}
                </Typography>
              </Box>

              {ticket.due_date && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Határidő
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {new Date(ticket.due_date).toLocaleDateString('hu-HU')}
                  </Typography>
                </Box>
              )}

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Beküldő
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {ticket.created_by_name || '-'}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default TicketDetail;
