import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';

const MOOD_OPTIONS = [
  { score: 1, emoji: '😞', label: 'Nagyon rossz' },
  { score: 2, emoji: '😕', label: 'Rossz' },
  { score: 3, emoji: '😐', label: 'Semleges' },
  { score: 4, emoji: '🙂', label: 'Jó' },
  { score: 5, emoji: '😁', label: 'Kiváló' },
];

export const MOOD_EMOJIS = ['', '😞', '😕', '😐', '🙂', '😁'];

/**
 * Emoji mood picker (1–5 scale).
 *
 * @param {number|null} value      – currently selected mood score
 * @param {function}    onChange   – callback(score)
 * @param {boolean}     [disabled] – prevent interaction
 * @param {'horizontal'|'compact'} [variant] – layout style
 */
export default function MoodSelector({ value, onChange, disabled = false, variant = 'horizontal' }) {
  const isCompact = variant === 'compact';

  return (
    <View style={[styles.container, isCompact && styles.containerCompact]}>
      {MOOD_OPTIONS.map((option) => {
        const isSelected = value === option.score;
        return (
          <TouchableOpacity
            key={option.score}
            style={[
              styles.option,
              isCompact && styles.optionCompact,
              isSelected && styles.optionSelected,
            ]}
            onPress={() => !disabled && onChange(option.score)}
            activeOpacity={disabled ? 1 : 0.7}
          >
            <Text style={[styles.emoji, isCompact && styles.emojiCompact]}>{option.emoji}</Text>
            {!isCompact && (
              <Text style={[styles.label, isSelected && styles.labelSelected]}>
                {option.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export { MOOD_OPTIONS };

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  containerCompact: {
    justifyContent: 'center',
    gap: 6,
  },
  option: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 60,
  },
  optionCompact: {
    padding: 6,
    minWidth: 40,
    borderRadius: 12,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  emoji: {
    fontSize: 32,
  },
  emojiCompact: {
    fontSize: 24,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
});
