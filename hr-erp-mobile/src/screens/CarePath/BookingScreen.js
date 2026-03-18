import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';

const BOOKING_TYPES = [
  { value: 'in_person', label: 'Személyes', icon: 'person-outline' },
  { value: 'video', label: 'Videó', icon: 'videocam-outline' },
  { value: 'phone', label: 'Telefon', icon: 'call-outline' },
];

export default function BookingScreen({ navigation, route }) {
  const { providerId, caseId } = route.params || {};
  const [provider, setProvider] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingType, setBookingType] = useState('in_person');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [provRes, availRes] = await Promise.all([
          carepathAPI.providers.getById(providerId),
          carepathAPI.providers.getAvailability(providerId).catch(() => ({ data: [] })),
        ]);
        setProvider(provRes.data);
        setSlots((availRes.data || []).filter((s) => s.available));
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
  }, [providerId]);

  const handleSubmit = async () => {
    if (!selectedSlot) { Alert.alert('Hiányzó adat', 'Válassz időpontot!'); return; }
    setSubmitting(true);
    try {
      await carepathAPI.bookings.create({
        provider_id: providerId,
        case_id: caseId || undefined,
        appointment_datetime: selectedSlot.datetime,
        booking_type: bookingType,
        employee_notes: notes.trim() || undefined,
      });
      Alert.alert('Foglalás sikeres!', `Időpont: ${formatSlot(selectedSlot)}`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Hiba', err.response?.data?.message || 'Nem sikerült foglalni.');
    } finally { setSubmitting(false); }
  };

  const formatSlot = (slot) => {
    const d = new Date(slot.datetime);
    return d.toLocaleDateString('hu-HU', { month: 'long', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  // Group slots by date
  const slotsByDate = {};
  slots.forEach((s) => {
    const dateKey = s.date || new Date(s.datetime).toISOString().split('T')[0];
    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = [];
    slotsByDate[dateKey].push(s);
  });

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Provider Info */}
      {provider && (
        <View style={styles.providerRow}>
          <Ionicons name="person-circle-outline" size={40} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.providerName}>{provider.full_name}</Text>
            {provider.credentials && <Text style={styles.providerCred}>{provider.credentials}</Text>}
          </View>
        </View>
      )}

      {/* Booking Type */}
      <Text style={styles.label}>Találkozó típusa</Text>
      <View style={styles.typeRow}>
        {BOOKING_TYPES.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.typeOption, bookingType === t.value && styles.typeOptionActive]}
            onPress={() => setBookingType(t.value)}
          >
            <Ionicons name={t.icon} size={20} color={bookingType === t.value ? '#2196F3' : colors.textSecondary} />
            <Text style={[styles.typeText, bookingType === t.value && styles.typeTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Available Slots */}
      <Text style={styles.label}>Elérhető időpontok</Text>
      {Object.keys(slotsByDate).length === 0 ? (
        <View style={styles.noSlots}>
          <Ionicons name="calendar-outline" size={32} color={colors.textLight} />
          <Text style={styles.noSlotsText}>Nincs elérhető időpont a következő 14 napban.</Text>
        </View>
      ) : (
        Object.entries(slotsByDate).slice(0, 7).map(([dateKey, daySlots]) => {
          const dateObj = new Date(dateKey + 'T00:00:00');
          return (
            <View key={dateKey} style={styles.daySection}>
              <Text style={styles.dayLabel}>
                {dateObj.toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' })}
              </Text>
              <View style={styles.slotsGrid}>
                {daySlots.map((slot, i) => {
                  const isSelected = selectedSlot?.datetime === slot.datetime;
                  const time = slot.time || new Date(slot.datetime).toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.slotChip, isSelected && styles.slotChipActive]}
                      onPress={() => setSelectedSlot(slot)}
                    >
                      <Text style={[styles.slotText, isSelected && styles.slotTextActive]}>{time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })
      )}

      {/* Notes */}
      <Text style={styles.label}>Megjegyzés (opcionális)</Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Bármilyen fontos információ..."
        placeholderTextColor={colors.textLight}
        multiline
        numberOfLines={3}
      />

      {/* Selected Summary */}
      {selectedSlot && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Kiválasztott időpont</Text>
          <Text style={styles.summaryDate}>{formatSlot(selectedSlot)}</Text>
          <Text style={styles.summaryType}>
            {BOOKING_TYPES.find((t) => t.value === bookingType)?.label || bookingType}
          </Text>
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, (!selectedSlot || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!selectedSlot || submitting}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : (
          <>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
            <Text style={styles.submitText}>Foglalás megerősítése</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  providerRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, padding: 14, borderRadius: 12, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  providerName: { fontSize: 16, fontWeight: '600', color: colors.text },
  providerCred: { fontSize: 12, color: colors.textSecondary },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 16 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeOption: {
    flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border,
  },
  typeOptionActive: { borderColor: '#2196F3', backgroundColor: '#2196F3' + '08' },
  typeText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  typeTextActive: { color: '#2196F3', fontWeight: '600' },
  noSlots: { alignItems: 'center', paddingVertical: 24 },
  noSlotsText: { fontSize: 13, color: colors.textSecondary, marginTop: 8, textAlign: 'center' },
  daySection: { marginBottom: 16 },
  dayLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, textTransform: 'capitalize' },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  slotChipActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  slotText: { fontSize: 14, fontWeight: '500', color: colors.text },
  slotTextActive: { color: colors.white },
  notesInput: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top',
  },
  summaryCard: {
    backgroundColor: '#2196F3' + '10', padding: 16, borderRadius: 12, marginTop: 16,
    borderWidth: 1, borderColor: '#2196F3' + '30',
  },
  summaryTitle: { fontSize: 12, fontWeight: '600', color: '#2196F3' },
  summaryDate: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 4 },
  summaryType: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  submitBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: '#2196F3', padding: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
