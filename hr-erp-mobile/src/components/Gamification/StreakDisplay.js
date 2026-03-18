import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

export default function StreakDisplay({ currentStreak = 0, longestStreak = 0, compact = false }) {
  const streakColor = currentStreak >= 30
    ? colors.warning
    : currentStreak >= 7
      ? colors.success
      : colors.textSecondary;

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <Ionicons name="flame" size={18} color={streakColor} />
        <Text style={[styles.compactValue, { color: streakColor }]}>{currentStreak}</Text>
        <Text style={styles.compactLabel}>nap</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="flame" size={32} color={streakColor} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>Sorozat</Text>
        <View style={styles.row}>
          <Text style={[styles.value, { color: streakColor }]}>{currentStreak}</Text>
          <Text style={styles.unit}>nap</Text>
        </View>
        <Text style={styles.longest}>Leghosszabb: {longestStreak} nap</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.warningLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 12, color: colors.textSecondary, fontWeight: '500', marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  value: { fontSize: 28, fontWeight: '700' },
  unit: { fontSize: 14, color: colors.textSecondary, marginLeft: 4 },
  longest: { fontSize: 12, color: colors.textLight, marginTop: 4 },
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactValue: { fontSize: 16, fontWeight: '700' },
  compactLabel: { fontSize: 12, color: colors.textSecondary },
});
