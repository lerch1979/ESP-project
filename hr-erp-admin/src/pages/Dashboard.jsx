import React, { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  ConfirmationNumber,
  HourglassEmpty,
  CheckCircle,
  Warning,
} from '@mui/icons-material';
import { ticketsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    inProgress: 0,
    completed: 0,
    urgent: 0,
  });
  const [recentTickets, setRecentTickets] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const response = await ticketsAPI.getAll({ limit: 10 });
      
      if (response.success) {
        const tickets = response.data.tickets;
        setRecentTickets(tickets);
        
        // Statisztikák számítása
        setStats({
          total: response.data.pagination.total,
          inProgress: tickets.filter(t => t.status_slug === 'in_progress').length,
          completed: tickets.filter(t => t.status_slug === 'completed').length,
          urgent: tickets.filter(t => t.priority_slug === 'urgent').length,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (slug) => {
    const colors = {
      new: 'info',
      in_progress: 'warning',
      completed: 'success',
      rejected: 'error',
      waiting: 'default',
    };
    return colors[slug] || 'default';
  };

  const StatCard = ({ title, value, icon, color }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="text.secondary" gutterBottom variant="h6" component="div">
              {title}
            </Typography>
            <Typography variant="h3" component="div" sx={{ fontWeight: 700 }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: `${color}.100`,
              color: `${color}.main`,
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Üdvözlő szöveg */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
          Ügyfélszolgálat
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {user?.firstName} {user?.lastName} • {user?.roleNames?.join(', ')} • {user?.tenant?.name}
        </Typography>
      </Box>

      {/* Statisztika kártyák */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Összes hibajegy"
            value={stats.total}
            icon={<ConfirmationNumber sx={{ fontSize: 32 }} />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Folyamatban"
            value={stats.inProgress}
            icon={<HourglassEmpty sx={{ fontSize: 32 }} />}
            color="warning"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Lezárva"
            value={stats.completed}
            icon={<CheckCircle sx={{ fontSize: 32 }} />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Sürgős"
            value={stats.urgent}
            icon={<Warning sx={{ fontSize: 32 }} />}
            color="error"
          />
        </Grid>
      </Grid>

      {/* Legutóbbi hibajegyek */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Legutóbbi hibajegyek
        </Typography>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Kategória</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Prioritás</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Létrehozva</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentTickets.map((ticket) => (
                <TableRow
                  key={ticket.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {ticket.ticket_number}
                    </Typography>
                  </TableCell>
                  <TableCell>{ticket.title}</TableCell>
                  <TableCell>
                    <Chip label={ticket.category_name} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={ticket.status_name} 
                      size="small" 
                      color={getStatusColor(ticket.status_slug)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        color: ticket.priority_slug === 'urgent' ? 'error.main' : 'text.secondary',
                        fontWeight: ticket.priority_slug === 'urgent' ? 600 : 400,
                      }}
                    >
                      {ticket.priority_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(ticket.created_at).toLocaleDateString('hu-HU')}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

export default Dashboard;
