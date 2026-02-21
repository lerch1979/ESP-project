import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, Chip, Button, IconButton } from '@mui/material';
import { ArrowBack, Chat } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

const STATUS_CONFIG = {
  active: { label: 'Aktív', color: 'info' },
  escalated: { label: 'Eszkalált', color: 'warning' },
  closed: { label: 'Lezárt', color: 'default' },
};

function ChatBubble({ message }) {
  const { sender_type, message_type, content, metadata, created_at } = message;
  const isUser = sender_type === 'user';
  const isSystem = sender_type === 'system';
  const time = created_at ? new Date(created_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }) : '';
  const parsedMeta = typeof metadata === 'string' ? JSON.parse(metadata || '{}') : (metadata || {});

  if (isSystem) {
    return (
      <Box sx={{ textAlign: 'center', my: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{content}</Typography>
        {parsedMeta.ticket_number && (
          <Chip label={`Hibajegy: ${parsedMeta.ticket_number}`} size="small" color="warning" sx={{ mt: 0.5 }} />
        )}
        <Typography variant="caption" color="text.disabled" display="block">{time}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1 }}>
      <Paper sx={{
        px: 2, py: 1, maxWidth: '70%', borderRadius: 2,
        bgcolor: isUser ? '#2563eb' : '#f1f5f9',
        color: isUser ? 'white' : 'text.primary',
        borderBottomRightRadius: isUser ? 4 : 16,
        borderBottomLeftRadius: isUser ? 16 : 4,
      }}>
        <Typography variant="body2">{content}</Typography>
        {message_type === 'options' && parsedMeta.options && (
          <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {parsedMeta.options.map((opt, i) => (
              <Chip key={i} label={opt.label} size="small" variant="outlined"
                sx={{ borderColor: isUser ? 'rgba(255,255,255,0.5)' : undefined, color: isUser ? 'white' : undefined }} />
            ))}
          </Box>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7, textAlign: 'right' }}>{time}</Typography>
      </Paper>
    </Box>
  );
}

export default function ChatbotConversationDetail() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const response = await chatbotAPI.adminGetConversationDetail(conversationId);
        setConversation(response.data?.conversation);
        setMessages(response.data?.messages || []);
      } catch (error) {
        toast.error('Hiba a beszélgetés betöltése közben');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [conversationId]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('hu-HU', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) return <Typography>Betöltés...</Typography>;
  if (!conversation) return <Typography>Beszélgetés nem található</Typography>;

  const status = STATUS_CONFIG[conversation.status] || STATUS_CONFIG.active;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={() => navigate('/chatbot/conversations')}><ArrowBack /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700}>
            {conversation.first_name} {conversation.last_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">{conversation.title}</Typography>
        </Box>
        <Chip label={status.label} color={status.color} />
      </Box>

      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">Email</Typography>
          <Typography variant="body2">{conversation.email}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">Létrehozva</Typography>
          <Typography variant="body2">{formatDate(conversation.created_at)}</Typography>
        </Box>
        {conversation.closed_at && (
          <Box>
            <Typography variant="caption" color="text.secondary">Lezárva</Typography>
            <Typography variant="body2">{formatDate(conversation.closed_at)}</Typography>
          </Box>
        )}
        {conversation.escalation_ticket_id && (
          <Box>
            <Typography variant="caption" color="text.secondary">Hibajegy</Typography>
            <Button size="small" onClick={() => navigate(`/tickets/${conversation.escalation_ticket_id}`)}>
              Megtekintés
            </Button>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 2, maxHeight: 600, overflowY: 'auto' }}>
        {messages.length > 0 ? (
          messages.map((msg) => <ChatBubble key={msg.id} message={msg} />)
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Chat sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography color="text.secondary">Nincs üzenet</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
