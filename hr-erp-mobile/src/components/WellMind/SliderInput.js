import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';

/**
 * Reusable dot-slider with label and value display.
 *
 * @param {string}   label    – label text
 * @param {number|null} value – currently selected value
 * @param {function} onChange – callback(value)
 * @param {number}   [max]   – max value (default 10)
 * @param {boolean}  [disabled]
 * @param {string}   [activeColor] – override fill color
 */
export default function SliderInput({
  label,
  value,
  onChange,
  max = 10,
  disabled = false,
  activeColor = colors.primary,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: activeColor }]}>
          {value != null ? value : '–'}/{max}
        </Text>
      </View>
      <View style={styles.track}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
          const isActive = value != null && n <= value;
          const isCurrent = n === value;
          return (
            <TouchableOpacity
              key={n}
              style={[
                styles.dot,
                isActive && [styles.dotActive, { backgroundColor: activeColor + '40' }],
                isCurrent && [styles.dotCurrent, { backgroundColor: activeColor }],
              ]}
              onPress={() => !disabled && onChange(n)}
              activeOpacity={disabled ? 1 : 0.6}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            />
          );
        })}
      </View>
      <View style={styles.scaleLabels}>
        <Text style={styles.scaleLabel}>1</Text>
        <Text style={styles.scaleLabel}>{max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
  },
  track: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
  },
  dotActive: {
    // backgroundColor set dynamically
  },
  dotCurrent: {
    transform: [{ scale: 1.2 }],
    // backgroundColor set dynamically
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scaleLabel: {
    fontSize: 10,
    color: colors.textLight,
  },
});
