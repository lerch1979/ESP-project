import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

const RISK_CONFIG = {
  green: {
    color: colors.success,
    bg: colors.successLight,
    label: 'Alacsony',
    icon: 'shield-checkmark',
  },
  yellow: {
    color: colors.warning,
    bg: colors.warningLight,
    label: 'Közepes',
    icon: 'warning',
  },
  red: {
    color: colors.error,
    bg: colors.errorLight,
    label: 'Magas',
    icon: 'alert-circle',
  },
};

/**
 * Risk-level badge (green / yellow / red).
 *
 * @param {'green'|'yellow'|'red'} level
 * @param {boolean} [showIcon]  – show icon next to label (default true)
 * @param {'small'|'medium'|'large'} [size] – badge size (default 'medium')
 * @param {string}  [customLabel] – override the default Hungarian label
 */
export default function RiskBadge({
  level = 'green',
  showIcon = true,
  size = 'medium',
  customLabel,
}) {
  const config = RISK_CONFIG[level] || RISK_CONFIG.green;
  const sizeStyles = SIZE_MAP[size] || SIZE_MAP.medium;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, sizeStyles.badge]}>
      {showIcon && (
        <Ionicons
          name={config.icon}
          size={sizeStyles.iconSize}
          color={config.color}
          style={styles.icon}
        />
      )}
      <Text style={[styles.label, { color: config.color }, sizeStyles.label]}>
        {customLabel || config.label}
      </Text>
    </View>
  );
}

/** Export config for external use. */
export { RISK_CONFIG };

const SIZE_MAP = {
  small: {
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    label: { fontSize: 10 },
    iconSize: 12,
  },
  medium: {
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    label: { fontSize: 13 },
    iconSize: 14,
  },
  large: {
    badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
    label: { fontSize: 15 },
    iconSize: 18,
  },
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 4,
  },
  label: {
    fontWeight: '600',
  },
});
