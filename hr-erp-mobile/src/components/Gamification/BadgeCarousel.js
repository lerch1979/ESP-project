import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

const BADGE_ICONS = {
  '7_day_streak': 'flame-outline',
  '30_day_streak': 'bonfire-outline',
  '90_day_streak': 'trophy-outline',
  assessment_master: 'ribbon-outline',
  wellness_warrior: 'shield-outline',
  early_bird: 'sunny-outline',
  consistency_king: 'medal-outline',
};

function BadgeItem({ badge, earned = false }) {
  const iconName = BADGE_ICONS[badge.badge_type] || 'medal-outline';

  return (
    <View style={[styles.badge, earned && styles.badgeEarned]}>
      <View style={[styles.iconCircle, earned && styles.iconCircleEarned]}>
        <Ionicons
          name={iconName}
          size={24}
          color={earned ? colors.warning : colors.textLight}
        />
      </View>
      <Text style={[styles.badgeName, earned && styles.badgeNameEarned]} numberOfLines={2}>
        {badge.name}
      </Text>
      {earned && badge.earned_at && (
        <Text style={styles.earnedDate}>
          {new Date(badge.earned_at).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
        </Text>
      )}
      {!earned && badge.description && (
        <Text style={styles.badgeDesc} numberOfLines={2}>{badge.description}</Text>
      )}
    </View>
  );
}

export default function BadgeCarousel({ earned = [], available = [] }) {
  const allBadges = [
    ...earned.map(b => ({ ...b, _earned: true })),
    ...available.map(b => ({ ...b, _earned: false })),
  ];

  if (allBadges.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="medal-outline" size={32} color={colors.textLight} />
        <Text style={styles.emptyText}>Még nincsenek jelvények</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {allBadges.map((badge, index) => (
        <BadgeItem
          key={badge.id || badge.badge_type || index}
          badge={badge}
          earned={badge._earned}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  badge: {
    width: 100,
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeEarned: {
    backgroundColor: '#fffbeb',
    borderColor: colors.warning,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCircleEarned: {
    backgroundColor: '#fef3c7',
  },
  badgeName: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  badgeNameEarned: { color: colors.text },
  earnedDate: { fontSize: 10, color: colors.textLight, marginTop: 4 },
  badgeDesc: { fontSize: 9, color: colors.textLight, textAlign: 'center', marginTop: 4 },
  empty: { alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 13, color: colors.textLight, marginTop: 8 },
});
