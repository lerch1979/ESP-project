import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Grid, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow,
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

const STAT_CARDS = [
  { key: 'totalConversations', label: 'Összes beszélgetés', color: '#3b82f6' },
  { key: 'activeConversations', label: 'Aktív beszélgetések', color: '#10b981' },
  { key: 'escalatedConversations', label: 'Eszkalált beszélgetések', color: '#f59e0b' },
  { key: 'totalMessages', label: 'Összes üzenet', color: '#8b5cf6' },
];

export default function ChatbotAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await chatbotAPI.getAnalytics();
        setData(response.data);
      } catch (error) {
        toast.error('Hiba az analitika betöltése közben');
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) return <Typography>Betöltés...</Typography>;
  if (!data) return <Typography>Nincs elérhető adat</Typography>;

  const chartData = (data.dailyStats || []).map(d => ({
    date: new Date(d.date).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }),
    count: parseInt(d.count),
  }));

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Chatbot Analitika</Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {STAT_CARDS.map((card) => (
          <Grid item xs={12} sm={6} md={3} key={card.key}>
            <Paper sx={{ p: 2.5, borderLeft: `4px solid ${card.color}` }}>
              <Typography variant="h4" fontWeight={700} sx={{ color: card.color }}>
                {data[card.key] ?? 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">{card.label}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {chartData.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Napi beszélgetések (utolsó 30 nap)</Typography>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="Beszélgetések" />
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {data.topKnowledgeBase?.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Legnépszerűbb kérdések</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Kérdés</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Használat</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.topKnowledgeBase.map((item, index) => (
                  <TableRow key={index} hover>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{item.question}</TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={600}>{item.usage_count}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}
