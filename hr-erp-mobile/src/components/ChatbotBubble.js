import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

export default function ChatbotBubble({ message }) {
  const { sender_type, message_type, content, metadata, created_at } = message;

  const isUser = sender_type === 'user';
  const isSystem = sender_type === 'system';

  const time = created_at
    ? new Date(created_at).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
    : '';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{content}</Text>
        {time ? <Text style={styles.systemTime}>{time}</Text> : null}
      </View>
    );
  }

  // Parse options from metadata (may be string or object)
  const options = message_type === 'options'
    ? (typeof metadata === 'string' ? JSON.parse(metadata)?.options : metadata?.options)
    : null;

  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.botRow]}>
      {/* Bot avatar */}
      {!isUser && (
        <View style={styles.botAvatar}>
          <Ionicons name="chatbubble-ellipses" size={14} color={colors.info} />
        </View>
      )}

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
        {time ? (
          <Text style={[styles.timeText, isUser ? styles.userTime : styles.botTime]}>
            {time}
          </Text>
        ) : null}
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
    maxWidth: '72%',
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
});
