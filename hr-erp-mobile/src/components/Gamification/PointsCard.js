import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

export default function PointsCard({ points = 0, actionsCount = 0 }) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="star" size={28} color={colors.warning} />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>Összpontszám</Text>
        <Text style={styles.points}>{points.toLocaleString('hu-HU')}</Text>
        <Text style={styles.actions}>{actionsCount} aktivitás</Text>
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
    backgroundColor: '#fffbeb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  content: { flex: 1 },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  points: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 2 },
  actions: { fontSize: 12, color: colors.textLight, marginTop: 2 },
});
