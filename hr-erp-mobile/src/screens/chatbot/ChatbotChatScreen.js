import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, StyleSheet, Keyboard,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatbotAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import ChatbotBubble from '../../components/ChatbotBubble';

const MAX_CHARS = 500;

const QUICK_QUESTIONS = [
  { id: 'q1', text: 'Hogyan kerhetek szabadsagot?', icon: 'calendar-outline' },
  { id: 'q2', text: 'Mikor kapom a fizetest?', icon: 'cash-outline' },
  { id: 'q3', text: 'Kinek jelentsem a lakasproblemat?', icon: 'home-outline' },
  { id: 'q4', text: 'Mik a kozossegi szabalyok?', icon: 'people-outline' },
];

const FAQ_ICON_MAP = {
  help: 'help-circle-outline',
  work: 'briefcase-outline',
  home: 'home-outline',
  build: 'construct-outline',
  people: 'people-outline',
  document: 'document-text-outline',
  medical: 'medkit-outline',
  info: 'information-circle-outline',
  settings: 'settings-outline',
  calendar: 'calendar-outline',
};

function TypingIndicator() {
  return (
    <View style={styles.typingRow}>
      <View style={styles.typingAvatar}>
        <Ionicons name="chatbubble-ellipses" size={14} color={colors.info} />
      </View>
      <View style={styles.typingBubble}>
        <ActivityIndicator size="small" color={colors.textSecondary} />
        <Text style={styles.typingText}>Valasz irasa...</Text>
      </View>
    </View>
  );
}

export default function ChatbotChatScreen({ route, navigation }) {
  const conversationIdParam = route.params?.conversationId;

  const [conversationId, setConversationId] = useState(conversationIdParam || null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState('active');
  const [faqCategories, setFaqCategories] = useState([]);
  const [showWelcome, setShowWelcome] = useState(true);
  const [error, setError] = useState(null);
  const flatListRef = useRef(null);
  const inputRef = useRef(null);

  // Inverted data: reverse messages for inverted FlatList
  const invertedMessages = [...messages].reverse();

  // Create conversation if none provided
  useEffect(() => {
    const init = async () => {
      try {
        const faqRes = await chatbotAPI.getFaqCategories();
        setFaqCategories(faqRes.data || []);
      } catch (err) {
        console.error('[Chatbot] Failed to load FAQ categories:', err);
      }

      if (conversationIdParam) {
        await fetchMessages(conversationIdParam);
        setShowWelcome(false);
      } else {
        try {
          const res = await chatbotAPI.createConversation();
          if (res.success && res.data) {
            setConversationId(res.data.id);
            await fetchMessages(res.data.id);
          }
        } catch (err) {
          console.error('[Chatbot] Failed to create conversation:', err);
          setError('Nem sikerult uj beszelgetest inditani. Probalja ujra!');
        }
      }
      setLoading(false);
    };
    init();
  }, [conversationIdParam]);

  const fetchMessages = async (convId) => {
    try {
      setError(null);
      const response = await chatbotAPI.getMessages(convId || conversationId);
      setMessages(response.data || []);
    } catch (err) {
      console.error('[Chatbot] Failed to load messages:', err);
      setError('Nem sikerult betolteni az uzeneteket');
    }
  };

  // Hide welcome once user sends first message
  useEffect(() => {
    const userMessages = messages.filter(m => m.sender_type === 'user');
    if (userMessages.length > 0) {
      setShowWelcome(false);
    }
  }, [messages]);

  const handleSend = async (textOverride) => {
    const text = (textOverride || inputText).trim();
    if (!text || sending || !conversationId) return;

    setInputText('');
    setError(null);
    Keyboard.dismiss();
    setSending(true);
    setShowWelcome(false);

    // Optimistic add
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
      setError('Nem sikerult elkuldeni az uzenetet. Probalja ujra!');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
      setInputText(text); // Restore input so user can retry
    } finally {
      setSending(false);
    }
  };

  const handleQuickQuestion = (question) => {
    handleSend(question.text);
  };

  const handleFaqChipPress = async (category) => {
    if (sending || !conversationId) return;
    handleSend(category.name);
  };

  const handleOptionSelect = async (option) => {
    if (sending || !conversationId) return;
    setSending(true);
    setError(null);

    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender_type: 'user',
      message_type: 'text',
      content: option.label,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await chatbotAPI.sendMessage(conversationId, option.id);
      if (response.success) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, response.data.userMessage, response.data.botMessage];
        });
      }
    } catch (err) {
      setError('Nem sikerult feldolgozni a valasztast');
    } finally {
      setSending(false);
    }
  };

  const handleSuggestionSelect = async (suggestion) => {
    if (sending || !conversationId) return;
    setSending(true);
    setError(null);

    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender_type: 'user',
      message_type: 'text',
      content: suggestion.question,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await chatbotAPI.selectSuggestion(conversationId, suggestion.kb_id);
      if (response.success) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, response.data.userMessage, response.data.botMessage];
        });
      }
    } catch (err) {
      setError('Nem sikerult feldolgozni a javaslatot');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleFeedback = useCallback(async (messageId, helpful) => {
    try {
      const result = await chatbotAPI.sendFeedback(messageId, helpful);
      // If not helpful, offer to escalate
      if (!helpful && conversationStatus === 'active') {
        Alert.alert(
          'Sajnaljuk!',
          'Szeretne hibajegyet letrehozni, hogy egy munkatarsunk segitsen?',
          [
            { text: 'Nem', style: 'cancel' },
            {
              text: 'Hibajegy letrehozasa',
              onPress: () => handleEscalate(),
            },
          ]
        );
      }
      return result;
    } catch (err) {
      console.error('[Chatbot] Feedback error:', err);
    }
  }, [conversationId, conversationStatus]);

  const handleEscalate = () => {
    Alert.alert(
      'Beszelj emberrel',
      'Szeretne tovabbitani a kerdeset egy munkatarsunknak? Automatikusan hibajegy jon letre.',
      [
        { text: 'Megse', style: 'cancel' },
        {
          text: 'Tovabbitas',
          onPress: async () => {
            try {
              const response = await chatbotAPI.escalateConversation(conversationId);
              if (response.success) {
                setConversationStatus('escalated');
                fetchMessages(conversationId);
                Alert.alert('Sikeres', `Hibajegy letrehozva: ${response.data.ticketNumber}`);
              }
            } catch (err) {
              setError('Nem sikerult az eszkalacio');
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    Alert.alert(
      'Beszelgetes lezarasa',
      'Biztosan le szeretne zarni a beszelgetest?',
      [
        { text: 'Megse', style: 'cancel' },
        {
          text: 'Lezaras',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatbotAPI.closeConversation(conversationId);
              setConversationStatus('closed');
              fetchMessages(conversationId);
            } catch (err) {
              setError('Nem sikerult lezarni a beszelgetest');
            }
          },
        },
      ]
    );
  };

  const handleRetry = () => {
    setError(null);
    if (!conversationId) {
      setLoading(true);
      chatbotAPI.createConversation().then(res => {
        if (res.success && res.data) {
          setConversationId(res.data.id);
          fetchMessages(res.data.id);
        }
        setLoading(false);
      }).catch(() => {
        setError('Nem sikerult ujra csatlakozni');
        setLoading(false);
      });
    } else {
      fetchMessages(conversationId);
    }
  };

  // Find the last bot message with options
  const lastBotOptions = messages.length > 0
    ? [...messages].reverse().find(m => m.sender_type === 'bot' && m.message_type === 'options')
    : null;
  const optionsToShow = lastBotOptions?.metadata?.options || (
    typeof lastBotOptions?.metadata === 'string' ? JSON.parse(lastBotOptions.metadata)?.options : null
  );

  // Find the last bot message with suggestions
  const lastBotSuggestions = messages.length > 0
    ? [...messages].reverse().find(m => m.sender_type === 'bot' && m.message_type === 'suggestions')
    : null;

  // Last bot message (for feedback - only show on most recent)
  const lastBotMessage = messages.length > 0
    ? [...messages].reverse().find(m => m.sender_type === 'bot')
    : null;

  // Header buttons
  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        conversationStatus === 'active' ? (
          <TouchableOpacity onPress={handleClose} style={{ marginRight: 8 }}>
            <Ionicons name="close-circle-outline" size={24} color={colors.white} />
          </TouchableOpacity>
        ) : null,
    });
  }, [conversationStatus, navigation]);

  const renderMessage = ({ item }) => (
    <ChatbotBubble
      message={item}
      onSuggestionPress={handleSuggestionSelect}
      suggestionsEnabled={item.id === lastBotSuggestions?.id}
      onFeedback={handleFeedback}
      feedbackEnabled={item.id === lastBotMessage?.id && conversationStatus === 'active'}
    />
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Betoltes...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Welcome / Quick Questions */}
      {showWelcome && messages.length === 0 && (
        <View style={styles.welcomeWrapper}>
          <View style={styles.welcomeHeader}>
            <View style={styles.welcomeIcon}>
              <Ionicons name="chatbubble-ellipses" size={32} color={colors.info} />
            </View>
            <Text style={styles.welcomeTitle}>Szia! Miben segithetek?</Text>
            <Text style={styles.welcomeSubtitle}>
              Valaszolj gyorsan a leggyakoribb kerdesekre, vagy irj sajat kerdest!
            </Text>
          </View>

          {/* Quick questions */}
          <Text style={styles.quickTitle}>Gyors kerdesek</Text>
          <View style={styles.quickGrid}>
            {QUICK_QUESTIONS.map((q) => (
              <TouchableOpacity
                key={q.id}
                style={styles.quickCard}
                onPress={() => handleQuickQuestion(q)}
                activeOpacity={0.7}
              >
                <Ionicons name={q.icon} size={20} color={colors.info} />
                <Text style={styles.quickText} numberOfLines={2}>{q.text}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* FAQ category chips */}
          {faqCategories.length > 0 && (
            <>
              <Text style={styles.quickTitle}>Kategoriak</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.faqChipsRow}
              >
                {faqCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.faqChip}
                    onPress={() => handleFaqChipPress(cat)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={FAQ_ICON_MAP[cat.icon] || 'help-circle-outline'}
                      size={16}
                      color={colors.info}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.faqChipText}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      )}

      {/* Messages (inverted FlatList - newest at bottom) */}
      {(!showWelcome || messages.length > 0) && (
        <FlatList
          ref={flatListRef}
          data={invertedMessages}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={[
            styles.messageList,
            messages.length === 0 && styles.emptyMessageList,
          ]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={sending ? <TypingIndicator /> : null}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyChatText}>Kezdd el a beszelgetest!</Text>
            </View>
          }
        />
      )}

      {/* Decision tree option buttons */}
      {optionsToShow && optionsToShow.length > 0 && conversationStatus === 'active' && (
        <View style={styles.optionsContainer}>
          {optionsToShow.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.optionButton}
              onPress={() => handleOptionSelect(option)}
              disabled={sending}
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Escalation button */}
      {conversationStatus === 'active' && messages.length >= 2 && (
        <TouchableOpacity
          style={styles.escalateButton}
          onPress={handleEscalate}
          activeOpacity={0.7}
        >
          <Ionicons name="person-outline" size={18} color={colors.warning} />
          <Text style={styles.escalateText}>Beszelj emberrel</Text>
        </TouchableOpacity>
      )}

      {/* Error banner with retry */}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
            <Ionicons name="refresh-outline" size={16} color={colors.info} />
            <Text style={styles.retryText}>Ujra</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar or closed banner */}
      {conversationStatus === 'active' ? (
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder="Irj egy uzenetet..."
            placeholderTextColor={colors.textLight}
            value={inputText}
            onChangeText={(text) => setInputText(text.slice(0, MAX_CHARS))}
            multiline
            maxLength={MAX_CHARS}
            editable={!sending}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => handleSend()}
          />
          <View style={styles.inputActions}>
            {inputText.length > MAX_CHARS * 0.8 && (
              <Text style={[
                styles.charCount,
                inputText.length >= MAX_CHARS && styles.charCountLimit,
              ]}>
                {inputText.length}/{MAX_CHARS}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
              onPress={() => handleSend()}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.7}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="send" size={18} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.closedBanner}>
          <Ionicons
            name={conversationStatus === 'escalated' ? 'alert-circle' : 'checkmark-circle'}
            size={20}
            color={conversationStatus === 'escalated' ? colors.warning : colors.success}
          />
          <Text style={styles.closedText}>
            {conversationStatus === 'escalated'
              ? 'Beszelgetes eszkalava - hibajegy letrehozva'
              : 'Beszelgetes lezarva'}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },

  // Welcome screen
  welcomeWrapper: {
    flex: 1,
    paddingTop: 20,
  },
  welcomeHeader: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.info + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Quick questions
  quickTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 16,
  },
  quickCard: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  quickText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    lineHeight: 18,
  },

  // FAQ chips
  faqChipsRow: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 16,
  },
  faqChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoLight,
    borderWidth: 1,
    borderColor: colors.info + '30',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  faqChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.info,
  },

  // Messages
  messageList: {
    paddingVertical: 12,
  },
  emptyMessageList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyChat: {
    alignItems: 'center',
    padding: 40,
    // Flip for inverted list so it appears right-side up
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginHorizontal: 12,
    marginVertical: 4,
  },
  typingAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.info + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  typingText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },

  // Options
  optionsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    backgroundColor: colors.info + '12',
    borderWidth: 1,
    borderColor: colors.info,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  optionText: {
    color: colors.info,
    fontSize: 14,
    fontWeight: '500',
  },

  // Escalate button
  escalateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: colors.warningLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.warning + '40',
  },
  escalateText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.warning,
    marginLeft: 6,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.errorLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.error + '30',
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  retryText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.info,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 8,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: colors.text,
    marginRight: 8,
  },
  inputActions: {
    alignItems: 'center',
    gap: 2,
  },
  charCount: {
    fontSize: 10,
    color: colors.textLight,
  },
  charCountLimit: {
    color: colors.error,
    fontWeight: '600',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textLight,
  },

  // Closed banner
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  closedText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8,
  },
});
