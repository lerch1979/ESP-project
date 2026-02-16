import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

const defaultColorMap = {
  open: colors.statusOpen,
  new: colors.statusOpen,
  in_progress: colors.statusInProgress,
  in_review: colors.statusInProgress,
  resolved: colors.statusResolved,
  closed: colors.statusClosed,
  active: colors.success,
  inactive: colors.textSecondary,
  available: colors.success,
  occupied: colors.statusInProgress,
  maintenance: colors.error,
};

export default function StatusBadge({ label, slug, color }) {
  const badgeColor = color || defaultColorMap[slug] || colors.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor: badgeColor + '18' }]}>
      <Text style={[styles.text, { color: badgeColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
