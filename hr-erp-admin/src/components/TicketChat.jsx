import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Paper, Box, Typography, TextField, Button, IconButton, Stack,
  CircularProgress, Tooltip, Avatar, Chip,
} from '@mui/material';
import {
  Send as SendIcon, Refresh as RefreshIcon,
  DeleteOutline as DeleteIcon,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { ticketsAPI } from '../services/api';

const ROLE_LABEL = {
  admin:            'Admin',
  assigned_worker:  'Felelős',
  related_employee: 'Lakó',
  other:            '',
};
const ROLE_COLOR = {
  admin:            '#2563eb',
  assigned_worker:  '#16a34a',
  related_employee: '#eab308',
  other:            '#6b7280',
};

const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('hu-HU', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function MessageBubble({ message, isOwn, currentUserId, onMarkRead, onDelete }) {
  const role  = ROLE_LABEL[message.sender_role] || '';
  const color = ROLE_COLOR[message.sender_role] || '#6b7280';
  const senderName = [message.sender_first_name, message.sender_last_name].filter(Boolean).join(' ')
    || message.sender_email || '—';

  // Anyone other than the sender who has read it appears in read_by.
  const readByOthers = (message.read_by || []).filter(r => r.user_id !== message.sender_id);
  const readBySomeone = readByOthers.length > 0;

  // Auto-mark this message as read once we render it for someone who isn't
  // the sender and hasn't already marked it. Fires once per mount via ref.
  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current) return;
    if (isOwn) return;
    const alreadyRead = (message.read_by || []).some(r => r.user_id === currentUserId);
    if (alreadyRead) return;
    markedRef.current = true;
    onMarkRead?.(message.id);
  }, [isOwn, currentUserId, message, onMarkRead]);

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: isOwn ? 'flex-end' : 'flex-start',
      mb: 1.25,
    }}>
      {!isOwn && (
        <Avatar sx={{ bgcolor: color, width: 32, height: 32, mr: 1, fontSize: 13 }}>
          {senderName.charAt(0).toUpperCase()}
        </Avatar>
      )}
      <Box sx={{
        maxWidth: '72%',
        px: 1.5, py: 1, borderRadius: 2,
        bgcolor: isOwn ? '#2563eb' : '#f3f4f6',
        color:   isOwn ? 'white' : 'inherit',
        position: 'relative',
      }}>
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, opacity: 0.85 }}>
            {senderName}
          </Typography>
          {role && (
            <Chip
              size="small"
              label={role}
              sx={{
                height: 16, fontSize: 10, fontWeight: 600,
                bgcolor: isOwn ? 'rgba(255,255,255,0.2)' : color,
                color: 'white',
              }}
            />
          )}
        </Stack>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {message.message}
        </Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end" sx={{ mt: 0.5 }}>
          <Typography variant="caption" sx={{ opacity: 0.7, fontSize: 10 }}>
            {fmtTime(message.created_at)}
          </Typography>
          {isOwn && (
            <Tooltip title={readBySomeone ? 'Olvasott' : 'Kézbesítve'}>
              <Typography variant="caption" sx={{ opacity: 0.85, fontSize: 11 }}>
                {readBySomeone ? '✓✓' : '✓'}
              </Typography>
            </Tooltip>
          )}
        </Stack>
        {isOwn && (
          <IconButton
            size="small"
            onClick={() => onDelete?.(message.id)}
            sx={{
              position: 'absolute', top: -10, right: -10,
              bgcolor: 'white', boxShadow: 1,
              '&:hover': { bgcolor: '#fee2e2' },
              opacity: 0, transition: 'opacity 0.15s',
              '.MuiBox-root:hover &': { opacity: 1 }, // best-effort hover reveal
            }}
          >
            <DeleteIcon fontSize="inherit" sx={{ fontSize: 14, color: '#dc2626' }} />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

/**
 * Chat thread on a ticket. Fetches all messages on mount, posts new
 * messages, marks them read on render. Refresh button for manual reload
 * — there's no live socket yet, so a 30 s polling option could come
 * later if we want it.
 */
export default function TicketChat({ ticketId, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const res = await ticketsAPI.listMessages(ticketId);
      if (res?.success) setMessages(res.data?.messages || []);
    } catch {
      toast.error('Üzenetek betöltése sikertelen');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // Autoscroll to bottom whenever the thread grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await ticketsAPI.sendMessage(ticketId, { message: text });
      if (res?.success) {
        setMessages(prev => [...prev, res.data.message]);
        setInput('');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Üzenet küldése sikertelen');
    } finally {
      setSending(false);
    }
  };

  const handleMarkRead = useCallback(async (messageId) => {
    try {
      const res = await ticketsAPI.markMessageRead(ticketId, messageId);
      if (res?.success) {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, read_by: res.data.read_by } : m));
      }
    } catch { /* non-fatal */ }
  }, [ticketId]);

  const handleDelete = useCallback(async (messageId) => {
    if (!confirm('Biztosan törlöd?')) return;
    try {
      const res = await ticketsAPI.deleteMessage(ticketId, messageId);
      if (res?.success) {
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Törlés sikertelen');
    }
  }, [ticketId]);

  const handleKeyDown = (e) => {
    // Enter sends; Shift+Enter inserts newline (TextField default)
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const myUserId = currentUser?.id;

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          💬 Kommunikáció
          {messages.length > 0 && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {messages.length} üzenet
            </Typography>
          )}
        </Typography>
        <Tooltip title="Frissítés">
          <IconButton size="small" onClick={load} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Box
        ref={scrollRef}
        sx={{
          height: 380, overflow: 'auto',
          p: 1, bgcolor: '#fafafa', borderRadius: 1,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {loading && messages.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Még nincs üzenet. Írj egyet alulra!
            </Typography>
          </Box>
        ) : (
          messages.map(m => (
            <MessageBubble
              key={m.id}
              message={m}
              isOwn={m.sender_id === myUserId}
              currentUserId={myUserId}
              onMarkRead={handleMarkRead}
              onDelete={handleDelete}
            />
          ))
        )}
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="flex-end">
        <TextField
          fullWidth multiline maxRows={4} size="small"
          placeholder="Üzenet írása… (Enter küld, Shift+Enter új sor)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <Button
          variant="contained"
          startIcon={sending ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <SendIcon />}
          onClick={handleSend}
          disabled={!input.trim() || sending}
          sx={{ bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' } }}
        >
          Küldés
        </Button>
      </Stack>
    </Paper>
  );
}
