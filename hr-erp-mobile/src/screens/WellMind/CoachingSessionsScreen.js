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
  { label: 'Ütemezett', value: 'scheduled' },
  { label: 'Befejezett', value: 'completed' },
  { label: 'Lemondott', value: 'cancelled' },
];
const S_ICONS = { scheduled: 'time-outline', completed: 'checkmark-circle-outline', cancelled: 'close-circle-outline', no_show: 'alert-circle-outline' };
const S_LABELS = { scheduled: 'Ütemezett', completed: 'Befejezett', cancelled: 'Lemondott', no_show: 'Nem jelent meg' };
const S_COLORS = { scheduled: colors.info, completed: colors.success, cancelled: colors.textLight, no_show: colors.error };
const TYPE_LABELS = {
  burnout_support: 'Kiégés támogatás', career_coaching: 'Karrier coaching',
  stress_management: 'Stresszkezelés', work_life_balance: 'Munka-magánélet', general: 'Általános',
};

export default function CoachingSessionsScreen() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [modal, setModal] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const response = await wellmindAPI.coaching.getAll(filter);
      setSessions(response.data || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [filter]);

  useFocusEffect(useCallback(() => { setLoading(true); fetchSessions(); }, [fetchSessions]));

  const handleFeedback = async () => {
    if (rating === 0) { Alert.alert('Hiányzó adat', 'Adj értékelést!'); return; }
    setSubmitting(true);
    try {
      await wellmindAPI.coaching.submitFeedback(modal, rating, feedback.trim() || null);
      setModal(null); setRating(0); setFeedback('');
      fetchSessions();
      Alert.alert('Köszönjük!', 'Visszajelzésed rögzítve.');
    } catch { Alert.alert('Hiba', 'Nem sikerült elküldeni.'); }
    finally { setSubmitting(false); }
  };

  const renderSession = ({ item }) => {
    const date = new Date(item.session_date);
    const canRate = item.status === 'completed' && !item.employee_rating;
    const sc = S_COLORS[item.status] || colors.textLight;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconCircle, { backgroundColor: sc + '15' }]}>
            <Ionicons name={S_ICONS[item.status] || 'help-outline'} size={22} color={sc} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coachName}>{item.coach_name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: sc + '20' }]}>
              <Text style={[styles.statusText, { color: sc }]}>{S_LABELS[item.status] || item.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.detailText}>
              {date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })}
              {' '}{date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.detailText}>{item.duration_minutes} perc</Text>
          </View>
        </View>

        <View style={styles.detailItem}>
          <Ionicons name="briefcase-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>{TYPE_LABELS[item.session_type] || item.session_type}</Text>
        </View>

        {item.topics_discussed?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Témák:</Text>
            <View style={styles.chipsRow}>
              {item.topics_discussed.map((t, i) => (
                <View key={i} style={styles.topicChip}><Text style={styles.topicText}>{t}</Text></View>
              ))}
            </View>
          </View>
        )}

        {item.action_items?.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={styles.sectionLabel}>Teendők:</Text>
            {item.action_items.map((a, i) => (
              <View key={i} style={styles.actionItemRow}>
                <Ionicons name="checkbox-outline" size={14} color={colors.primary} />
                <Text style={styles.actionItemText}>{a}</Text>
              </View>
            ))}
          </View>
        )}

        {item.employee_rating != null && (
          <View style={styles.ratingRow}>
            <Text style={styles.ratingLabel}>Értékelésed:</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Ionicons key={s} name={s <= item.employee_rating ? 'star' : 'star-outline'} size={18} color={colors.warning} />
              ))}
            </View>
          </View>
        )}

        {item.next_session_date && (
          <View style={styles.nextRow}>
            <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.info} />
            <Text style={styles.nextText}>
              Következő: {new Date(item.next_session_date).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
        )}

        {/* Action Buttons based on status */}
        <View style={styles.actionsSection}>
          {/* Scheduled: Cancel button */}
          {item.status === 'scheduled' && (
            <View style={styles.actionsRow}>
              <View style={styles.scheduledInfo}>
                <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                <Text style={styles.scheduledInfoText}>
                  {new Date(item.session_date) > new Date() ? 'Az alkalom közeleg' : 'Alkalom folyamatban'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.cancelSessionBtn}
                onPress={() => Alert.alert(
                  'Lemondás',
                  'Biztosan le szeretnéd mondani ezt az alkalmat?',
                  [
                    { text: 'Mégsem', style: 'cancel' },
                    { text: 'Lemondás', style: 'destructive', onPress: () => Alert.alert('Értesítés', 'A lemondás funkció hamarosan elérhető.') },
                  ]
                )}
              >
                <Ionicons name="close-circle-outline" size={16} color={colors.error} />
                <Text style={styles.cancelSessionText}>Lemondás</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Completed without rating: Rate button */}
          {canRate && (
            <TouchableOpacity style={styles.rateBtn} onPress={() => { setModal(item.id); setRating(0); setFeedback(''); }}>
              <Ionicons name="star-outline" size={18} color={colors.white} />
              <Text style={styles.rateBtnText}>Visszajelzés küldése</Text>
            </TouchableOpacity>
          )}

          {/* Completed with rating: show read-only feedback */}
          {item.status === 'completed' && item.employee_feedback && (
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>Visszajelzésed:</Text>
              <Text style={styles.feedbackText}>{item.employee_feedback}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        horizontal showsHorizontalScrollIndicator={false} data={STATUS_FILTERS}
        keyExtractor={(i) => i.label} contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => (
          <TouchableOpacity style={[styles.chip, filter === f.value && styles.chipActive]} onPress={() => setFilter(f.value)}>
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        )}
      />
      <FlatList
        data={sessions} keyExtractor={(i) => i.id} renderItem={renderSession}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchSessions} tintColor={colors.primary} />}
        contentContainerStyle={sessions.length === 0 ? styles.emptyWrap : { paddingBottom: 20 }}
        ListEmptyComponent={!loading && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>Nincs coaching alkalom.</Text>
          </View>
        )}
      />

      {/* Feedback Modal */}
      <Modal visible={!!modal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Coaching értékelés</Text>
            <Text style={styles.modalLabel}>Értékelés</Text>
            <View style={styles.starsInput}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => setRating(s)}>
                  <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={36} color={colors.warning} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Visszajelzés (opcionális)</Text>
            <TextInput
              style={styles.feedbackInput} value={feedback} onChangeText={setFeedback}
              placeholder="Mi tetszett? Mit lehetne javítani?" placeholderTextColor={colors.textLight}
              multiline numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(null)}>
                <Text style={styles.cancelText}>Mégse</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.5 }]} onPress={handleFeedback} disabled={submitting}>
                {submitting ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.submitText}>Küldés</Text>}
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  coachName: { fontSize: 16, fontWeight: '600', color: colors.text },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  detailsRow: { flexDirection: 'row', gap: 16, marginBottom: 6 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  detailText: { fontSize: 13, color: colors.textSecondary },
  section: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  topicChip: { backgroundColor: colors.primary + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  topicText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  actionItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 4 },
  actionItemText: { fontSize: 13, color: colors.text, flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  ratingLabel: { fontSize: 13, color: colors.textSecondary },
  starsRow: { flexDirection: 'row', gap: 2 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  nextText: { fontSize: 13, color: colors.info, fontWeight: '500' },
  actionsSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scheduledInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  scheduledInfoText: { fontSize: 13, color: colors.info, fontWeight: '500' },
  cancelSessionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.error + '40' },
  cancelSessionText: { fontSize: 13, color: colors.error, fontWeight: '500' },
  rateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8 },
  rateBtnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  feedbackBox: { backgroundColor: colors.background, padding: 12, borderRadius: 8, marginTop: 8 },
  feedbackLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  feedbackText: { fontSize: 13, color: colors.text, fontStyle: 'italic' },
  emptyWrap: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 8 },
  starsInput: { flexDirection: 'row', gap: 8, marginBottom: 20, justifyContent: 'center' },
  feedbackInput: {
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
  submitBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitText: { color: colors.white, fontWeight: '600', fontSize: 15 },
});
