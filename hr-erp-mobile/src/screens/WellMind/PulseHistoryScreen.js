import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';
import { MOOD_EMOJIS } from '../../components/WellMind/MoodSelector';
import TrendChart from '../../components/WellMind/TrendChart';
import { num } from '../../components/WellMind/helpers';

const PERIOD_OPTIONS = [
  { label: '7 nap', value: 7 },
  { label: '30 nap', value: 30 },
  { label: '90 nap', value: 90 },
];

export default function PulseHistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState(30);

  const fetchHistory = async (days = period) => {
    try {
      setError(null);
      const response = await wellmindAPI.pulse.getHistory(days);
      setData(response.data);
    } catch {
      setError('Nem sikerült betölteni az előzményeket.');
    } finally { setLoading(false); }
  };

  useEffect(() => { setLoading(true); fetchHistory(period); }, [period]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchHistory()}>
          <Text style={styles.retryText}>Újrapróbálás</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pulses = data?.pulses || [];
  const trend = data?.trend || [];
  const anomaly = data?.anomaly;

  // Transform trend data for TrendChart component (values may be strings from Postgres)
  const chartData = trend.map((t) => ({
    date: t.survey_date,
    value: num(t.mood_score),
    avg: num(t.moving_avg, null),
  }));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => fetchHistory()} tintColor={colors.primary} />}
    >
      {/* Period Selector */}
      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, period === opt.value && styles.chipActive]}
            onPress={() => setPeriod(opt.value)}
          >
            <Text style={[styles.chipText, period === opt.value && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Anomaly Warning */}
      {anomaly?.anomaly && (
        <View style={styles.anomalyCard}>
          <Ionicons name="warning-outline" size={20} color={colors.warning} />
          <Text style={styles.anomalyText}>
            Hangulat csökkenés észlelve: {anomaly.drop_size?.toFixed(1)} ponttal az átlag alatt
          </Text>
        </View>
      )}

      {/* Trend Chart */}
      {chartData.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hangulat trend</Text>
          <TrendChart data={chartData} maxValue={5} height={130} />
        </View>
      )}

      {/* Pulse List */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Részletes előzmények</Text>
        {pulses.length === 0 ? (
          <Text style={styles.emptyText}>Nincs adat a kiválasztott időszakban.</Text>
        ) : (
          pulses.map((pulse, idx) => (
            <View key={idx} style={[styles.pulseItem, idx < pulses.length - 1 && styles.pulseItemBorder]}>
              <Text style={styles.pulseEmoji}>{MOOD_EMOJIS[pulse.mood_score]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pulseDate}>
                  {new Date(pulse.survey_date).toLocaleDateString('hu-HU', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </Text>
                <View style={styles.metricsRow}>
                  <Text style={styles.metric}>Hangulat: {pulse.mood_score}/5</Text>
                  {pulse.stress_level != null && <Text style={styles.metric}>Stressz: {pulse.stress_level}/10</Text>}
                  {pulse.sleep_quality != null && <Text style={styles.metric}>Alvás: {pulse.sleep_quality}/10</Text>}
                  {pulse.workload_level != null && <Text style={styles.metric}>Terhelés: {pulse.workload_level}/10</Text>}
                </View>
                {pulse.notes && <Text style={styles.pulseNotes}>{pulse.notes}</Text>}
              </View>
            </View>
          ))
        )}
      </View>
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
  periodRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, margin: 16 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  anomalyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 12,
    padding: 12, backgroundColor: colors.warningLight, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: colors.warning,
  },
  anomalyText: { fontSize: 13, color: colors.text, flex: 1 },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
  pulseItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 12 },
  pulseItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pulseEmoji: { fontSize: 28, marginTop: 2 },
  pulseDate: { fontSize: 14, fontWeight: '600', color: colors.text },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metric: { fontSize: 12, color: colors.textSecondary },
  pulseNotes: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 },
});
