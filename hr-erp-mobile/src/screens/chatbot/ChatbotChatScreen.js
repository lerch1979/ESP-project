import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatbotAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import ChatbotBubble from '../../components/ChatbotBubble';

export default function ChatbotChatScreen({ route, navigation }) {
  const { conversationId } = route.params;
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationStatus, setConversationStatus] = useState('active');
  const flatListRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    try {
      const response = await chatbotAPI.getMessages(conversationId);
      setMessages(response.data || []);
    } catch (err) {
      console.error('[Chatbot] Failed to load messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;

    const text = inputText.trim();
    setInputText('');
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
        // Replace temp message + add bot response
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== tempUserMsg.id);
          return [...filtered, response.data.userMessage, response.data.botMessage];
        });
      }
    } catch (err) {
      Alert.alert('Hiba', 'Nem sikerült elküldeni az üzenetet');
    } finally {
      setSending(false);
    }
  };

  const handleOptionSelect = async (option) => {
    if (sending) return;
    setSending(true);

    // Show selected option as user message
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      sender_type: 'user',
      message_type: 'text',
      content: option.label,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      // Send the node ID so the backend can navigate the tree
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

  const handleEscalate = () => {
    Alert.alert(
      'Eszkaláció',
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
                fetchMessages();
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
              fetchMessages();
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

  const renderMessage = ({ item }) => <ChatbotBubble message={item} />;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        conversationStatus === 'active' ? (
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={handleEscalate} style={{ marginRight: 12 }}>
              <Ionicons name="alert-circle-outline" size={24} color={colors.white} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} style={{ marginRight: 8 }}>
              <Ionicons name="close-circle-outline" size={24} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : null,
    });
  }, [conversationStatus, navigation]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Option buttons for decision tree */}
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

      {conversationStatus === 'active' ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Írja be üzenetét..."
            placeholderTextColor={colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={20} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.closedBanner}>
          <Ionicons
            name={conversationStatus === 'escalated' ? 'alert-circle' : 'checkmark-circle'}
            size={18}
            color={conversationStatus === 'escalated' ? colors.warning : colors.textLight}
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
  messageList: {
    paddingVertical: 12,
  },
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
    backgroundColor: colors.primary + '15',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  optionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textLight,
  },
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
