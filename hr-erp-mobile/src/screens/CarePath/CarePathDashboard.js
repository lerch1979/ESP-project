import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';
import CaseStatusBadge from '../../components/CarePath/CaseStatusBadge';
import UrgencyBadge from '../../components/CarePath/UrgencyBadge';
import { num } from '../../components/WellMind/helpers';

export default function CarePathDashboard({ navigation }) {
  const [stats, setStats] = useState(null);
  const [cases, setCases] = useState({ cases: [], active_count: 0, closed_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statsRes, casesRes] = await Promise.all([
        carepathAPI.admin.getUsageStats().catch(() => ({ data: [] })),
        carepathAPI.cases.getMine({ limit: 5 }),
      ]);
      setStats(statsRes.data?.[0] || null);
      setCases(casesRes.data || { cases: [], active_count: 0, closed_count: 0 });
    } catch {
      setError('Nem sikerült betölteni az adatokat.');
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchData}><Text style={styles.retryText}>Újrapróbálás</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}>
      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{num(cases.active_count)}</Text>
          <Text style={styles.statLabel}>Aktív ügyek</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{num(cases.closed_count)}</Text>
          <Text style={styles.statLabel}>Lezárt ügyek</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{num(stats?.sessions_held)}</Text>
          <Text style={styles.statLabel}>Alkalmak</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Gyors műveletek</Text>
        <View style={styles.actionsGrid}>
          {[
            { icon: 'add-circle-outline', label: 'Új ügy', screen: 'CreateCase', color: '#2196F3' },
            { icon: 'folder-open-outline', label: 'Ügyeim', screen: 'MyCases', color: colors.primary },
            { icon: 'search-outline', label: 'Szolgáltató keresés', screen: 'ProviderSearch', color: '#9C27B0' },
            { icon: 'grid-outline', label: 'Kategóriák', screen: 'ServiceCategories', color: '#FF9800' },
          ].map((a) => (
            <TouchableOpacity key={a.screen} style={styles.actionItem} onPress={() => navigation.navigate(a.screen)}>
              <View style={[styles.actionIcon, { backgroundColor: a.color + '15' }]}>
                <Ionicons name={a.icon} size={24} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recent Cases */}
      {cases.cases?.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Legutóbbi ügyek</Text>
            <TouchableOpacity onPress={() => navigation.navigate('MyCases')}>
              <Text style={styles.linkText}>Összes</Text>
            </TouchableOpacity>
          </View>
          {cases.cases.slice(0, 5).map((c) => (
            <TouchableOpacity key={c.id} style={styles.caseItem} onPress={() => navigation.navigate('CaseDetails', { caseId: c.id })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.caseNumber}>{c.case_number}</Text>
                <Text style={styles.caseCategory}>{c.category_name || 'Általános'}</Text>
              </View>
              <View style={styles.caseBadges}>
                <CaseStatusBadge status={c.status} size="small" />
                <UrgencyBadge level={c.urgency_level} showIcon={false} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Empty state */}
      {(!cases.cases || cases.cases.length === 0) && (
        <View style={styles.emptyCard}>
          <Ionicons name="shield-outline" size={48} color={colors.textLight} />
          <Text style={styles.emptyTitle}>Nincs aktív ügyed</Text>
          <Text style={styles.emptyText}>Ha segítségre van szükséged, nyiss egy új ügyet.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('CreateCase')}>
            <Text style={styles.emptyBtnText}>Új ügy indítása</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryText: { color: colors.white, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', margin: 16, gap: 10 },
  statCard: {
    flex: 1, backgroundColor: colors.white, padding: 16, borderRadius: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: colors.primary },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  linkText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionItem: { width: '46%', alignItems: 'center', paddingVertical: 12 },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  actionLabel: { fontSize: 12, fontWeight: '500', color: colors.text, textAlign: 'center' },
  caseItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  caseNumber: { fontSize: 14, fontWeight: '600', color: colors.text },
  caseCategory: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  caseBadges: { alignItems: 'flex-end', gap: 4 },
  emptyCard: {
    backgroundColor: colors.white, marginHorizontal: 16, padding: 32, borderRadius: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 12 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  emptyBtn: { marginTop: 16, backgroundColor: '#2196F3', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  emptyBtnText: { color: colors.white, fontWeight: '600' },
});
