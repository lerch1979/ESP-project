import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import gamificationAPI from '../../services/gamification/api';

const BADGE_ICONS = {
  '7_day_streak': 'flame-outline',
  '30_day_streak': 'bonfire-outline',
  '90_day_streak': 'trophy-outline',
  assessment_master: 'ribbon-outline',
  wellness_warrior: 'shield-outline',
  early_bird: 'sunny-outline',
  consistency_king: 'medal-outline',
};

export default function BadgeCollectionScreen() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const response = await gamificationAPI.getMyStats();
      setStats(response.data);
    } catch {
      setError('Nem sikerült betölteni a jelvényeket.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const earned = stats?.badgesEarned || [];
  const available = stats?.badgesAvailable || [];
  const allBadges = [
    ...earned.map(b => ({ ...b, _earned: true })),
    ...available.map(b => ({ ...b, _earned: false })),
  ];

  const renderBadge = ({ item }) => {
    const iconName = BADGE_ICONS[item.badge_type] || 'medal-outline';
    const isEarned = item._earned;

    return (
      <View style={[styles.badgeCard, isEarned && styles.badgeCardEarned]}>
        <View style={[styles.iconCircle, isEarned && styles.iconCircleEarned]}>
          <Ionicons name={iconName} size={32} color={isEarned ? colors.warning : colors.textLight} />
        </View>
        <View style={styles.badgeInfo}>
          <Text style={[styles.badgeName, isEarned && styles.badgeNameEarned]}>{item.name}</Text>
          <Text style={styles.badgeDesc}>{item.description}</Text>
          {isEarned && item.earned_at && (
            <Text style={styles.earnedDate}>
              Elnyerve: {new Date(item.earned_at).toLocaleDateString('hu-HU')}
            </Text>
          )}
          {!isEarned && item.points_required && (
            <Text style={styles.requirement}>{item.points_required} pont szükséges</Text>
          )}
        </View>
        {isEarned && (
          <Ionicons name="checkmark-circle" size={24} color={colors.success} />
        )}
      </View>
    );
  };

  return (
    <FlatList
      data={allBadges}
      keyExtractor={(item, index) => item.id || `badge-${index}`}
      renderItem={renderBadge}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {earned.length}/{earned.length + available.length} jelvény megszerzve
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Ionicons name="medal-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyText}>Még nincsenek elérhető jelvények</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 14, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },
  list: { padding: 16 },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  badgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  badgeCardEarned: {
    backgroundColor: '#fffbeb',
    borderColor: colors.warning,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconCircleEarned: { backgroundColor: '#fef3c7' },
  badgeInfo: { flex: 1 },
  badgeName: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  badgeNameEarned: { color: colors.text },
  badgeDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  earnedDate: { fontSize: 11, color: colors.success, marginTop: 4, fontWeight: '500' },
  requirement: { fontSize: 11, color: colors.warning, marginTop: 4, fontWeight: '500' },
  emptyText: { fontSize: 14, color: colors.textLight, marginTop: 12 },
});
