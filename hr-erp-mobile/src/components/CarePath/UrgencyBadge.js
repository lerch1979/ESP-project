import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

const URGENCY_CONFIG = {
  low: { color: colors.success, label: 'Alacsony', icon: 'chevron-down-outline' },
  medium: { color: colors.warning, label: 'Közepes', icon: 'remove-outline' },
  high: { color: '#f97316', label: 'Magas', icon: 'chevron-up-outline' },
  crisis: { color: colors.error, label: 'Krízis', icon: 'alert-circle' },
};

export default function UrgencyBadge({ level, showIcon = true }) {
  const config = URGENCY_CONFIG[level] || URGENCY_CONFIG.low;
  return (
    <View style={[styles.badge, { backgroundColor: config.color + '15' }]}>
      {showIcon && <Ionicons name={config.icon} size={14} color={config.color} />}
      <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

export { URGENCY_CONFIG };

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 4 },
  label: { fontSize: 12, fontWeight: '600' },
});
