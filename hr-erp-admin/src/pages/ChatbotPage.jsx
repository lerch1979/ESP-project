import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Chip,
  Avatar,
  Alert,
  Button,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Send as SendIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  ThumbUpOutlined as ThumbUpOutlinedIcon,
  ThumbDownOutlined as ThumbDownOutlinedIcon,
  SmartToy as BotIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
  QuestionAnswer as QuestionAnswerIcon,
  History as HistoryIcon,
  Delete as DeleteIcon,
  TrendingUp as TrendingUpIcon,
  Chat as ChatIcon,
  Help as HelpIcon,
} from '@mui/icons-material';
import { chatbotAPI } from '../services/api';
import { toast } from 'react-toastify';

const MAX_CHARS = 500;

const QUICK_QUESTIONS = [
  { id: 'q1', text: 'Hol találom a bérsáv beállításokat?', icon: '💰' },
  { id: 'q2', text: 'Hogyan hozok létre új projektet?', icon: '📋' },
  { id: 'q3', text: 'Hol van a költségközpont kezelő?', icon: '🏢' },
  { id: 'q4', text: 'Hogyan exportálom a számlákat?', icon: '📄' },
];

function MessageBubble({ message, onFeedback, isLast }) {
  const { sender_type, message_type, content, metadata, created_at, helpful } = message;
  const [feedbackSent, setFeedbackSent] = useState(
    helpful === true ? 'helpful' : helpful === false ? 'not_helpful' : null
  );
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const isUser = sender_type === 'user';
  const isBot = sender_type === 'bot';
  const isSystem = sender_type === 'system';

  const parsedMeta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
  const showFeedback = isBot && isLast && message_type === 'text' && parsedMeta?.source === 'knowledge_base';
  const suggestions = message_type === 'suggestions' ? (parsedMeta?.suggestions || []) : [];

  const time = created_at
    ? new Date(created_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleFeedback = async (isHelpful) => {
    if (feedbackSent || feedbackLoading) return;
    setFeedbackLoading(true);
    try {
      await onFeedback?.(message.id, isHelpful);
      setFeedbackSent(isHelpful ? 'helpful' : 'not_helpful');
    } catch {
      // handled by parent
    } finally {
      setFeedbackLoading(false);
    }
  };

  if (isSystem) {
    return (
      <Box sx={{ textAlign: 'center', my: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic', bgcolor: 'grey.100', px: 2, py: 0.5, borderRadius: 2 }}>
          {content}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', mb: 1.5, px: 2 }}>
      {isBot && (
        <Avatar sx={{ bgcolor: '#e3f2fd', width: 32, height: 32, mr: 1, mt: 0.5 }}>
          <BotIcon sx={{ fontSize: 18, color: '#2563eb' }} />
        </Avatar>
      )}
      <Box sx={{ maxWidth: '70%' }}>
        <Paper
          elevation={0}
          sx={{
            px: 2,
            py: 1.5,
            borderRadius: 3,
            bgcolor: isUser ? '#2563eb' : 'grey.200',
            color: isUser ? '#fff' : 'text.primary',
            ...(isUser ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {content}
          </Typography>
          {suggestions.length > 0 && (
            <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {suggestions.map((s) => (
                <Chip
                  key={s.kb_id}
                  label={s.question}
                  size="small"
                  variant="outlined"
                  clickable={isLast}
                  onClick={() => isLast && onFeedback?.('suggestion', s)}
                  sx={{ justifyContent: 'flex-start', height: 'auto', py: 0.5, '& .MuiChip-label': { whiteSpace: 'normal' } }}
                />
              ))}
            </Box>
          )}
          {time && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.7, textAlign: isUser ? 'right' : 'left' }}>
              {time}
            </Typography>
          )}
        </Paper>

        {showFeedback && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, ml: 0.5 }}>
            {feedbackLoading ? (
              <CircularProgress size={16} />
            ) : feedbackSent ? (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {feedbackSent === 'helpful' ? '👍 Hasznos volt' : '👎 Nem volt hasznos'}
              </Typography>
            ) : (
              <>
                <Tooltip title="Hasznos volt">
                  <IconButton size="small" onClick={() => handleFeedback(true)} sx={{ color: 'success.main' }}>
                    <ThumbUpOutlinedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Nem volt hasznos">
                  <IconButton size="small" onClick={() => handleFeedback(false)} sx={{ color: 'error.main' }}>
                    <ThumbDownOutlinedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        )}
      </Box>
      {isUser && (
        <Avatar sx={{ bgcolor: '#2563eb', width: 32, height: 32, ml: 1, mt: 0.5 }}>
          <PersonIcon sx={{ fontSize: 18 }} />
        </Avatar>
      )}
    </Box>
  );
}

function TypingIndicator() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', px: 2, mb: 1.5 }}>
      <Avatar sx={{ bgcolor: '#e3f2fd', width: 32, height: 32, mr: 1 }}>
        <BotIcon sx={{ fontSize: 18, color: '#2563eb' }} />
      </Avatar>
      <Paper elevation={0} sx={{ px: 2, py: 1.5, borderRadius: 3, borderBottomLeftRadius: 4, bgcolor: 'grey.200', display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Válasz írása...
        </Typography>
      </Paper>
    </Box>
  );
}

export default function ChatbotPage() {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [faqCategories, setFaqCategories] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [conversationStatus, setConversationStatus] = useState('active');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  // Init: create conversation + load FAQ categories
  useEffect(() => {
    const init = async () => {
      try {
        const [convRes, faqRes] = await Promise.all([
          chatbotAPI.createConversation(),
          chatbotAPI.getFaqCategories(),
        ]);
        if (convRes.success && convRes.data) {
          setConversationId(convRes.data.id);
        }
        setFaqCategories(faqRes.data || []);
      } catch (err) {
        setError('Nem sikerült inicializálni a chatbotot');
      }

      // Load analytics (non-blocking)
      try {
        const analyticsRes = await chatbotAPI.getAnalytics();
        if (analyticsRes.success) {
          setAnalytics(analyticsRes.data);
        }
      } catch {
        // Analytics is optional
      }

      setLoading(false);
    };
    init();
  }, []);

  const handleSend = async (textOverride) => {
    const text = (textOverride || inputText).trim();
    if (!text || sending || !conversationId) return;

    setInputText('');
    setError(null);
    setSending(true);

    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender_type: 'user',
      message_type: 'text',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await chatbotAPI.sendMessage(conversationId, text);
      if (response.success) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, response.data.userMessage, response.data.botMessage];
        });
      }
    } catch (err) {
      setError('Nem sikerült elküldeni az üzenetet');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setInputText(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleFeedback = useCallback(async (messageIdOrAction, data) => {
    if (messageIdOrAction === 'suggestion') {
      // Handle suggestion selection
      if (sending || !conversationId) return;
      setSending(true);
      const suggestion = data;
      const tempMsg = {
        id: `temp-${Date.now()}`,
        sender_type: 'user',
        message_type: 'text',
        content: suggestion.question,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempMsg]);
      try {
        const response = await chatbotAPI.selectSuggestion(conversationId, suggestion.kb_id);
        if (response.success) {
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempMsg.id);
            return [...filtered, response.data.userMessage, response.data.botMessage];
          });
        }
      } catch {
        setError('Nem sikerült feldolgozni a javaslatot');
        setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      } finally {
        setSending(false);
      }
      return;
    }

    // Handle thumbs up/down
    try {
      await chatbotAPI.sendFeedback(messageIdOrAction, data);
      if (!data) {
        toast.info('Köszönjük! Ha további segítségre van szüksége, eszkalálhat hibajegyként.');
      }
    } catch {
      toast.error('Nem sikerült elküldeni a visszajelzést');
    }
  }, [conversationId, sending]);

  const handleEscalate = async () => {
    if (!conversationId) return;
    try {
      const response = await chatbotAPI.escalateConversation(conversationId);
      if (response.success) {
        setConversationStatus('escalated');
        toast.success(`Hibajegy létrehozva: ${response.data.ticketNumber}`);
        // Reload messages to show system message
        const msgRes = await chatbotAPI.getMessages(conversationId);
        if (msgRes.data) setMessages(msgRes.data);
      }
    } catch {
      toast.error('Nem sikerült az eszkaláció');
    }
  };

  const handleNewConversation = async () => {
    setMessages([]);
    setConversationStatus('active');
    setError(null);
    setLoading(true);
    try {
      const res = await chatbotAPI.createConversation();
      if (res.success && res.data) {
        setConversationId(res.data.id);
      }
    } catch {
      setError('Nem sikerült új beszélgetést indítani');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastBotMessage = messages.length > 0
    ? [...messages].reverse().find(m => m.sender_type === 'bot')
    : null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', gap: 3, height: 'calc(100vh - 100px)', maxHeight: 'calc(100vh - 100px)' }}>
      {/* Main chat area (70%) */}
      <Paper elevation={0} sx={{ flex: 7, display: 'flex', flexDirection: 'column', border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#f8fafc' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: '#e3f2fd', width: 40, height: 40 }}>
              <BotIcon sx={{ color: '#2563eb' }} />
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>HR Chatbot Asszisztens</Typography>
              <Typography variant="caption" color="text.secondary">
                {conversationStatus === 'active' ? 'Online - Kérdezz bátran!' : conversationStatus === 'escalated' ? 'Eszkalálva' : 'Lezárva'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {conversationStatus === 'active' && messages.length >= 2 && (
              <Button size="small" variant="outlined" color="warning" onClick={handleEscalate} startIcon={<PersonIcon />}>
                Eszkaláció
              </Button>
            )}
            <Tooltip title="Új beszélgetés">
              <IconButton onClick={handleNewConversation} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Messages */}
        <Box sx={{ flex: 1, overflow: 'auto', py: 2, bgcolor: '#fafafa' }}>
          {messages.length === 0 ? (
            // Welcome state
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}>
              <Avatar sx={{ bgcolor: '#e3f2fd', width: 64, height: 64, mb: 2 }}>
                <BotIcon sx={{ fontSize: 32, color: '#2563eb' }} />
              </Avatar>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Szia! Miben segíthetek?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center', maxWidth: 400 }}>
                Kérdezz bátran a rendszerrel, HR folyamatokkal vagy a felület használatával kapcsolatban!
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', maxWidth: 500 }}>
                {QUICK_QUESTIONS.map((q) => (
                  <Chip
                    key={q.id}
                    label={q.text}
                    icon={<Typography variant="body2">{q.icon}</Typography>}
                    variant="outlined"
                    clickable
                    onClick={() => handleSend(q.text)}
                    sx={{ borderRadius: 3, py: 2.5, '& .MuiChip-label': { whiteSpace: 'normal', lineHeight: 1.4 } }}
                  />
                ))}
              </Box>
            </Box>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onFeedback={handleFeedback}
                  isLast={msg.id === lastBotMessage?.id}
                />
              ))}
              {sending && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </>
          )}
        </Box>

        {/* Error */}
        {error && (
          <Alert severity="error" sx={{ mx: 2, mb: 1, borderRadius: 2 }} action={
            <Button size="small" onClick={() => setError(null)}>Bezár</Button>
          }>
            {error}
          </Alert>
        )}

        {/* Input */}
        {conversationStatus === 'active' ? (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: '#fff', display: 'flex', alignItems: 'flex-end', gap: 1 }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              maxRows={3}
              placeholder="Írj egy üzenetet... (Enter = küldés, Shift+Enter = új sor)"
              value={inputText}
              onChange={(e) => setInputText(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              disabled={sending}
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, bgcolor: '#f8fafc' } }}
              slotProps={{
                input: {
                  inputProps: { maxLength: MAX_CHARS },
                },
              }}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              {inputText.length > MAX_CHARS * 0.8 && (
                <Typography variant="caption" sx={{ color: inputText.length >= MAX_CHARS ? 'error.main' : 'text.secondary', fontSize: 10 }}>
                  {inputText.length}/{MAX_CHARS}
                </Typography>
              )}
              <IconButton
                color="primary"
                onClick={() => handleSend()}
                disabled={!inputText.trim() || sending}
                sx={{ bgcolor: '#2563eb', color: '#fff', '&:hover': { bgcolor: '#1d4ed8' }, '&.Mui-disabled': { bgcolor: 'grey.300', color: 'grey.500' } }}
              >
                {sending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : <SendIcon />}
              </IconButton>
            </Box>
          </Box>
        ) : (
          <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', textAlign: 'center', bgcolor: conversationStatus === 'escalated' ? 'warning.50' : 'success.50' }}>
            <Typography variant="body2" color="text.secondary">
              {conversationStatus === 'escalated'
                ? '📋 Beszélgetés eszkalálva - hibajegy létrehozva'
                : '✅ Beszélgetés lezárva'}
            </Typography>
            <Button size="small" onClick={handleNewConversation} sx={{ mt: 1 }}>
              Új beszélgetés indítása
            </Button>
          </Box>
        )}
      </Paper>

      {/* Right sidebar (30%) */}
      <Box sx={{ flex: 3, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 280 }}>
        {/* Analytics mini widget */}
        {analytics && (
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUpIcon sx={{ fontSize: 18, color: '#2563eb' }} />
              Napi statisztika
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box sx={{ textAlign: 'center', bgcolor: '#f0f9ff', borderRadius: 2, p: 1 }}>
                <Typography variant="h6" fontWeight={700} color="#2563eb">{analytics.totalConversations || 0}</Typography>
                <Typography variant="caption" color="text.secondary">Beszélgetés</Typography>
              </Box>
              <Box sx={{ textAlign: 'center', bgcolor: '#f0fdf4', borderRadius: 2, p: 1 }}>
                <Typography variant="h6" fontWeight={700} color="success.main">{analytics.resolutionRate || 0}%</Typography>
                <Typography variant="caption" color="text.secondary">Megoldási arány</Typography>
              </Box>
            </Box>
          </Paper>
        )}

        {/* Quick questions */}
        <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <HelpIcon sx={{ fontSize: 18, color: '#2563eb' }} />
            Gyors kérdések
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {QUICK_QUESTIONS.map((q) => (
              <Button
                key={q.id}
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => handleSend(q.text)}
                disabled={sending}
                sx={{ justifyContent: 'flex-start', textTransform: 'none', borderRadius: 2, textAlign: 'left', py: 1, fontSize: 13 }}
              >
                {q.icon} {q.text}
              </Button>
            ))}
          </Box>
        </Paper>

        {/* FAQ categories */}
        {faqCategories.length > 0 && (
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <QuestionAnswerIcon sx={{ fontSize: 18, color: '#2563eb' }} />
              GYIK kategóriák
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {faqCategories.map((cat) => (
                <Chip
                  key={cat.id}
                  label={cat.name}
                  size="small"
                  clickable
                  onClick={() => handleSend(cat.name)}
                  disabled={sending}
                  sx={{ borderRadius: 2, bgcolor: (cat.color || '#3b82f6') + '18' }}
                />
              ))}
            </Box>
          </Paper>
        )}

        {/* Actions */}
        <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
            Műveletek
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              fullWidth
              startIcon={<RefreshIcon />}
              onClick={handleNewConversation}
              sx={{ justifyContent: 'flex-start', textTransform: 'none', borderRadius: 2 }}
            >
              Új beszélgetés
            </Button>
            {conversationStatus === 'active' && messages.length >= 2 && (
              <Button
                variant="outlined"
                size="small"
                fullWidth
                color="warning"
                startIcon={<PersonIcon />}
                onClick={handleEscalate}
                sx={{ justifyContent: 'flex-start', textTransform: 'none', borderRadius: 2 }}
              >
                Eszkaláció (hibajegy)
              </Button>
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
