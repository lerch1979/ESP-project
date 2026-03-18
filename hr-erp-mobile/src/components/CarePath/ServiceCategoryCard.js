import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

const CATEGORY_ICONS = {
  counseling: 'chatbubbles-outline',
  legal_aid: 'shield-checkmark-outline',
  financial_advisory: 'cash-outline',
  crisis_intervention: 'alert-circle-outline',
  family_support: 'people-outline',
  health_wellness: 'heart-outline',
};

const CATEGORY_COLORS = {
  counseling: '#2196F3',
  legal_aid: '#9C27B0',
  financial_advisory: '#4CAF50',
  crisis_intervention: '#f44336',
  family_support: '#FF9800',
  health_wellness: '#00BCD4',
};

export default function ServiceCategoryCard({ category, onPress, mini = false }) {
  const iconName = CATEGORY_ICONS[category.icon_name] || CATEGORY_ICONS[category.category_name] || 'help-circle-outline';
  const iconColor = CATEGORY_COLORS[category.icon_name] || CATEGORY_COLORS[category.category_name] || colors.primary;

  if (mini) {
    return (
      <View style={styles.miniBadge}>
        <Ionicons name={iconName} size={14} color={iconColor} />
        <Text style={[styles.miniText, { color: iconColor }]}>{category.category_name}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconCircle, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={iconName} size={28} color={iconColor} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{category.category_name}</Text>
      {category.description && (
        <Text style={styles.description} numberOfLines={2}>{category.description}</Text>
      )}
    </TouchableOpacity>
  );
}

export { CATEGORY_ICONS, CATEGORY_COLORS };

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white, padding: 16, borderRadius: 12, alignItems: 'center',
    width: '47%', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' },
  description: { fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 16 },
  miniBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  miniText: { fontSize: 11, fontWeight: '500' },
});
