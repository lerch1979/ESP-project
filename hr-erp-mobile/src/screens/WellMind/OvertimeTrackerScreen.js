import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';
import api from '../../services/api';
import { num } from '../../components/WellMind/helpers';
import TrendChart from '../../components/WellMind/TrendChart';

const CATEGORY_COLORS = {
  Heavy: colors.error,
  Moderate: colors.warning,
  Normal: colors.success,
};

const CATEGORY_LABELS = {
  Heavy: 'Magas túlóra',
  Moderate: 'Mérsékelt túlóra',
  Normal: 'Normál',
};

export default function OvertimeTrackerScreen({ navigation }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wellmind, setWellmind] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [otRes, wmRes] = await Promise.all([
        api.get('/wellmind/overtime/my', { params: { months: 6 } }).catch(() => ({ data: { data: [] } })),
        wellmindAPI.dashboard.get().catch(() => ({ data: null })),
      ]);
      setData(otRes.data?.data || []);
      setWellmind(wmRes.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const currentMonth = data[0];
  const totalHours = num(currentMonth?.total_hours);
  const overtimeHours = num(currentMonth?.overtime_hours);
  const category = currentMonth?.overtime_category || 'Normal';
  const catColor = CATEGORY_COLORS[category] || colors.success;

  // Prepare chart data (reversed for chronological order)
  const chartData = [...data].reverse().map((d) => ({
    date: d.month,
    value: num(d.overtime_hours),
  }));

  const burnoutScore = num(wellmind?.assessment_latest?.burnout_score);
  const showWarning = overtimeHours > 40 && burnoutScore > 50;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}
    >
      {/* Current Month */}
      <View style={styles.headerCard}>
        <Text style={styles.monthLabel}>
          {currentMonth ? new Date(currentMonth.month).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long' }) : 'Aktuális hónap'}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalHours.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Összes óra</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: catColor }]}>{overtimeHours.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Túlóra</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.categoryBadge, { backgroundColor: catColor + '18' }]}>
              <Text style={[styles.categoryText, { color: catColor }]}>{CATEGORY_LABELS[category]}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Warning */}
      {showWarning && (
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={20} color={colors.error} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.warningTitle}>Magas túlóra és kiégés kockázat</Text>
            <Text style={styles.warningText}>A magas túlóra negatívan hathat a jóllétre. Fontold meg a terhelés csökkentését.</Text>
          </View>
        </View>
      )}

      {/* Trend Chart */}
      {chartData.length > 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Túlóra trend (6 hónap)</Text>
          <TrendChart
            data={chartData}
            maxValue={Math.max(...chartData.map((d) => d.value), 50)}
            height={130}
            barColor={colors.warning}
            showLegend={false}
          />
        </View>
      )}

      {/* Monthly Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Havi bontás</Text>
        {data.length === 0 ? (
          <Text style={styles.emptyText}>Nincs túlóra adat.</Text>
        ) : (
          data.map((d, idx) => {
            const ot = num(d.overtime_hours);
            const cc = CATEGORY_COLORS[d.overtime_category] || colors.success;
            return (
              <View key={idx} style={[styles.monthItem, idx < data.length - 1 && styles.monthBorder]}>
                <Text style={styles.monthName}>
                  {new Date(d.month).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short' })}
                </Text>
                <Text style={styles.monthHours}>{num(d.total_hours).toFixed(0)}h ({num(d.days_worked)} nap)</Text>
                <Text style={[styles.monthOvertime, { color: cc }]}>+{ot.toFixed(0)}h</Text>
              </View>
            );
          })
        )}
      </View>

      {/* CTA */}
      {overtimeHours > 20 && (
        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => navigation.navigate('Assessment')}>
            <Ionicons name="clipboard-outline" size={18} color={colors.white} />
            <Text style={styles.ctaText}>Felmérés kitöltése</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: '#2196F3' }]} onPress={() => navigation.navigate('CreateCase')}>
            <Ionicons name="shield-outline" size={18} color={colors.white} />
            <Text style={styles.ctaText}>Támogatás kérés</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: {
    backgroundColor: colors.white, margin: 16, padding: 20, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  monthLabel: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', textTransform: 'capitalize' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 32, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  categoryBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 8 },
  categoryText: { fontSize: 13, fontWeight: '600' },
  warningCard: {
    flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 16, marginBottom: 12,
    padding: 14, backgroundColor: colors.errorLight, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: colors.error,
  },
  warningTitle: { fontSize: 14, fontWeight: '600', color: colors.error },
  warningText: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingVertical: 16 },
  monthItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  monthBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  monthName: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text, textTransform: 'capitalize' },
  monthHours: { fontSize: 13, color: colors.textSecondary, marginRight: 12 },
  monthOvertime: { fontSize: 15, fontWeight: '700', minWidth: 50, textAlign: 'right' },
  ctaRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16 },
  ctaBtn: {
    flex: 1, flexDirection: 'row', gap: 6, backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  ctaText: { color: colors.white, fontWeight: '600', fontSize: 13 },
});
