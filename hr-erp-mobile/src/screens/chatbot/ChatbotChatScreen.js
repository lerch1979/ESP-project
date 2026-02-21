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
        <Text style={styles.typingText}>Válasz írása...</Text>
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
  const [showFaqChips, setShowFaqChips] = useState(true);
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
        setShowFaqChips(false);
      } else {
        try {
          const res = await chatbotAPI.createConversation();
          if (res.success && res.data) {
            setConversationId(res.data.id);
            await fetchMessages(res.data.id);
          }
        } catch (err) {
          console.error('[Chatbot] Failed to create conversation:', err);
          Alert.alert('Hiba', 'Nem sikerült új beszélgetést indítani');
          navigation.goBack();
        }
      }
      setLoading(false);
    };
    init();
  }, [conversationIdParam]);

  const fetchMessages = async (convId) => {
    try {
      const response = await chatbotAPI.getMessages(convId || conversationId);
      setMessages(response.data || []);
    } catch (err) {
      console.error('[Chatbot] Failed to load messages:', err);
    }
  };

  // Hide FAQ chips once user sends first message
  useEffect(() => {
    const userMessages = messages.filter(m => m.sender_type === 'user');
    if (userMessages.length > 0) {
      setShowFaqChips(false);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || sending || !conversationId) return;

    const text = inputText.trim();
    setInputText('');
    Keyboard.dismiss();
    setSending(true);

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
      Alert.alert('Hiba', 'Nem sikerült elküldeni az üzenetet');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleFaqChipPress = async (category) => {
    if (sending || !conversationId) return;
    setSending(true);
    setShowFaqChips(false);

    const text = category.name;
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
      Alert.alert('Hiba', 'Nem sikerült feldolgozni a kérdést');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleOptionSelect = async (option) => {
    if (sending || !conversationId) return;
    setSending(true);

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
      Alert.alert('Hiba', 'Nem sikerült feldolgozni a választást');
    } finally {
      setSending(false);
    }
  };

  const handleSuggestionSelect = async (suggestion) => {
    if (sending || !conversationId) return;
    setSending(true);

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
      Alert.alert('Hiba', 'Nem sikerült feldolgozni a javaslatot');
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  };

  const handleEscalate = () => {
    Alert.alert(
      'Beszélj emberrel',
      'Szeretné továbbítani a kérdését egy munkatársunknak? Automatikusan hibajegy jön létre.',
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Továbbítás',
          onPress: async () => {
            try {
              const response = await chatbotAPI.escalateConversation(conversationId);
              if (response.success) {
                setConversationStatus('escalated');
                fetchMessages(conversationId);
                Alert.alert('Sikeres', `Hibajegy létrehozva: ${response.data.ticketNumber}`);
              }
            } catch (err) {
              Alert.alert('Hiba', 'Nem sikerült az eszkaláció');
            }
          },
        },
      ]
    );
  };

  const handleClose = () => {
    Alert.alert(
      'Beszélgetés lezárása',
      'Biztosan le szeretné zárni a beszélgetést?',
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Lezárás',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatbotAPI.closeConversation(conversationId);
              setConversationStatus('closed');
              fetchMessages(conversationId);
            } catch (err) {
              Alert.alert('Hiba', 'Nem sikerült lezárni a beszélgetést');
            }
          },
        },
      ]
    );
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
    />
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Betöltés...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* FAQ Category Chips */}
      {showFaqChips && faqCategories.length > 0 && (
        <View style={styles.faqChipsWrapper}>
          <Text style={styles.faqChipsTitle}>Miben segíthetünk?</Text>
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
        </View>
      )}

      {/* Messages (inverted FlatList — newest at bottom) */}
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
            <Text style={styles.emptyChatText}>Írjon üzenetet vagy válasszon témát!</Text>
          </View>
        }
      />

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
          <Text style={styles.escalateText}>Beszélj emberrel</Text>
        </TouchableOpacity>
      )}

      {/* Input bar or closed banner */}
      {conversationStatus === 'active' ? (
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder="Írja be üzenetét..."
            placeholderTextColor={colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!sending}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
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
      ) : (
        <View style={styles.closedBanner}>
          <Ionicons
            name={conversationStatus === 'escalated' ? 'alert-circle' : 'checkmark-circle'}
            size={20}
            color={conversationStatus === 'escalated' ? colors.warning : colors.success}
          />
          <Text style={styles.closedText}>
            {conversationStatus === 'escalated'
              ? 'Beszélgetés eszkalálva - hibajegy létrehozva'
              : 'Beszélgetés lezárva'}
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

  // FAQ chips
  faqChipsWrapper: {
    backgroundColor: colors.white,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  faqChipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginLeft: 16,
    marginBottom: 8,
  },
  faqChipsRow: {
    paddingHorizontal: 12,
    gap: 8,
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
