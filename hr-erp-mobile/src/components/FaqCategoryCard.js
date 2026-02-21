import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

const ICON_MAP = {
  help: 'help-circle-outline',
  work: 'briefcase-outline',
  home: 'home-outline',
  build: 'construct-outline',
  people: 'people-outline',
  document: 'document-text-outline',
  medical: 'medkit-outline',
  info: 'information-circle-outline',
  settings: 'settings-outline',
  calendar: 'calendar-outline',
};

export default function FaqCategoryCard({ category, onPress }) {
  const iconName = ICON_MAP[category.icon] || ICON_MAP.help;
  const bgColor = category.color || '#3b82f6';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(category)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: bgColor + '20' }]}>
        <Ionicons name={iconName} size={28} color={bgColor} />
      </View>
      <Text style={styles.name} numberOfLines={2}>{category.name}</Text>
      {category.description ? (
        <Text style={styles.description} numberOfLines={2}>{category.description}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  description: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
