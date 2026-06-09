import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

// Big icon-driven action card for the resident home screen.
// variant: 'primary' (full-width, accent bg, dominant) | 'grid' (half-width tile).
// badge: optional number shown top-right (open count / unread count).
export default function ActionCard({ icon, label, badge = 0, onPress, variant = 'grid' }) {
  const primary = variant === 'primary';
  return (
    <TouchableOpacity
      style={[styles.card, primary ? styles.primaryCard : styles.gridCard]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
      <Ionicons name={icon} size={primary ? 52 : 38} color={primary ? colors.white : colors.primary} />
      <Text style={[styles.label, primary && styles.primaryLabel]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryCard: {
    backgroundColor: colors.primary,
    paddingVertical: 30,
    marginBottom: 14,
  },
  gridCard: {
    flex: 1,
    minHeight: 116,
    margin: 6,
  },
  label: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  primaryLabel: {
    color: colors.white,
    fontSize: 20,
    marginTop: 12,
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 12,
    backgroundColor: colors.error,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 1,
  },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
