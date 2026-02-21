import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Chip, FormControl, InputLabel, Select, MenuItem,
  InputAdornment,
} from '@mui/material';
import { Search, Chat } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

const STATUS_CONFIG = {
  active: { label: 'Aktív', color: 'info' },
  escalated: { label: 'Eszkalált', color: 'warning' },
  closed: { label: 'Lezárt', color: 'default' },
};

export default function ChatbotConversations() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const params = { page: page + 1, limit: rowsPerPage };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await chatbotAPI.adminGetConversations(params);
      setConversations(response.data || []);
      setTotalCount(response.pagination?.total || 0);
    } catch (error) {
      toast.error('Hiba a beszélgetések betöltése közben');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConversations(); }, [page, rowsPerPage, search, statusFilter]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('hu-HU', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Chatbot Beszélgetések</Typography>

      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Keresés (név, cím)..." value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
          sx={{ width: 300 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Státusz</InputLabel>
          <Select value={statusFilter} label="Státusz" onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <MenuItem value="">Összes</MenuItem>
            <MenuItem value="active">Aktív</MenuItem>
            <MenuItem value="escalated">Eszkalált</MenuItem>
            <MenuItem value="closed">Lezárt</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Felhasználó</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Cím</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Státusz</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Üzenetek</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Utolsó üzenet</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Létrehozva</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {conversations.map((conv) => {
              const status = STATUS_CONFIG[conv.status] || STATUS_CONFIG.active;
              return (
                <TableRow key={conv.id} hover sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/chatbot/conversations/${conv.id}`)}>
                  <TableCell>
                    <Typography fontWeight={500}>{conv.first_name} {conv.last_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{conv.email}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{conv.title}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={status.label} size="small" color={status.color} />
                  </TableCell>
                  <TableCell align="center">{conv.message_count || 0}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 200 }}>
                      {conv.last_message || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatDate(conv.created_at)}</TableCell>
                </TableRow>
              );
            })}
            {conversations.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Chat sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">Nincs beszélgetés</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div" count={totalCount} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(e, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 20, 50]}
          labelRowsPerPage="Sorok oldalanként:"
        />
      </TableContainer>
    </Box>
  );
}
