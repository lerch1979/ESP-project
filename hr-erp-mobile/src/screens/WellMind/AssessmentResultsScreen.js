import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';
import RiskBadge, { RISK_CONFIG } from '../../components/WellMind/RiskBadge';
import WellbeingGauge from '../../components/WellMind/WellbeingGauge';
import { normalizeRisk, riskColor, num, burnoutColor, engagementColor } from '../../components/WellMind/helpers';

const RISK_ICONS = { green: 'shield-checkmark', yellow: 'warning', red: 'alert-circle' };

function ScoreBar({ label, value, inverted = false }) {
  const pct = Math.min(value, 100);
  const barColor = inverted
    ? (value > 70 ? colors.error : value > 50 ? colors.warning : colors.success)
    : (value < 40 ? colors.error : value < 60 ? colors.warning : colors.success);
  return (
    <View style={styles.scoreBarWrap}>
      <View style={styles.scoreBarHead}>
        <Text style={styles.scoreBarLabel}>{label}</Text>
        <Text style={[styles.scoreBarVal, { color: barColor }]}>{value}%</Text>
      </View>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

export default function AssessmentResultsScreen({ navigation, route }) {
  const freshResult = route.params?.result;
  const [loading, setLoading] = useState(!freshResult);
  const [history, setHistory] = useState(freshResult ? [freshResult.assessment] : []);
  const [interventions] = useState(freshResult?.interventions || []);
  const [error, setError] = useState(null);

  useEffect(() => { if (!freshResult) fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      setError(null);
      const response = await wellmindAPI.assessment.getHistory();
      setHistory(response.data || []);
    } catch { setError('Nem sikerült betölteni az előzményeket.'); }
    finally { setLoading(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchHistory}>
          <Text style={styles.retryText}>Újrapróbálás</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="clipboard-outline" size={48} color={colors.textLight} />
        <Text style={styles.emptyTitle}>Még nincs felmérés</Text>
        <TouchableOpacity style={styles.startBtn} onPress={() => navigation.navigate('Assessment')}>
          <Text style={styles.startBtnText}>Felmérés indítása</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const latest = history[0];
  const risk = normalizeRisk(latest.risk_level);
  const rColor = riskColor(latest.risk_level);

  return (
    <ScrollView style={styles.container}>
      {/* Fresh Result Banner */}
      {freshResult && (
        <View style={[styles.banner, { backgroundColor: rColor + '12', borderLeftColor: rColor }]}>
          <Ionicons name={RISK_ICONS[risk]} size={24} color={rColor} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <RiskBadge level={risk} size="large" />
            <Text style={styles.bannerSub}>
              {risk === 'green' ? 'Jó állapotban vagy!' : 'Figyelj oda magadra.'}
            </Text>
          </View>
        </View>
      )}

      {/* Main Scores — dual gauge */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {latest.quarter} — {new Date(latest.assessment_date).toLocaleDateString('hu-HU')}
        </Text>
        <View style={styles.gaugeRow}>
          <WellbeingGauge
            value={Math.round(num(latest.burnout_score))}
            status={num(latest.burnout_score) > 70 ? 'red' : num(latest.burnout_score) > 50 ? 'yellow' : 'green'}
            label="Kiégés"
            size={100}
            strokeWidth={8}
          />
          <WellbeingGauge
            value={Math.round(num(latest.engagement_score))}
            status={num(latest.engagement_score) < 40 ? 'red' : num(latest.engagement_score) < 60 ? 'yellow' : 'green'}
            label="Elköteleződés"
            size={100}
            strokeWidth={8}
          />
        </View>
      </View>

      {/* Detailed Scores */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Részletes eredmények</Text>
        <ScoreBar label="Érzelmi kimerülés" value={Math.round(num(latest.emotional_exhaustion_score))} inverted />
        <ScoreBar label="Deperszonalizáció" value={Math.round(num(latest.depersonalization_score))} inverted />
        <ScoreBar label="Személyes teljesítmény" value={Math.round(num(latest.personal_accomplishment_score))} />
        <ScoreBar label="Életerő" value={Math.round(num(latest.vigor_score))} />
        <ScoreBar label="Elkötelezettség" value={Math.round(num(latest.dedication_score))} />
        <ScoreBar label="Elmélyülés" value={Math.round(num(latest.absorption_score))} />
      </View>

      {/* Interventions */}
      {interventions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Ajánlott beavatkozások</Text>
          {interventions.map((item) => (
            <View key={item.id} style={styles.intItem}>
              <Ionicons name="bulb-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.intTitle}>{item.title}</Text>
                <Text style={styles.intDesc}>{item.description}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.viewAllBtn} onPress={() => navigation.navigate('Interventions')}>
            <Text style={styles.viewAllText}>Beavatkozások kezelése</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* History */}
      {history.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Korábbi felmérések</Text>
          {history.slice(1).map((item) => (
            <View key={item.id} style={styles.historyRow}>
              <RiskBadge level={normalizeRisk(item.risk_level)} showIcon={false} size="small" />
              <Text style={styles.historyQ}>{item.quarter}</Text>
              <Text style={styles.historyVal}>Kiégés: {Math.round(num(item.burnout_score))}%</Text>
              <Text style={styles.historyVal}>Elk.: {Math.round(num(item.engagement_score))}%</Text>
            </View>
          ))}
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
  emptyTitle: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 16 },
  startBtn: { marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  startBtnText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', margin: 16, padding: 16, borderRadius: 12, borderLeftWidth: 4 },
  bannerSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 14 },
  gaugeRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  scoreBarWrap: { marginBottom: 14 },
  scoreBarHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  scoreBarLabel: { fontSize: 13, color: colors.text, fontWeight: '500' },
  scoreBarVal: { fontSize: 13, fontWeight: '700' },
  scoreBarTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  intItem: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  intTitle: { fontSize: 14, fontWeight: '500', color: colors.text },
  intDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  viewAllBtn: { alignItems: 'center', paddingTop: 12 },
  viewAllText: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  historyQ: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  historyVal: { fontSize: 12, color: colors.textSecondary },
});
