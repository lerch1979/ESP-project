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
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Person as PersonIcon,
  Home as HomeIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Business as BusinessIcon,
  CalendarToday as CalendarIcon,
  Room as RoomIcon,
  Send as SendIcon,
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
  const [statuses] = useState([
    { id: '1', name: 'Új', slug: 'new' },
    { id: '2', name: 'Folyamatban', slug: 'in_progress' },
    { id: '3', name: 'Megoldva', slug: 'completed' },
    { id: '4', name: 'Visszautasítva', slug: 'rejected' },
  ]);

  useEffect(() => {
    loadTicket();
  }, [id]);

  const loadTicket = async () => {
    setLoading(true);
    try {
      const response = await ticketsAPI.getById(id);
      if (response.success) {
        setTicket(response.data.ticket);
        setSelectedStatus(response.data.ticket.status_id || '');
      }
    } catch (error) {
      console.error('Hibajegy betöltési hiba:', error);
      toast.error('Hiba a hibajegy betöltésekor');
    } finally {
      setLoading(false);
    }
  };

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
    if (newStatusId === ticket.status_id) return;

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

            {ticket.comments && ticket.comments.length > 0 ? (
              <Stack spacing={3}>
                {ticket.comments.map((comment) => (
                  <Box key={comment.id}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Avatar sx={{ width: 40, height: 40, bgcolor: '#2c5f2d', fontSize: '0.875rem' }}>
                        {comment.author_name?.[0] || '?'}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            {comment.author_name || 'Ismeretlen'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(comment.created_at).toLocaleString('hu-HU')}
                          </Typography>
                        </Box>
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8f9fa' }}>
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                            {comment.comment}
                          </Typography>
                        </Paper>
                      </Box>
                    </Box>
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

          {/* Bérlő adatok */}
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 2, display: 'block' }}>
              Bérlő adatai
            </Typography>
            
            <Stack spacing={2}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Név
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 500, pl: 3 }}>
                  {ticket.accommodated_employee_name || '-'}
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Telefonszám
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ pl: 3 }}>
                  {ticket.accommodated_employee_phone || '-'}
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <EmailIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Email
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ pl: 3, wordBreak: 'break-word' }}>
                  {ticket.accommodated_employee_email || '-'}
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <BusinessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Munkahely
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ pl: 3 }}>
                  {ticket.accommodated_employee_company || '-'}
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <CalendarIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Születési idő
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ pl: 3 }}>
                  {ticket.accommodated_employee_birthdate ? new Date(ticket.accommodated_employee_birthdate).toLocaleDateString('hu-HU') : '-'}
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {/* Szállás adatok */}
          <Paper sx={{ p: 2.5, mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5, mb: 2, display: 'block' }}>
              Szállás adatok
            </Typography>
            
            <Stack spacing={2}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <HomeIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Szálláshely
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 500, pl: 3 }}>
                  {ticket.accommodation_name || '-'}
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <RoomIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Cím
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ pl: 3 }}>
                  {ticket.accommodation_address || '-'}
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <RoomIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="caption" color="text.secondary">
                    Szobaszám
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ pl: 3 }}>
                  {ticket.accommodated_employee_room || '-'}
                </Typography>
              </Box>
            </Stack>
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
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {ticket.category_name || '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Prioritás
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, fontWeight: ticket.priority_slug === 'urgent' ? 600 : 400, color: ticket.priority_slug === 'urgent' ? '#d32f2f' : 'inherit' }}>
                  {ticket.priority_name || '-'}
                </Typography>
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
