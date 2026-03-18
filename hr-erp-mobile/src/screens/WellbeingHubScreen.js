import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../constants/colors';
import wellmindAPI from '../services/wellmind/api';
import carepathAPI from '../services/carepath/api';
import { normalizeRisk, riskColor, num } from '../components/WellMind/helpers';
import { MOOD_EMOJIS } from '../components/WellMind/MoodSelector';

export default function WellbeingHubScreen({ navigation }) {
  const [wellmind, setWellmind] = useState(null);
  const [cases, setCases] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [wmRes, cpRes] = await Promise.all([
        wellmindAPI.dashboard.get().catch(() => ({ data: null })),
        carepathAPI.cases.getMine({ limit: 3 }).catch(() => ({ data: { cases: [], active_count: 0 } })),
      ]);
      setWellmind(wmRes.data);
      setCases(cpRes.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const todayMood = wellmind?.pulse_today?.mood_score;
  const healthScore = num(wellmind?.health_score);
  const risk = normalizeRisk(wellmind?.health_status);
  const rc = riskColor(wellmind?.health_status);

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}>
      {/* WellMind Section */}
      <Text style={styles.sectionHeader}>WellMind — Lelki egészség</Text>

      {/* Health + Mood Row */}
      <View style={styles.row}>
        <TouchableOpacity style={[styles.miniCard, { flex: 1 }]} onPress={() => navigation.navigate('WellMindDashboard')}>
          <Text style={[styles.bigNum, { color: rc }]}>{healthScore}</Text>
          <Text style={styles.miniLabel}>Wellbeing Index</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { flex: 1 }]} onPress={() => navigation.navigate('DailyPulse')}>
          {todayMood ? (
            <>
              <Text style={styles.bigEmoji}>{MOOD_EMOJIS[todayMood]}</Text>
              <Text style={styles.miniLabel}>Mai hangulat</Text>
            </>
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={32} color={colors.primary} />
              <Text style={styles.miniLabel}>Napi check-in</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* WellMind Quick Actions */}
      <View style={styles.card}>
        {[
          { icon: 'happy-outline', label: 'Napi hangulat', screen: 'DailyPulse', color: colors.primary },
          { icon: 'stats-chart-outline', label: 'Hangulat trend', screen: 'PulseHistory', color: colors.info },
          { icon: 'clipboard-outline', label: 'Felmérés', screen: 'Assessment', color: '#9C27B0' },
          { icon: 'bulb-outline', label: 'Beavatkozások', screen: 'Interventions', color: colors.warning },
          { icon: 'people-outline', label: 'Coaching', screen: 'CoachingSessions', color: colors.success },
          { icon: 'time-outline', label: 'Túlóra nyomon követés', screen: 'OvertimeTracker', color: '#f97316' },
          { icon: 'home-outline', label: 'Szállás visszajelzés', screen: 'HousingFeedback', color: '#00BCD4' },
        ].map((a) => (
          <TouchableOpacity key={a.screen} style={styles.actionRow} onPress={() => navigation.navigate(a.screen)}>
            <View style={[styles.actionIconSmall, { backgroundColor: a.color + '15' }]}>
              <Ionicons name={a.icon} size={20} color={a.color} />
            </View>
            <Text style={styles.actionText}>{a.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* CarePath Section */}
      <Text style={styles.sectionHeader}>CarePath — Gondoskodás</Text>

      <View style={styles.row}>
        <TouchableOpacity style={[styles.miniCard, { flex: 1 }]} onPress={() => navigation.navigate('MyCases')}>
          <Text style={[styles.bigNum, { color: '#2196F3' }]}>{num(cases?.active_count)}</Text>
          <Text style={styles.miniLabel}>Aktív ügyeim</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.miniCard, { flex: 1, backgroundColor: '#2196F3' }]} onPress={() => navigation.navigate('CreateCase')}>
          <Ionicons name="add-circle" size={32} color={colors.white} />
          <Text style={[styles.miniLabel, { color: colors.white }]}>Segítségkérés</Text>
        </TouchableOpacity>
      </View>

      {/* CarePath Quick Actions */}
      <View style={styles.card}>
        {[
          { icon: 'shield-outline', label: 'CarePath Dashboard', screen: 'CarePathDashboard', color: '#2196F3' },
          { icon: 'folder-open-outline', label: 'Ügyeim', screen: 'MyCases', color: colors.primary },
          { icon: 'search-outline', label: 'Szolgáltató keresés', screen: 'ProviderSearch', color: '#9C27B0' },
          { icon: 'grid-outline', label: 'Kategóriák', screen: 'ServiceCategories', color: '#FF9800' },
        ].map((a) => (
          <TouchableOpacity key={a.screen} style={styles.actionRow} onPress={() => navigation.navigate(a.screen)}>
            <View style={[styles.actionIconSmall, { backgroundColor: a.color + '15' }]}>
              <Ionicons name={a.icon} size={20} color={a.color} />
            </View>
            <Text style={styles.actionText}>{a.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent Cases */}
      {cases?.cases?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legutóbbi ügyek</Text>
          {cases.cases.map((c) => (
            <TouchableOpacity key={c.id} style={styles.caseRow} onPress={() => navigation.navigate('CaseDetails', { caseId: c.id })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.caseNum}>{c.case_number}</Text>
                <Text style={styles.caseCat}>{c.category_name}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: c.status === 'open' ? colors.info : c.status === 'closed' ? colors.textLight : colors.warning }]} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHeader: { fontSize: 18, fontWeight: '700', color: colors.text, marginHorizontal: 16, marginTop: 16, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 10 },
  miniCard: {
    backgroundColor: colors.white, padding: 20, borderRadius: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  bigNum: { fontSize: 36, fontWeight: '800' },
  bigEmoji: { fontSize: 36 },
  miniLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '500', marginTop: 4 },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
    overflow: 'hidden',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text, padding: 16, paddingBottom: 8 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  actionIconSmall: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  actionText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
  caseRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  caseNum: { fontSize: 14, fontWeight: '600', color: colors.text },
  caseCat: { fontSize: 12, color: colors.textSecondary },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
