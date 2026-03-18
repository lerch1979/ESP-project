import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';
import MoodSelector, { MOOD_EMOJIS } from '../../components/WellMind/MoodSelector';
import SliderInput from '../../components/WellMind/SliderInput';

export default function DailyPulseScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [todayPulse, setTodayPulse] = useState(null);
  const [moodScore, setMoodScore] = useState(null);
  const [stressLevel, setStressLevel] = useState(null);
  const [sleepQuality, setSleepQuality] = useState(null);
  const [workloadLevel, setWorkloadLevel] = useState(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => { checkToday(); }, []);

  const checkToday = async () => {
    try {
      const response = await wellmindAPI.pulse.getToday();
      if (response.data?.submitted) {
        setAlreadySubmitted(true);
        setTodayPulse(response.data.pulse);
      }
    } catch { /* first time */ } finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!moodScore) { Alert.alert('Hiányzó adat', 'Kérjük, válassz hangulatot!'); return; }
    setSubmitting(true);
    try {
      await wellmindAPI.pulse.submit({
        mood_score: moodScore,
        stress_level: stressLevel,
        sleep_quality: sleepQuality,
        workload_level: workloadLevel,
        notes: notes.trim() || undefined,
      });
      setSubmitted(true);
      setTodayPulse({ mood_score: moodScore, stress_level: stressLevel, sleep_quality: sleepQuality, workload_level: workloadLevel });
      setAlreadySubmitted(true);
    } catch (err) {
      Alert.alert('Hiba', err.response?.data?.message || 'Nem sikerült elmenteni. Próbáld újra!');
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  // Already submitted view
  if (alreadySubmitted && todayPulse) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.submittedContainer}>
        {submitted ? (
          <>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.submittedTitle}>Köszönjük!</Text>
            <Text style={styles.successSubtitle}>Napi hangulatjelentésed rögzítve.</Text>
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsText}>+10 pont 🎯</Text>
            </View>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
            <Text style={styles.submittedTitle}>Mai felmérés kitöltve!</Text>
          </>
        )}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryEmoji}>{MOOD_EMOJIS[todayPulse.mood_score] || '😐'}</Text>
          <Text style={styles.summaryMood}>Hangulat: {todayPulse.mood_score}/5</Text>
          {todayPulse.stress_level != null && <Text style={styles.summaryDetail}>Stressz: {todayPulse.stress_level}/10</Text>}
          {todayPulse.sleep_quality != null && <Text style={styles.summaryDetail}>Alvás: {todayPulse.sleep_quality}/10</Text>}
          {todayPulse.workload_level != null && <Text style={styles.summaryDetail}>Munkaterhelés: {todayPulse.workload_level}/10</Text>}
        </View>
        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('PulseHistory')}>
          <Ionicons name="stats-chart-outline" size={20} color={colors.primary} />
          <Text style={styles.historyBtnText}>Előzmények megtekintése</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dashboardBtn} onPress={() => navigation.navigate('WellMindDashboard')}>
          <Ionicons name="grid-outline" size={20} color={colors.white} />
          <Text style={styles.dashboardBtnText}>Vissza a műszerfalhoz</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Hogy érzed magad ma?</Text>
      <Text style={styles.subtitle}>Válaszd ki a hangulatodat</Text>

      <MoodSelector value={moodScore} onChange={setMoodScore} />

      <Text style={styles.sectionTitle}>Részletek (opcionális)</Text>
      <SliderInput label="Stressz szint" value={stressLevel} onChange={setStressLevel} activeColor={colors.error} />
      <SliderInput label="Alvás minőség" value={sleepQuality} onChange={setSleepQuality} activeColor={colors.info} />
      <SliderInput label="Munkaterhelés" value={workloadLevel} onChange={setWorkloadLevel} activeColor={colors.warning} />

      <Text style={styles.notesLabel}>Megjegyzés</Text>
      <TextInput
        style={styles.notesInput}
        value={notes}
        onChangeText={setNotes}
        placeholder="Bármi, amit meg szeretnél jegyezni..."
        placeholderTextColor={colors.textLight}
        multiline
        numberOfLines={3}
      />

      <TouchableOpacity
        style={[styles.submitBtn, (!moodScore || submitting) && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!moodScore || submitting}
        activeOpacity={0.8}
      >
        {submitting ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color={colors.white} size="small" />
            <Text style={styles.submitText}>Küldés...</Text>
          </View>
        ) : (
          <Text style={styles.submitText}>Beküldés</Text>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 12, marginTop: 24 },
  notesLabel: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 6, marginTop: 4 },
  notesInput: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    padding: 14, fontSize: 14, color: colors.text, minHeight: 80, textAlignVertical: 'top',
  },
  submitBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  submittedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  successEmoji: { fontSize: 56, marginBottom: 8 },
  successSubtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: 12 },
  pointsBadge: {
    backgroundColor: '#fef3c7', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginBottom: 20,
  },
  pointsText: { fontSize: 16, fontWeight: '700', color: '#d97706' },
  submittedTitle: { fontSize: 22, fontWeight: '700', color: colors.success, marginTop: 4, marginBottom: 8 },
  summaryCard: {
    backgroundColor: colors.white, padding: 24, borderRadius: 16, alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  summaryEmoji: { fontSize: 48 },
  summaryMood: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: 8 },
  summaryDetail: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, padding: 14, backgroundColor: colors.white,
    borderRadius: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  historyBtnText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  dashboardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 14, backgroundColor: colors.primary,
    borderRadius: 10,
  },
  dashboardBtnText: { fontSize: 14, color: colors.white, fontWeight: '600' },
});
