import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ticketsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

export default function TicketDetailScreen({ route }) {
  const { id } = route.params;
  const [ticket, setTicket] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTicket = useCallback(async () => {
    try {
      setError(null);
      const [ticketRes, statusRes] = await Promise.all([
        ticketsAPI.getById(id),
        ticketsAPI.getStatuses(),
      ]);
      setTicket(ticketRes.data.ticket);
      setStatuses(statusRes.data.statuses || []);
    } catch {
      setError('Nem sikerült betölteni a hibajegyet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  const handleStatusChange = async (statusId, statusName) => {
    Alert.alert(
      'Státusz módosítása',
      `Biztosan módosítja a státuszt: "${statusName}"?`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Módosítás',
          onPress: async () => {
            try {
              await ticketsAPI.updateStatus(id, { status_id: statusId });
              fetchTicket();
            } catch {
              Alert.alert('Hiba', 'Nem sikerült módosítani a státuszt');
            }
          },
        },
      ]
    );
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await ticketsAPI.addComment(id, { comment: comment.trim() });
      setComment('');
      fetchTicket();
    } catch {
      Alert.alert('Hiba', 'Nem sikerült hozzáadni a megjegyzést');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchTicket} />;
  if (!ticket) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchTicket(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
            <StatusBadge
              label={ticket.status_name}
              slug={ticket.status_slug}
              color={ticket.status_color}
            />
          </View>
          <Text style={styles.title}>{ticket.title}</Text>
          {ticket.description && (
            <Text style={styles.description}>{ticket.description}</Text>
          )}
          <View style={styles.metaGrid}>
            <MetaItem label="Kategória" value={ticket.category_name} />
            <MetaItem label="Prioritás" value={ticket.priority_name} />
            <MetaItem label="Létrehozta" value={ticket.created_by_name} />
            <MetaItem label="Hozzárendelve" value={ticket.assigned_to_name || '-'} />
            <MetaItem label="Létrehozva" value={formatDate(ticket.created_at)} />
            {ticket.due_date && <MetaItem label="Határidő" value={formatDate(ticket.due_date)} />}
          </View>
        </View>

        {/* Status Change */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Státusz módosítása</Text>
          <View style={styles.statusButtons}>
            {statuses.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.statusButton,
                  ticket.status_slug === s.slug && styles.statusButtonActive,
                ]}
                onPress={() => handleStatusChange(s.id, s.name)}
                disabled={ticket.status_slug === s.slug}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    ticket.status_slug === s.slug && styles.statusButtonTextActive,
                  ]}
                >
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Comments */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Megjegyzések ({ticket.comments?.length || 0})
          </Text>
          {ticket.comments?.length > 0 ? (
            ticket.comments.map((c) => (
              <View key={c.id} style={styles.commentItem}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>{c.author_name}</Text>
                  <Text style={styles.commentDate}>{formatDate(c.created_at)}</Text>
                </View>
                <Text style={styles.commentText}>{c.comment}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Még nincs megjegyzés</Text>
          )}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Add Comment */}
      <View style={styles.commentInputContainer}>
        <TextInput
          style={styles.commentInput}
          value={comment}
          onChangeText={setComment}
          placeholder="Megjegyzés hozzáadása..."
          placeholderTextColor={colors.textLight}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !comment.trim() && styles.sendButtonDisabled]}
          onPress={handleAddComment}
          disabled={!comment.trim() || submitting}
        >
          <Ionicons name="send" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function MetaItem({ label, value }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaItem: {
    width: '50%',
    marginTop: 8,
  },
  metaLabel: {
    fontSize: 12,
    color: colors.textLight,
  },
  metaValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  statusButtonTextActive: {
    color: colors.white,
  },
  commentItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 10,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  commentDate: {
    fontSize: 12,
    color: colors.textLight,
  },
  commentText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textLight,
    textAlign: 'center',
    padding: 12,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  commentInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
