import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, CircularProgress, Alert, Grid, Card, CardContent, Chip
} from '@mui/material';
import { EventNote, VideoCall, Person, Phone } from '@mui/icons-material';
import { carepathAPI } from '../../services/api';

const BOOKING_TYPE_ICONS = { in_person: <Person />, video_call: <VideoCall />, phone_call: <Phone /> };
const BOOKING_TYPE_LABELS = { in_person: 'Személyes', video_call: 'Videóhívás', phone_call: 'Telefonos' };

const BookingsOverview = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const response = await carepathAPI.getUsageStats(start, end);
      setStats(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Nem sikerült betölteni');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 3 }}>{error}</Alert>;

  const totalSessions = stats.reduce((s, m) => s + (parseInt(m.total_sessions_held) || 0), 0);
  const latest = stats[0] || {};

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        <EventNote sx={{ mr: 1, verticalAlign: 'middle' }} />
        Foglalások áttekintés
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" variant="body2">Munkamenetek (3 hó)</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#6366f1' }}>{totalSessions}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" variant="body2">Aktív esetek</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#f59e0b' }}>{latest.total_cases_active || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography color="text.secondary" variant="body2">Átl. munkamenet/eset</Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, color: '#10b981' }}>{latest.avg_sessions_per_case ? parseFloat(latest.avg_sessions_per_case).toFixed(1) : '—'}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Foglalás típusok</Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 2 }}>
          {Object.entries(BOOKING_TYPE_LABELS).map(([key, label]) => (
            <Card key={key} variant="outlined" sx={{ minWidth: 200, flex: 1 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f0f0ff' }}>
                  {BOOKING_TYPE_ICONS[key]}
                </Box>
                <Box>
                  <Typography variant="subtitle2">{label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {key === 'in_person' ? 'Személyes találkozó a szolgáltatóval' :
                     key === 'video_call' ? 'Online videóhívás' : 'Telefonos konzultáció'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>

        <Alert severity="info" sx={{ mt: 3 }}>
          A részletes foglalási naptár a CarePath mobilalkalmazásban érhető el.
          Az admin felületen az összesített statisztikák láthatók.
        </Alert>
      </Paper>
    </Box>
  );
};

export default BookingsOverview;
