import React from 'react';
import { Box, Typography, Paper, Chip, Avatar } from '@mui/material';
import { SmartToy } from '@mui/icons-material';

function ChatMessage({ message, onOptionClick, onCategoryClick }) {
  const { sender_type, message_type, content, metadata, created_at } = message;
  const isUser = sender_type === 'user';
  const isSystem = sender_type === 'system';
  const time = created_at
    ? new Date(created_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
    : '';
  const parsedMeta = typeof metadata === 'string' ? JSON.parse(metadata || '{}') : (metadata || {});

  if (isSystem) {
    return (
      <Box sx={{ textAlign: 'center', my: 1 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
          {content}
        </Typography>
        {parsedMeta.ticket_number && (
          <Chip label={`Hibajegy: ${parsedMeta.ticket_number}`} size="small" color="warning" sx={{ mt: 0.5 }} />
        )}
        <Typography variant="caption" color="text.disabled" display="block">{time}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1, alignItems: 'flex-end', gap: 0.5 }}>
      {!isUser && (
        <Avatar sx={{ width: 28, height: 28, bgcolor: '#667eea', mb: 0.5 }}>
          <SmartToy sx={{ fontSize: 16 }} />
        </Avatar>
      )}
      <Paper
        elevation={0}
        sx={{
          px: 1.5, py: 1, maxWidth: '80%', borderRadius: 2,
          bgcolor: isUser ? '#2563eb' : '#f1f5f9',
          color: isUser ? 'white' : 'text.primary',
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
        }}
      >
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
          {content}
        </Typography>
        {message_type === 'options' && parsedMeta.options && (
          <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {parsedMeta.options.map((opt, i) => (
              <Chip
                key={i}
                label={opt.label}
                size="small"
                onClick={() => onOptionClick?.(opt)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: 'rgba(102,126,234,0.15)',
                  color: '#4338ca',
                  fontWeight: 500,
                  '&:hover': { bgcolor: 'rgba(102,126,234,0.3)' },
                }}
              />
            ))}
          </Box>
        )}
        {message_type === 'faq_list' && parsedMeta.categories && (
          <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {parsedMeta.categories.map((cat, i) => (
              <Chip
                key={i}
                label={cat.name || cat}
                size="small"
                onClick={() => onCategoryClick?.(cat)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: 'rgba(102,126,234,0.15)',
                  color: '#4338ca',
                  fontWeight: 500,
                  '&:hover': { bgcolor: 'rgba(102,126,234,0.3)' },
                }}
              />
            ))}
          </Box>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.6, textAlign: 'right', fontSize: '0.7rem' }}>
          {time}
        </Typography>
      </Paper>
    </Box>
  );
}

export default ChatMessage;
