import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

export default function ChatbotBubble({
  message,
  onSuggestionPress,
  suggestionsEnabled,
  onFeedback,
  feedbackEnabled,
}) {
  const { sender_type, message_type, content, metadata, created_at, helpful } = message;
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [localFeedback, setLocalFeedback] = useState(
    helpful === true ? 'helpful' : helpful === false ? 'not_helpful' : null
  );

  const isUser = sender_type === 'user';
  const isSystem = sender_type === 'system';
  const isBot = sender_type === 'bot';

  const time = created_at
    ? new Date(created_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleFeedback = async (isHelpful) => {
    if (localFeedback || feedbackSending) return;
    setFeedbackSending(true);
    try {
      const result = await onFeedback?.(message.id, isHelpful);
      setLocalFeedback(isHelpful ? 'helpful' : 'not_helpful');
      return result;
    } catch {
      // Error handled by parent
    } finally {
      setFeedbackSending(false);
    }
  };

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{content}</Text>
        {time ? <Text style={styles.systemTime}>{time}</Text> : null}
      </View>
    );
  }

  // Parse options from metadata (may be string or object)
  const parsedMeta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
  const options = message_type === 'options' ? (parsedMeta?.options || []) : null;
  const suggestions = message_type === 'suggestions' ? (parsedMeta?.suggestions || []) : [];

  // Show feedback for bot text messages with FAQ source
  const showFeedback = isBot && feedbackEnabled && message_type === 'text' && parsedMeta?.source === 'knowledge_base';

  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.botRow]}>
      {/* Bot avatar */}
      {!isUser && (
        <View style={styles.botAvatar}>
          <Ionicons name="chatbubble-ellipses" size={14} color={colors.info} />
        </View>
      )}

      <View style={{ maxWidth: '72%' }}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
          <Text style={[styles.bubbleText, isUser ? styles.userText : styles.botText]}>
            {content}
          </Text>
          {options && options.length > 0 && (
            <View style={styles.optionsHint}>
              <Text style={[styles.optionsHintText, isUser && { color: 'rgba(255,255,255,0.7)' }]}>
                {options.map(o => o.label).join(' | ')}
              </Text>
            </View>
          )}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.kb_id}
                  style={[styles.suggestionButton, !suggestionsEnabled && styles.suggestionButtonDisabled]}
                  onPress={() => suggestionsEnabled && onSuggestionPress?.(s)}
                  disabled={!suggestionsEnabled}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="help-circle-outline"
                    size={16}
                    color={suggestionsEnabled ? colors.info : colors.textLight}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[styles.suggestionText, !suggestionsEnabled && styles.suggestionTextDisabled]}
                    numberOfLines={2}
                  >
                    {s.question}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {time ? (
            <Text style={[styles.timeText, isUser ? styles.userTime : styles.botTime]}>
              {time}
            </Text>
          ) : null}
        </View>

        {/* Feedback buttons */}
        {showFeedback && (
          <View style={styles.feedbackRow}>
            {feedbackSending ? (
              <ActivityIndicator size="small" color={colors.textLight} />
            ) : localFeedback ? (
              <View style={styles.feedbackDone}>
                <Ionicons
                  name={localFeedback === 'helpful' ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={localFeedback === 'helpful' ? colors.success : colors.error}
                />
                <Text style={styles.feedbackDoneText}>
                  {localFeedback === 'helpful' ? 'Hasznos volt' : 'Nem volt hasznos'}
                </Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.feedbackButton, styles.feedbackHelpful]}
                  onPress={() => handleFeedback(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="thumbs-up-outline" size={13} color={colors.success} />
                  <Text style={[styles.feedbackButtonText, { color: colors.success }]}>Segitett</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.feedbackButton, styles.feedbackNotHelpful]}
                  onPress={() => handleFeedback(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="thumbs-down-outline" size={13} color={colors.error} />
                  <Text style={[styles.feedbackButtonText, { color: colors.error }]}>Nem segitett</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* User avatar */}
      {isUser && (
        <View style={styles.userAvatar}>
          <Ionicons name="person" size={14} color={colors.white} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 3,
    marginHorizontal: 12,
    alignItems: 'flex-end',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  botRow: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.info + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    marginBottom: 2,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    marginBottom: 2,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#e5e7eb',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: colors.white,
  },
  botText: {
    color: colors.text,
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
  },
  userTime: {
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'right',
  },
  botTime: {
    color: colors.textLight,
  },
  optionsHint: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  optionsHintText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  // Suggestions
  suggestionsContainer: {
    marginTop: 8,
    gap: 6,
  },
  suggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.info + '12',
    borderWidth: 1,
    borderColor: colors.info + '40',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionButtonDisabled: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderColor: 'rgba(0,0,0,0.08)',
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.info,
    lineHeight: 18,
  },
  suggestionTextDisabled: {
    color: colors.textLight,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 10,
    marginHorizontal: 24,
  },
  systemText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  systemTime: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 2,
  },
  // Feedback
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: 4,
    gap: 6,
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  feedbackHelpful: {
    backgroundColor: colors.successLight,
    borderColor: colors.success + '40',
  },
  feedbackNotHelpful: {
    backgroundColor: colors.errorLight,
    borderColor: colors.error + '40',
  },
  feedbackButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  feedbackDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  feedbackDoneText: {
    fontSize: 11,
    color: colors.textLight,
  },
});
