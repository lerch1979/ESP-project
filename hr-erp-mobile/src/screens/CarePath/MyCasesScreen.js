import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';
import CaseStatusBadge from '../../components/CarePath/CaseStatusBadge';
import UrgencyBadge from '../../components/CarePath/UrgencyBadge';

const FILTERS = [
  { label: 'Összes', value: null },
  { label: 'Nyitott', value: 'open' },
  { label: 'Folyamatban', value: 'in_progress' },
  { label: 'Lezárt', value: 'closed' },
];

export default function MyCasesScreen({ navigation }) {
  const [data, setData] = useState({ cases: [], active_count: 0, closed_count: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);

  const fetchCases = useCallback(async () => {
    try {
      const response = await carepathAPI.cases.getMine(filter ? { status: filter } : {});
      setData(response.data || { cases: [], active_count: 0, closed_count: 0 });
    } catch { /* silent */ } finally { setLoading(false); }
  }, [filter]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchCases(); }, [fetchCases]));

  const renderCase = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('CaseDetails', { caseId: item.id })} activeOpacity={0.7}>
      <View style={styles.cardTop}>
        <Text style={styles.caseNumber}>{item.case_number}</Text>
        <CaseStatusBadge status={item.status} size="small" />
      </View>
      <Text style={styles.category}>{item.category_name || 'Általános'}</Text>
      {item.issue_description && (
        <Text style={styles.description} numberOfLines={2}>{item.issue_description}</Text>
      )}
      <View style={styles.cardBottom}>
        <UrgencyBadge level={item.urgency_level} />
        <Text style={styles.dateText}>
          {new Date(item.opened_at || item.created_at).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}><Text style={styles.statNum}>{data.active_count}</Text><Text style={styles.statText}>aktív</Text></View>
        <View style={styles.statChip}><Text style={styles.statNum}>{data.closed_count}</Text><Text style={styles.statText}>lezárt</Text></View>
      </View>

      {/* Filters */}
      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={FILTERS}
        keyExtractor={(i) => i.label} contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity style={[styles.chip, filter === f.value && styles.chipActive]} onPress={() => setFilter(f.value)}>
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* List */}
      <FlatList
        data={data.cases} keyExtractor={(i) => i.id} renderItem={renderCase}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCases} tintColor={colors.primary} />}
        contentContainerStyle={data.cases.length === 0 ? styles.emptyWrap : { paddingHorizontal: 16, paddingBottom: 80 }}
        ListEmptyComponent={!loading && (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>Nincs ügy ebben a kategóriában.</Text>
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateCase')}>
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingVertical: 12 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statNum: { fontSize: 18, fontWeight: '700', color: colors.primary },
  statText: { fontSize: 13, color: colors.textSecondary },
  filterRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  card: {
    backgroundColor: colors.white, marginBottom: 10, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caseNumber: { fontSize: 15, fontWeight: '700', color: colors.text },
  category: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  description: { fontSize: 13, color: colors.textSecondary, marginTop: 6, lineHeight: 18 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  dateText: { fontSize: 12, color: colors.textLight },
  emptyWrap: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  fab: {
    position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#2196F3', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6,
  },
});
