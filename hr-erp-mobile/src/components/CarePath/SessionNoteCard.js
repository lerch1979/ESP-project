import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

const TYPE_LABELS = {
  individual_counseling: 'Egyéni tanácsadás',
  couples_therapy: 'Párterápia',
  legal_consultation: 'Jogi konzultáció',
  financial_advice: 'Pénzügyi tanácsadás',
  crisis_intervention: 'Krízisintervenció',
  group_session: 'Csoportfoglalkozás',
  follow_up: 'Kontroll',
};

export default function SessionNoteCard({ session, showNotes = false }) {
  const date = new Date(session.session_date);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>#{session.session_number || '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>
            {date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' })}
          </Text>
          <Text style={styles.type}>
            {TYPE_LABELS[session.session_type] || session.session_type}
            {session.duration_minutes ? ` · ${session.duration_minutes} perc` : ''}
          </Text>
        </View>
        {session.progress_rating && (
          <View style={styles.progressBadge}>
            <Ionicons name="trending-up-outline" size={14} color={colors.success} />
            <Text style={styles.progressText}>{session.progress_rating}/10</Text>
          </View>
        )}
      </View>

      {session.topics_covered?.length > 0 && (
        <View style={styles.topicsRow}>
          {session.topics_covered.map((t, i) => (
            <View key={i} style={styles.topicChip}>
              <Text style={styles.topicText}>{t}</Text>
            </View>
          ))}
        </View>
      )}

      {showNotes && !session.session_notes_encrypted && session.session_notes && (
        <Text style={styles.notes}>{session.session_notes}</Text>
      )}
      {showNotes && session.session_notes_encrypted && (
        <View style={styles.encryptedRow}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textLight} />
          <Text style={styles.encryptedText}>Titkosított feljegyzés</Text>
        </View>
      )}

      {session.homework_assigned && (
        <View style={styles.homeworkRow}>
          <Ionicons name="document-text-outline" size={14} color={colors.primary} />
          <Text style={styles.homeworkText}>{session.homework_assigned}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numberBadge: { backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  numberText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  date: { fontSize: 14, fontWeight: '500', color: colors.text },
  type: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  progressBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.successLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  progressText: { fontSize: 12, fontWeight: '600', color: colors.success },
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  topicChip: { backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  topicText: { fontSize: 11, color: colors.textSecondary },
  notes: { fontSize: 13, color: colors.text, marginTop: 8, lineHeight: 19 },
  encryptedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  encryptedText: { fontSize: 12, color: colors.textLight, fontStyle: 'italic' },
  homeworkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  homeworkText: { fontSize: 13, color: colors.primary, flex: 1 },
});
