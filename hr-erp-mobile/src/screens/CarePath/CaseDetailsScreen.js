import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';
import CaseStatusBadge from '../../components/CarePath/CaseStatusBadge';
import UrgencyBadge from '../../components/CarePath/UrgencyBadge';
import SessionNoteCard from '../../components/CarePath/SessionNoteCard';

export default function CaseDetailsScreen({ navigation, route }) {
  const { caseId } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closeModal, setCloseModal] = useState(false);
  const [closeRating, setCloseRating] = useState(0);
  const [closeNotes, setCloseNotes] = useState('');
  const [closing, setClosing] = useState(false);

  const fetchCase = async () => {
    try {
      setError(null);
      const response = await carepathAPI.cases.getById(caseId);
      setData(response.data);
    } catch { setError('Nem sikerült betölteni az ügy adatait.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchCase(); }, [caseId]);

  const handleClose = async () => {
    setClosing(true);
    try {
      await carepathAPI.cases.close(caseId, {
        resolution_notes: closeNotes.trim() || undefined,
        employee_satisfaction_rating: closeRating || undefined,
      });
      setCloseModal(false);
      Alert.alert('Ügy lezárva', 'Az ügy sikeresen lezárva.', [
        { text: 'OK', onPress: () => { fetchCase(); } },
      ]);
    } catch { Alert.alert('Hiba', 'Nem sikerült lezárni az ügyet.'); }
    finally { setClosing(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={fetchCase}><Text style={styles.retryText}>Újrapróbálás</Text></TouchableOpacity>
      </View>
    );
  }
  if (!data) return null;

  const c = data.case || data;
  const sessions = data.sessions || c.sessions || [];
  const bookings = data.bookings || c.bookings || [];
  const isOpen = ['open', 'assigned', 'in_progress'].includes(c.status);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Text style={styles.caseNumber}>{c.case_number}</Text>
          {c.is_anonymous && <View style={styles.anonBadge}><Ionicons name="eye-off-outline" size={14} color={colors.textLight} /><Text style={styles.anonText}>Anonim</Text></View>}
        </View>
        <View style={styles.badgeRow}>
          <CaseStatusBadge status={c.status} size="large" />
          <UrgencyBadge level={c.urgency_level} />
        </View>
        <Text style={styles.categoryName}>{c.category_name || 'Általános'}</Text>
        <Text style={styles.dateInfo}>
          Megnyitva: {new Date(c.opened_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
      </View>

      {/* Description */}
      {c.issue_description && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Probléma leírása</Text>
          <Text style={styles.descriptionText}>{c.issue_description}</Text>
        </View>
      )}

      {/* Provider */}
      {c.provider_name && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Kijelölt szolgáltató</Text>
          <View style={styles.providerRow}>
            <Ionicons name="person-circle-outline" size={36} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.providerName}>{c.provider_name}</Text>
              {c.provider_type && <Text style={styles.providerType}>{c.provider_type}</Text>}
            </View>
          </View>
        </View>
      )}

      {/* Upcoming Bookings */}
      {bookings.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Időpontok</Text>
          {bookings.map((b) => (
            <View key={b.id} style={styles.bookingItem}>
              <Ionicons name="calendar-outline" size={18} color={colors.info} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.bookingDate}>
                  {new Date(b.appointment_datetime).toLocaleDateString('hu-HU', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.bookingMeta}>{b.booking_type} · {b.duration_minutes || 60} perc · {b.status}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Sessions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Alkalmak ({sessions.length})</Text>
        {sessions.length === 0 ? (
          <Text style={styles.emptyText}>Még nincs rögzített alkalom.</Text>
        ) : (
          sessions.map((s, i) => <SessionNoteCard key={s.id || i} session={s} />)
        )}
      </View>

      {/* Actions */}
      {isOpen && (
        <View style={styles.actionsCard}>
          <TouchableOpacity style={styles.bookBtn} onPress={() => navigation.navigate('ProviderSearch')}>
            <Ionicons name="calendar-outline" size={18} color={colors.white} />
            <Text style={styles.bookBtnText}>Időpont foglalás</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={() => { setCloseModal(true); setCloseRating(0); setCloseNotes(''); }}>
            <Ionicons name="checkmark-done-outline" size={18} color={colors.error} />
            <Text style={styles.closeBtnText}>Ügy lezárása</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 30 }} />

      {/* Close Modal */}
      <Modal visible={closeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ügy lezárása</Text>
            <Text style={styles.modalLabel}>Elégedettség</Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <TouchableOpacity key={s} onPress={() => setCloseRating(s)}>
                  <Ionicons name={s <= closeRating ? 'star' : 'star-outline'} size={36} color={colors.warning} />
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Megjegyzés (opcionális)</Text>
            <TextInput
              style={styles.modalInput} value={closeNotes} onChangeText={setCloseNotes}
              placeholder="Hogyan értékeled a kapott segítséget?" placeholderTextColor={colors.textLight}
              multiline numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCloseModal(false)}>
                <Text style={styles.modalCancelText}>Mégse</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmit, closing && { opacity: 0.5 }]} onPress={handleClose} disabled={closing}>
                {closing ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.modalSubmitText}>Lezárás</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryText: { color: colors.white, fontWeight: '600' },
  headerCard: {
    backgroundColor: colors.white, margin: 16, padding: 20, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caseNumber: { fontSize: 20, fontWeight: '700', color: colors.text },
  anonBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anonText: { fontSize: 11, color: colors.textLight },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  categoryName: { fontSize: 14, color: colors.textSecondary, marginTop: 8 },
  dateInfo: { fontSize: 12, color: colors.textLight, marginTop: 4 },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 10 },
  descriptionText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  providerRow: { flexDirection: 'row', alignItems: 'center' },
  providerName: { fontSize: 15, fontWeight: '600', color: colors.text },
  providerType: { fontSize: 12, color: colors.textSecondary },
  bookingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  bookingDate: { fontSize: 14, fontWeight: '500', color: colors.text },
  bookingMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 16 },
  actionsCard: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 12 },
  bookBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: '#2196F3', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bookBtnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  closeBtn: { flexDirection: 'row', gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.error + '40', alignItems: 'center' },
  closeBtnText: { color: colors.error, fontWeight: '500', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 8 },
  starsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 20 },
  modalInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
  modalSubmit: { flex: 1, backgroundColor: colors.error, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalSubmitText: { color: colors.white, fontWeight: '600', fontSize: 15 },
});
