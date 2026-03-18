import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../constants/colors';

/**
 * Circular progress gauge for wellbeing scores (0–100).
 *
 * @param {number}  value      – score 0–100
 * @param {string}  [status]   – 'green' | 'yellow' | 'red' → auto-color
 * @param {string}  [label]    – text below the score
 * @param {number}  [size]     – diameter in px (default 120)
 * @param {number}  [strokeWidth] – ring thickness (default 10)
 */

const STATUS_COLORS = {
  green: colors.success,
  yellow: colors.warning,
  red: colors.error,
};

export default function WellbeingGauge({
  value = 0,
  status,
  label,
  size = 120,
  strokeWidth = 10,
}) {
  const color = status ? STATUS_COLORS[status] || colors.primary : colors.primary;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(value, 0), 100);
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.valueContainer}>
        <Text style={[styles.value, { color }]}>{value}</Text>
        {label && <Text style={styles.label}>{label}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  value: {
    fontSize: 32,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
});
