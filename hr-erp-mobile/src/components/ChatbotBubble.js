import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.botRow]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
        <Text style={[styles.bubbleText, isUser ? styles.userText : styles.botText]}>
          {content}
        </Text>
        {message_type === 'options' && metadata?.options && (
          <View style={styles.optionsHint}>
            <Text style={[styles.optionsHintText, isUser && { color: 'rgba(255,255,255,0.7)' }]}>
              {metadata.options.map(o => o.label).join(' | ')}
            </Text>
          </View>
        )}
        {time ? (
          <Text style={[styles.timeText, isUser ? styles.userTime : styles.botTime]}>
            {time}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
    marginHorizontal: 12,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  botRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#e8ecf1',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
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
    color: 'rgba(255,255,255,0.7)',
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
    marginVertical: 8,
    marginHorizontal: 12,
  },
  systemText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  systemTime: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 2,
  },
});
