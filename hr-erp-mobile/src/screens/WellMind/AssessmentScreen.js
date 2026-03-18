import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import wellmindAPI from '../../services/wellmind/api';

const CATEGORY_LABELS = {
  emotional_exhaustion: 'Érzelmi kimerülés',
  depersonalization: 'Deperszonalizáció',
  personal_accomplishment: 'Személyes teljesítmény',
  vigor: 'Életerő',
  dedication: 'Elkötelezettség',
  absorption: 'Elmélyülés',
};

const QUESTIONS_PER_PAGE = 5;

export default function AssessmentScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => { loadQuestions(); }, []);

  const loadQuestions = async () => {
    try {
      setError(null);
      const response = await wellmindAPI.assessment.getQuestions();
      setQuestions(response.data || []);
    } catch {
      setError('Nem sikerült betölteni a kérdéseket.');
    } finally { setLoading(false); }
  };

  const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
  const currentQuestions = questions.slice(currentPage * QUESTIONS_PER_PAGE, (currentPage + 1) * QUESTIONS_PER_PAGE);
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === questions.length && questions.length > 0;
  const isLastPage = currentPage === totalPages - 1;

  const handleSubmit = () => {
    if (!allAnswered) {
      Alert.alert('Hiányzó válaszok', `Még ${questions.length - answeredCount} kérdés megválaszolatlan.`);
      return;
    }
    Alert.alert('Beküldés', 'Biztosan be szeretnéd küldeni a felmérést?', [
      { text: 'Mégse', style: 'cancel' },
      {
        text: 'Beküldés',
        onPress: async () => {
          setSubmitting(true);
          try {
            const responses = questions.map((q) => ({
              question_id: q.id, category: q.category, score: answers[q.id],
            }));
            const result = await wellmindAPI.assessment.submit(responses);
            Alert.alert(
              'Köszönjük! 🎉',
              'Felmérésed sikeresen rögzítve.\n+25 pont! 🎯',
              [{ text: 'Eredmények megtekintése', onPress: () => navigation.replace('AssessmentResults', { result: result.data }) }],
            );
          } catch (err) {
            Alert.alert('Hiba', err.response?.data?.message || 'Nem sikerült beküldeni.');
          } finally { setSubmitting(false); }
        },
      },
    ]);
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadQuestions}>
          <Text style={styles.retryText}>Újrapróbálás</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.centered}>
        <Ionicons name="clipboard-outline" size={48} color={colors.textLight} />
        <Text style={styles.errorText}>Jelenleg nincs elérhető felmérés.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progress */}
      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(answeredCount / questions.length) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>{answeredCount}/{questions.length}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={styles.pageInfo}>{currentPage + 1}. oldal / {totalPages}</Text>
        {currentQuestions.map((q, idx) => {
          const num = currentPage * QUESTIONS_PER_PAGE + idx + 1;
          return (
            <View key={q.id} style={styles.questionCard}>
              <Text style={styles.questionNum}>{num}.</Text>
              <Text style={styles.questionText}>{q.question_text}</Text>
              {q.category && (
                <Text style={styles.categoryLabel}>{CATEGORY_LABELS[q.category] || q.category}</Text>
              )}
              <View style={styles.scaleRow}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => (
                  <TouchableOpacity
                    key={score}
                    style={[styles.scaleBtn, answers[q.id] === score && styles.scaleBtnSelected]}
                    onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: score }))}
                  >
                    <Text style={[styles.scaleText, answers[q.id] === score && styles.scaleTextSelected]}>{score}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.scaleLabels}>
                <Text style={styles.scaleLabelText}>Egyáltalán nem</Text>
                <Text style={styles.scaleLabelText}>Teljes mértékben</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navBtn, currentPage === 0 && styles.navBtnDisabled]}
          onPress={() => setCurrentPage((p) => p - 1)}
          disabled={currentPage === 0}
        >
          <Ionicons name="chevron-back" size={20} color={currentPage === 0 ? colors.textLight : colors.primary} />
          <Text style={[styles.navBtnText, currentPage === 0 && { color: colors.textLight }]}>Előző</Text>
        </TouchableOpacity>
        {isLastPage ? (
          <TouchableOpacity
            style={[styles.submitBtn, (!allAnswered || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            {submitting ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.submitText}>Beküldés</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.navBtn} onPress={() => setCurrentPage((p) => p + 1)}>
            <Text style={styles.navBtnText}>Következő</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 14, color: colors.textSecondary, marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryText: { color: colors.white, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  progressText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  scroll: { flex: 1 },
  pageInfo: { fontSize: 13, color: colors.textLight, textAlign: 'center', marginBottom: 8 },
  questionCard: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  questionNum: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  questionText: { fontSize: 15, fontWeight: '500', color: colors.text, lineHeight: 22 },
  categoryLabel: { fontSize: 12, color: colors.textLight, marginTop: 4, fontStyle: 'italic' },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  scaleBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  scaleBtnSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  scaleText: { fontSize: 12, fontWeight: '600', color: colors.text },
  scaleTextSelected: { color: colors.white },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  scaleLabelText: { fontSize: 10, color: colors.textLight },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12 },
  navBtnDisabled: { opacity: 0.4 },
  navBtnText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.primary, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: colors.white, fontSize: 15, fontWeight: '600' },
});
