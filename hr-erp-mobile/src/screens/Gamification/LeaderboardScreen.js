import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import gamificationAPI from '../../services/gamification/api';

const PERIODS = [
  { key: '7days', label: '7 nap' },
  { key: '30days', label: '30 nap' },
  { key: '90days', label: '90 nap' },
];

const RANK_ICONS = {
  1: { name: 'trophy', color: '#FFD700' },
  2: { name: 'trophy', color: '#C0C0C0' },
  3: { name: 'trophy', color: '#CD7F32' },
};

export default function LeaderboardScreen() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30days');
  const [error, setError] = useState(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setError(null);
      const response = await gamificationAPI.getLeaderboard(period);
      setData(response.data);
    } catch {
      setError('Nem sikerült betölteni a ranglistát.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchLeaderboard(); }, [fetchLeaderboard]));

  const renderEntry = ({ item }) => {
    const rankIcon = RANK_ICONS[item.rank];

    return (
      <View style={[styles.row, item.rank <= 3 && styles.topRow]}>
        <View style={styles.rankWrap}>
          {rankIcon ? (
            <Ionicons name={rankIcon.name} size={22} color={rankIcon.color} />
          ) : (
            <Text style={styles.rankNum}>{item.rank}</Text>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.activeDays}>{item.activeDays} aktív nap</Text>
        </View>
        <View style={styles.pointsWrap}>
          <Text style={styles.pointsValue}>{item.points.toLocaleString('hu-HU')}</Text>
          <Text style={styles.pointsLabel}>pont</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, period === p.key && styles.periodBtnActive]}
            onPress={() => { setPeriod(p.key); setLoading(true); }}
          >
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.userId}
          renderItem={renderEntry}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchLeaderboard} tintColor={colors.primary} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="podium-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyText}>Nincs elég adat a ranglistához</Text>
              <Text style={styles.emptySubtext}>Minimum 5 aktivitás szükséges a megjelenéshez</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 14, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },
  periodRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  periodTextActive: { color: colors.white },
  list: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  topRow: {
    borderWidth: 1,
    borderColor: colors.warning,
  },
  rankWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankNum: { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '600', color: colors.text },
  activeDays: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  pointsWrap: { alignItems: 'flex-end' },
  pointsValue: { fontSize: 18, fontWeight: '700', color: colors.primary },
  pointsLabel: { fontSize: 11, color: colors.textSecondary },
  emptyText: { fontSize: 14, color: colors.textLight, marginTop: 12 },
  emptySubtext: { fontSize: 12, color: colors.textLight, marginTop: 4 },
});
