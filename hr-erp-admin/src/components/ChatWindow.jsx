import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Button,
  CircularProgress,
} from '@mui/material';
import { Close, Send, SupportAgent } from '@mui/icons-material';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';
import ChatMessage from './ChatMessage';

function ChatWindow({ onClose }) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState('active');

  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Create conversation on mount
  useEffect(() => {
    const initConversation = async () => {
      try {
        const response = await chatbotAPI.createConversation();
        const conv = response.data?.conversation || response.data;
        setConversationId(conv.id);
        // Load initial messages (welcome + FAQ categories)
        const msgResponse = await chatbotAPI.getMessages(conv.id);
        setMessages(msgResponse.data?.messages || msgResponse.data || []);
      } catch (error) {
        toast.error('Nem sikerült elindítani a beszélgetést');
      } finally {
        setLoading(false);
      }
    };
    initConversation();
  }, []);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !conversationId || sending) return;

    setInput('');
    setSending(true);

    // Optimistic: add user message
    const userMsg = {
      id: `temp-${Date.now()}`,
      sender_type: 'user',
      message_type: 'text',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await chatbotAPI.sendMessage(conversationId, content);
      const botMessages = response.data?.messages || response.data || [];
      // Replace temp user msg + add bot response
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== userMsg.id);
        return [...withoutTemp, ...botMessages];
      });
    } catch (error) {
      toast.error('Hiba az üzenet küldése közben');
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleOptionClick = async (option) => {
    if (!conversationId || sending) return;
    const content = option.label || option.value || option;
    setSending(true);

    const userMsg = {
      id: `temp-${Date.now()}`,
      sender_type: 'user',
      message_type: 'text',
      content,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await chatbotAPI.sendMessage(conversationId, content);
      const botMessages = response.data?.messages || response.data || [];
      setMessages(prev => {
        const withoutTemp = prev.filter(m => m.id !== userMsg.id);
        return [...withoutTemp, ...botMessages];
      });
    } catch (error) {
      toast.error('Hiba az üzenet küldése közben');
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleCategoryClick = async (category) => {
    const name = category.name || category;
    await handleOptionClick({ label: name });
  };

  const handleEscalate = async () => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      await chatbotAPI.escalateConversation(conversationId);
      // Reload messages to show system escalation message
      const msgResponse = await chatbotAPI.getMessages(conversationId);
      setMessages(msgResponse.data?.messages || msgResponse.data || []);
      setConversationStatus('escalated');
      toast.success('Eszkaláció elküldve, hibajegy létrehozva');
    } catch (error) {
      toast.error('Hiba az eszkaláció közben');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (conversationId) {
      try {
        await chatbotAPI.closeConversation(conversationId);
      } catch {
        // Silent close
      }
    }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isActive = conversationStatus === 'active';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SupportAgent sx={{ fontSize: 24 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              Chatbot Asszisztens
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8, fontSize: '0.7rem' }}>
              Miben segíthetek?
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={handleClose} sx={{ color: 'white' }}>
          <Close fontSize="small" />
        </IconButton>
      </Box>

      {/* Messages area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 1.5,
          py: 1,
          bgcolor: '#fafbfc',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#cbd5e1', borderRadius: 2 },
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress size={32} />
          </Box>
        ) : messages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary">
              Kezdj el egy beszélgetést!
            </Typography>
          </Box>
        ) : (
          messages.map((msg, index) => (
            <ChatMessage
              key={msg.id || index}
              message={msg}
              onOptionClick={handleOptionClick}
              onCategoryClick={handleCategoryClick}
            />
          ))
        )}
        {sending && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 1, ml: 4 }}>
            <CircularProgress size={20} sx={{ color: '#667eea' }} />
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Escalation button */}
      {isActive && conversationId && messages.length > 2 && (
        <Box sx={{ px: 1.5, py: 0.5, borderTop: '1px solid #e2e8f0' }}>
          <Button
            size="small"
            startIcon={<SupportAgent />}
            onClick={handleEscalate}
            disabled={sending}
            sx={{
              textTransform: 'none',
              color: '#dc2626',
              fontSize: '0.75rem',
              '&:hover': { bgcolor: 'rgba(220,38,38,0.05)' },
            }}
          >
            Segítség kérése (Eszkaláció)
          </Button>
        </Box>
      )}

      {/* Input area */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          gap: 0.5,
          alignItems: 'flex-end',
          bgcolor: 'white',
          flexShrink: 0,
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder={isActive ? 'Írj egy üzenetet...' : 'A beszélgetés lezárult'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!isActive || sending}
          multiline
          maxRows={3}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              fontSize: '0.85rem',
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!input.trim() || !isActive || sending}
          sx={{
            color: '#667eea',
            '&:hover': { bgcolor: 'rgba(102,126,234,0.1)' },
          }}
        >
          <Send fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

export default ChatWindow;
