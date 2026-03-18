import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';
import WellbeingGauge from '../../components/WellMind/WellbeingGauge';
import { MOOD_EMOJIS } from '../../components/WellMind/MoodSelector';
import RiskBadge from '../../components/WellMind/RiskBadge';
import { normalizeRisk, num, burnoutColor, engagementColor } from '../../components/WellMind/helpers';

export default function WellMindDashboard({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const response = await wellmindAPI.dashboard.get();
      setData(response.data);
    } catch {
      setError('Nem sikerült betölteni az adatokat.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchDashboard(); }, [fetchDashboard]));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchDashboard}>
          <Text style={styles.retryText}>Újrapróbálás</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const todayMood = data?.pulse_today?.mood_score;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDashboard} tintColor={colors.primary} />}
    >
      {/* Health Score Gauge */}
      <View style={styles.healthCard}>
        <WellbeingGauge
          value={num(data?.health_score)}
          status={normalizeRisk(data?.health_status)}
          label="Wellbeing"
          size={140}
          strokeWidth={12}
        />
      </View>

      {/* Daily Pulse */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Mai hangulat</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DailyPulse')}>
            <Text style={styles.linkText}>{todayMood ? 'Megtekintés' : 'Kitöltés'}</Text>
          </TouchableOpacity>
        </View>
        {todayMood ? (
          <View style={styles.moodRow}>
            <Text style={styles.moodEmoji}>{MOOD_EMOJIS[todayMood]}</Text>
            <View>
              <Text style={styles.moodScore}>{todayMood}/5</Text>
              {data.pulse_today.stress_level != null && (
                <Text style={styles.moodDetail}>Stressz: {data.pulse_today.stress_level}/10</Text>
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.promptRow} onPress={() => navigation.navigate('DailyPulse')}>
            <Ionicons name="add-circle-outline" size={32} color={colors.primary} />
            <Text style={styles.promptText}>Töltsd ki a mai hangulatfelmérést!</Text>
          </TouchableOpacity>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            30 napos átlag: {num(data?.pulse_summary?.avg_mood_30d, null)?.toFixed(1) ?? '–'}/5
          </Text>
          <Text style={styles.summaryText}>
            Kitöltések: {num(data?.pulse_summary?.pulse_count_30d)}
          </Text>
        </View>
      </View>

      {/* Assessment */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Negyedéves felmérés</Text>
          <TouchableOpacity onPress={() => navigation.navigate('AssessmentResults')}>
            <Text style={styles.linkText}>Előzmények</Text>
          </TouchableOpacity>
        </View>
        {data?.assessment_latest ? (
          <View style={styles.assessmentRow}>
            <View style={styles.assessmentItem}>
              <Text style={styles.assessmentLabel}>Kiégés</Text>
              <Text style={[styles.assessmentValue, {
                color: burnoutColor(data.assessment_latest.burnout_score),
              }]}>{Math.round(num(data.assessment_latest.burnout_score))}%</Text>
            </View>
            <View style={styles.assessmentItem}>
              <Text style={styles.assessmentLabel}>Elköteleződés</Text>
              <Text style={[styles.assessmentValue, {
                color: engagementColor(data.assessment_latest.engagement_score),
              }]}>{Math.round(num(data.assessment_latest.engagement_score))}%</Text>
            </View>
            <View style={styles.assessmentItem}>
              <Text style={styles.assessmentLabel}>Kockázat</Text>
              <RiskBadge level={data.assessment_latest.risk_level} showIcon={false} />
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.promptRow} onPress={() => navigation.navigate('Assessment')}>
            <Ionicons name="clipboard-outline" size={32} color={colors.primary} />
            <Text style={styles.promptText}>Még nincs felmérés. Töltsd ki most!</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Interventions */}
      {data?.interventions?.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Ajánlott beavatkozások</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Interventions')}>
              <Text style={styles.linkText}>Összes ({data.interventions.length})</Text>
            </TouchableOpacity>
          </View>
          {data.interventions.slice(0, 3).map((item) => (
            <TouchableOpacity key={item.id} style={styles.listItem} onPress={() => navigation.navigate('Interventions')}>
              <View style={[styles.dot, {
                backgroundColor: item.priority === 'urgent' ? colors.error
                  : item.priority === 'high' ? colors.warning : colors.info,
              }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.listTitle}>{item.title}</Text>
                <Text style={styles.listSub}>{item.intervention_type}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Coaching */}
      {data?.coaching_upcoming?.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Következő coaching</Text>
            <TouchableOpacity onPress={() => navigation.navigate('CoachingSessions')}>
              <Text style={styles.linkText}>Összes</Text>
            </TouchableOpacity>
          </View>
          {data.coaching_upcoming.slice(0, 2).map((s) => (
            <View key={s.id} style={styles.listItem}>
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.listTitle}>
                  {new Date(s.session_date).toLocaleDateString('hu-HU', {
                    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
                <Text style={styles.listSub}>{s.session_type} ({s.duration_minutes} perc)</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        {[
          { icon: 'stats-chart-outline', label: 'Trend', screen: 'PulseHistory' },
          { icon: 'clipboard-outline', label: 'Felmérés', screen: 'Assessment' },
          { icon: 'people-outline', label: 'Coaching', screen: 'CoachingSessions' },
        ].map((a) => (
          <TouchableOpacity key={a.screen} style={styles.actionBtn} onPress={() => navigation.navigate(a.screen)}>
            <Ionicons name={a.icon} size={24} color={colors.primary} />
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 14, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },
  retryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryText: { color: colors.white, fontWeight: '600' },
  healthCard: {
    backgroundColor: colors.white, margin: 16, padding: 24, borderRadius: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  linkText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  moodRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  moodEmoji: { fontSize: 40 },
  moodScore: { fontSize: 18, fontWeight: '600', color: colors.text },
  moodDetail: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  promptText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  summaryText: { fontSize: 13, color: colors.textSecondary },
  assessmentRow: { flexDirection: 'row', justifyContent: 'space-around' },
  assessmentItem: { alignItems: 'center' },
  assessmentLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  assessmentValue: { fontSize: 22, fontWeight: '700' },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  listTitle: { fontSize: 14, fontWeight: '500', color: colors.text },
  listSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 16, marginTop: 8 },
  actionBtn: {
    alignItems: 'center', padding: 16, backgroundColor: colors.white, borderRadius: 12, minWidth: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  actionLabel: { fontSize: 12, color: colors.text, fontWeight: '500', marginTop: 6 },
});
