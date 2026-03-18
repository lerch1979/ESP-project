import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../constants/colors';
import SliderInput from '../../components/WellMind/SliderInput';
import api from '../../services/api';
import { num } from '../../components/WellMind/helpers';

export default function HousingFeedbackScreen() {
  const [room, setRoom] = useState(null);
  const [common, setCommon] = useState(null);
  const [bathroom, setBathroom] = useState(null);
  const [kitchen, setKitchen] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await api.get('/housing/inspections/my', { params: { days: 90 } });
      setHistory(response.data?.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); fetchHistory(); }, [fetchHistory]));

  const overall = (room && common && bathroom && kitchen)
    ? ((room + common + bathroom + kitchen) / 4).toFixed(1)
    : null;

  const overallColor = overall >= 8 ? colors.success : overall >= 5 ? colors.warning : overall ? colors.error : colors.textLight;

  const handleSubmit = async () => {
    if (!room || !common || !bathroom || !kitchen) {
      Alert.alert('Hiányzó adat', 'Kérjük, értékelj minden területet!');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/housing/inspections/self-report', {
        room_cleanliness_score: room,
        common_area_score: common,
        bathroom_score: bathroom,
        kitchen_score: kitchen,
        inspector_notes: notes.trim() || undefined,
      });
      Alert.alert('Sikeres!', 'Visszajelzés rögzítve.');
      setRoom(null); setCommon(null); setBathroom(null); setKitchen(null); setNotes('');
      fetchHistory();
    } catch (err) {
      Alert.alert('Hiba', err.response?.data?.message || 'Nem sikerült elmenteni.');
    } finally { setSubmitting(false); }
  };

  return (
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchHistory} tintColor={colors.primary} />}
    >
      <Text style={styles.title}>Szállás visszajelzés</Text>
      <Text style={styles.subtitle}>Értékeld a lakóhelyed tisztaságát</Text>

      {/* Overall Score */}
      <View style={styles.overallCard}>
        <Text style={[styles.overallScore, { color: overallColor }]}>{overall || '–'}</Text>
        <Text style={styles.overallLabel}>Átlag pontszám</Text>
      </View>

      {/* Sliders */}
      <View style={styles.card}>
        <SliderInput label="Szoba tisztaság" value={room} onChange={setRoom} activeColor={colors.primary} />
        <SliderInput label="Közös helyiségek" value={common} onChange={setCommon} activeColor={colors.info} />
        <SliderInput label="Fürdőszoba" value={bathroom} onChange={setBathroom} activeColor="#00BCD4" />
        <SliderInput label="Konyha" value={kitchen} onChange={setKitchen} activeColor={colors.warning} />
      </View>

      {/* Notes */}
      <Text style={styles.label}>Megjegyzés (opcionális)</Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Van valami probléma vagy javaslat?"
        placeholderTextColor={colors.textLight}
        multiline
        numberOfLines={3}
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submitBtn, (!room || !common || !bathroom || !kitchen || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!room || !common || !bathroom || !kitchen || submitting}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : (
          <>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
            <Text style={styles.submitText}>Beküldés</Text>
          </>
        )}
      </TouchableOpacity>

      {/* History */}
      {history.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Korábbi visszajelzések</Text>
          {history.slice(0, 10).map((item, idx) => {
            const score = num(item.overall_score);
            const sc = score >= 8 ? colors.success : score >= 5 ? colors.warning : colors.error;
            return (
              <View key={item.id || idx} style={[styles.historyItem, idx < history.length - 1 && styles.historyBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyDate}>
                    {new Date(item.inspection_date).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </Text>
                  <Text style={styles.historyScores}>
                    Szoba: {item.room_cleanliness_score} · Közös: {item.common_area_score} · Fürdő: {item.bathroom_score} · Konyha: {item.kitchen_score}
                  </Text>
                </View>
                <Text style={[styles.historyOverall, { color: sc }]}>{score.toFixed(1)}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  overallCard: {
    backgroundColor: colors.white, padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  overallScore: { fontSize: 48, fontWeight: '800' },
  overallLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: colors.white, padding: 16, borderRadius: 12, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 6 },
  notesInput: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top', marginBottom: 12,
  },
  submitBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: colors.primary, padding: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  historyItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  historyDate: { fontSize: 14, fontWeight: '500', color: colors.text },
  historyScores: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  historyOverall: { fontSize: 20, fontWeight: '700', marginLeft: 12 },
});
