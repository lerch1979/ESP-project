import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator,
  RefreshControl, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';

const STATUS_FILTERS = [
  { label: 'Összes', value: null },
  { label: 'Ajánlott', value: 'recommended' },
  { label: 'Elfogadott', value: 'accepted' },
  { label: 'Folyamatban', value: 'in_progress' },
  { label: 'Befejezett', value: 'completed' },
];

const TYPE_ICONS = {
  coaching: 'people-outline', meditation: 'leaf-outline', exercise: 'fitness-outline',
  time_off: 'calendar-outline', eap_referral: 'medkit-outline', training: 'school-outline',
  workload_adjustment: 'construct-outline',
};
const TYPE_LABELS = {
  coaching: 'Coaching', meditation: 'Meditáció', exercise: 'Testmozgás',
  time_off: 'Szabadság', eap_referral: 'EAP ajánlás', training: 'Képzés',
  workload_adjustment: 'Terhelés csökkentés',
};
const PRIORITY_COLORS = { urgent: colors.error, high: '#f97316', medium: colors.warning, low: colors.success };
const STATUS_COLORS = {
  recommended: colors.info, accepted: colors.primary, in_progress: colors.warning,
  completed: colors.success, declined: colors.textLight, expired: colors.textLight,
};
const STATUS_LABELS = {
  recommended: 'Ajánlott', accepted: 'Elfogadva', in_progress: 'Folyamatban',
  completed: 'Befejezve', declined: 'Elutasítva', expired: 'Lejárt',
};

export default function InterventionsScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  // Complete modal state
  const [completeModal, setCompleteModal] = useState(null); // intervention id
  const [completeRating, setCompleteRating] = useState(0);
  const [completeNotes, setCompleteNotes] = useState('');
  const [completeSubmitting, setCompleteSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const response = await wellmindAPI.interventions.getAll(filter);
      setItems(response.data || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [filter]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchData(); }, [fetchData]));

  const handleAccept = async (id) => {
    setActionLoading(id);
    try {
      await wellmindAPI.interventions.accept(id);
      Alert.alert('Elfogadva! ✅', 'A beavatkozás elfogadva.\n+5 pont! 🎯');
      fetchData();
    } catch {
      Alert.alert('Hiba', 'Nem sikerült elfogadni.');
    } finally { setActionLoading(null); }
  };

  const handleCompleteSubmit = async () => {
    if (completeRating === 0) {
      Alert.alert('Hiányzó adat', 'Kérjük, adj értékelést!');
      return;
    }
    setCompleteSubmitting(true);
    try {
      await wellmindAPI.interventions.complete(completeModal, {
        effectiveness_rating: completeRating,
        completion_notes: completeNotes.trim() || undefined,
      });
      setCompleteModal(null);
      setCompleteRating(0);
      setCompleteNotes('');
      Alert.alert('Szép munka! 🎉', 'A beavatkozás sikeresen lezárva.\n+15 pont! 🎯');
      fetchData();
    } catch {
      Alert.alert('Hiba', 'Nem sikerült befejezni.');
    } finally { setCompleteSubmitting(false); }
  };

  const handleSkip = (id) => {
    Alert.alert('Elutasítás', 'Biztosan elutasítod ezt a beavatkozást?', [
      { text: 'Mégse', style: 'cancel' },
      {
        text: 'Elutasítás', style: 'destructive',
        onPress: async () => {
          setActionLoading(id);
          try {
            await wellmindAPI.interventions.skip(id);
            Alert.alert('Elutasítva', 'A beavatkozás elutasítva.');
            fetchData();
          } catch {
            Alert.alert('Hiba', 'Nem sikerült elutasítani.');
          } finally { setActionLoading(null); }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => {
    const icon = TYPE_ICONS[item.intervention_type] || 'bulb-outline';
    const sColor = STATUS_COLORS[item.status] || colors.info;
    const isActionable = ['recommended', 'accepted', 'in_progress'].includes(item.status);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: sColor + '15' }]}>
            <Ionicons name={icon} size={22} color={sColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <View style={styles.metaRow}>
              <View style={[styles.badge, { backgroundColor: sColor + '20' }]}>
                <Text style={[styles.badgeText, { color: sColor }]}>{STATUS_LABELS[item.status] || item.status}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: (PRIORITY_COLORS[item.priority] || colors.info) + '20' }]}>
                <Text style={[styles.badgeText, { color: PRIORITY_COLORS[item.priority] || colors.info }]}>{item.priority}</Text>
              </View>
            </View>
          </View>
        </View>
        <Text style={styles.description}>{item.description}</Text>
        <View style={styles.metaInfo}>
          <Text style={styles.metaText}>{TYPE_LABELS[item.intervention_type] || item.intervention_type}</Text>
          {item.recommended_at && <Text style={styles.metaText}>{new Date(item.recommended_at).toLocaleDateString('hu-HU')}</Text>}
        </View>

        {/* Completed info */}
        {item.status === 'completed' && item.effectiveness_rating && (
          <View style={styles.completedInfo}>
            <Text style={styles.completedLabel}>Értékelés:</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Ionicons key={s} name={s <= item.effectiveness_rating ? 'star' : 'star-outline'} size={16} color={colors.warning} />
              ))}
            </View>
          </View>
        )}

        {/* Action Buttons */}
        {isActionable && (
          <View style={styles.actionRow}>
            {item.status === 'recommended' && (
              <>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item.id)} disabled={actionLoading === item.id}>
                  {actionLoading === item.id ? <ActivityIndicator size="small" color={colors.white} /> : (
                    <>
                      <Ionicons name="checkmark-outline" size={16} color={colors.white} />
                      <Text style={styles.btnText}>Elfogadás</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(item.id)}>
                  <Ionicons name="close-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.skipText}>Kihagyás</Text>
                </TouchableOpacity>
              </>
            )}
            {(item.status === 'accepted' || item.status === 'in_progress') && (
              <TouchableOpacity
                style={styles.completeBtn}
                onPress={() => { setCompleteModal(item.id); setCompleteRating(0); setCompleteNotes(''); }}
                disabled={actionLoading === item.id}
              >
                {actionLoading === item.id ? <ActivityIndicator size="small" color={colors.white} /> : (
                  <>
                    <Ionicons name="checkmark-done-outline" size={16} color={colors.white} />
                    <Text style={styles.btnText}>Befejezés</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={STATUS_FILTERS}
        keyExtractor={(i) => i.label} contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity style={[styles.chip, filter === f.value && styles.chipActive]} onPress={() => setFilter(f.value)}>
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* List */}
      <FlatList
        data={items} keyExtractor={(i) => i.id} renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : { paddingBottom: 20 }}
        ListEmptyComponent={!loading && (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>Nincs beavatkozás ebben a kategóriában.</Text>
          </View>
        )}
      />

      {/* Complete Rating Modal */}
      <Modal visible={!!completeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Beavatkozás befejezése</Text>
            <Text style={styles.modalSubtitle}>Mennyire volt hasznos ez a beavatkozás?</Text>

            <View style={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => setCompleteRating(s)} style={styles.starBtn}>
                  <Ionicons name={s <= completeRating ? 'star' : 'star-outline'} size={40} color={colors.warning} />
                  <Text style={styles.starLabel}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Megjegyzés (opcionális)</Text>
            <TextInput
              style={styles.modalInput}
              value={completeNotes}
              onChangeText={setCompleteNotes}
              placeholder="Mi volt hasznos? Mi lehetett volna jobb?"
              placeholderTextColor={colors.textLight}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCompleteModal(null)}>
                <Text style={styles.cancelText}>Mégse</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, completeSubmitting && { opacity: 0.5 }]}
                onPress={handleCompleteSubmit}
                disabled={completeSubmitting}
              >
                {completeSubmitting ? <ActivityIndicator color={colors.white} size="small" /> : (
                  <Text style={styles.submitText}>Befejezés</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.white },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 10, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  metaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  description: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  metaInfo: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  metaText: { fontSize: 12, color: colors.textLight },
  completedInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  completedLabel: { fontSize: 13, color: colors.textSecondary },
  starsRow: { flexDirection: 'row', gap: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  acceptBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  skipBtn: { flexDirection: 'row', gap: 4, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  skipText: { color: colors.textSecondary, fontWeight: '500', fontSize: 14 },
  completeBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: colors.success, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  modalSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 20 },
  ratingStars: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
  starBtn: { alignItems: 'center' },
  starLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  modalLabel: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 8 },
  modalInput: {
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, backgroundColor: colors.success, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitText: { color: colors.white, fontWeight: '600', fontSize: 15 },
});
