import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';

const STATUS_CONFIG = {
  open: { color: colors.info, label: 'Nyitott' },
  assigned: { color: '#2196F3', label: 'Kijelölve' },
  in_progress: { color: colors.warning, label: 'Folyamatban' },
  resolved: { color: colors.success, label: 'Megoldva' },
  closed: { color: colors.textLight, label: 'Lezárva' },
};

export default function CaseStatusBadge({ status, size = 'medium' }) {
  const config = STATUS_CONFIG[status] || { color: colors.textLight, label: status };
  const s = SIZES[size] || SIZES.medium;

  return (
    <View style={[styles.badge, { backgroundColor: config.color + '18' }, s.badge]}>
      <View style={[styles.dot, { backgroundColor: config.color }, s.dot]} />
      <Text style={[styles.label, { color: config.color }, s.label]}>{config.label}</Text>
    </View>
  );
}

export { STATUS_CONFIG };

const SIZES = {
  small: { badge: { paddingHorizontal: 6, paddingVertical: 2 }, dot: { width: 5, height: 5 }, label: { fontSize: 10 } },
  medium: { badge: { paddingHorizontal: 8, paddingVertical: 3 }, dot: { width: 6, height: 6 }, label: { fontSize: 12 } },
  large: { badge: { paddingHorizontal: 10, paddingVertical: 4 }, dot: { width: 7, height: 7 }, label: { fontSize: 13 } },
};

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, gap: 5 },
  dot: { borderRadius: 4 },
  label: { fontWeight: '600' },
});
