import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ticketsAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

// All staff messages are shown as a single counterparty (residents deal with
// one entity, not individual staff). Brand name — intentionally untranslated.
const STAFF_LABEL = 'Housing Solutions';
const POLL_MS = 12000; // live-ish refresh while the chat is open

function fmtTime(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

// One chat bubble. Shows the reader's-language text by default; if it was
// translated, a small "eredeti" toggle reveals the original.
function MessageBubble({ item, mine, t }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const text = showOriginal ? (item.original_text || item.message) : (item.display_text || item.message);
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowStaff]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleStaff]}>
        <Text style={[styles.sender, mine ? styles.senderMine : styles.senderStaff]}>
          {mine ? t('chat.me') : STAFF_LABEL}
        </Text>
        <Text style={[styles.msg, mine && styles.msgMine]}>{text}</Text>
        <View style={styles.metaRow}>
          <Text style={[styles.time, mine && styles.timeMine]}>{fmtTime(item.created_at)}</Text>
          {item.is_translated ? (
            <TouchableOpacity onPress={() => setShowOriginal((v) => !v)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={[styles.origLink, mine && styles.origLinkMine]}>
                {showOriginal ? t('chat.showTranslation') : t('chat.original')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {item.translation_unavailable ? (
            <Text style={[styles.unavail, mine && styles.timeMine]}>· {t('chat.translationUnavailable')}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// Read-only ticket header + chat thread (resident's OWN ticket only, via /my).
export default function ResidentTicketDetail({ route, navigation }) {
  const { id } = route.params;
  const { t } = useTranslation();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await ticketsAPI.getMineMessages(id);
      setMessages(res.data.messages || []);
    } catch { /* keep current thread on a transient poll error */ }
  }, [id]);

  const loadAll = useCallback(async () => {
    try {
      setError(null);
      const [tRes, mRes] = await Promise.all([
        ticketsAPI.getMineById(id),
        ticketsAPI.getMineMessages(id),
      ]);
      setTicket(tRes.data.ticket);
      setMessages(mRes.data.messages || []);
    } catch {
      setError('Nem sikerült betölteni a hibajegyet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Poll ONLY while focused; stop on blur (and clean up on unmount).
  useEffect(() => {
    let timer = null;
    const start = () => { if (!timer) timer = setInterval(loadMessages, POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const subF = navigation.addListener('focus', start);
    const subB = navigation.addListener('blur', stop);
    if (navigation.isFocused && navigation.isFocused()) start();
    return () => { stop(); subF(); subB(); };
  }, [navigation, loadMessages]);

  const onSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await ticketsAPI.sendMineMessage(id, body);
      setText('');
      await loadMessages();
    } catch { /* leave text so the resident can retry */ }
    finally { setSending(false); }
  };

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={loadAll} />;

  const renderHeader = () => (
    <View style={styles.headerCard}>
      <View style={styles.headerRow}>
        <Text style={styles.ticketNumber}>{ticket?.ticket_number}</Text>
        <StatusBadge label={ticket?.status_name} slug={ticket?.status_slug} color={ticket?.status_color} />
      </View>
      <Text style={styles.title}>{ticket?.title}</Text>
      {ticket?.description ? <Text style={styles.desc}>{ticket.description}</Text> : null}
      {ticket?.category_name ? (
        <View style={styles.catChip}>
          <Text style={styles.catText}>{(ticket.category_icon || '📋') + '  ' + ticket.category_name}</Text>
        </View>
      ) : null}
    </View>
  );

  const renderItem = ({ item }) => (
    <MessageBubble item={item} mine={item.sender_id === user?.id} t={t} />
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} tintColor={colors.primary} />
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.empty}>{t('chat.empty')}</Text>}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={colors.textLight}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={!text.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Ionicons name="send" size={20} color={colors.white} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 12 },
  headerCard: {
    backgroundColor: colors.white, margin: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  ticketNumber: { fontSize: 14, fontWeight: '600', color: colors.primary },
  title: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 6 },
  desc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 10 },
  catChip: { alignSelf: 'flex-start', backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  catText: { fontSize: 13, color: colors.textSecondary },
  bubbleRow: { paddingHorizontal: 12, marginVertical: 4, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowStaff: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleStaff: { backgroundColor: colors.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  sender: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  senderMine: { color: 'rgba(255,255,255,0.85)' },
  senderStaff: { color: colors.primary },
  msg: { fontSize: 15, color: colors.text, lineHeight: 20 },
  msgMine: { color: colors.white },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 8 },
  time: { fontSize: 10, color: colors.textLight },
  timeMine: { color: 'rgba(255,255,255,0.7)' },
  origLink: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  origLinkMine: { color: 'rgba(255,255,255,0.95)', textDecorationLine: 'underline' },
  unavail: { fontSize: 10, color: colors.textLight, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: colors.textLight, padding: 24, fontSize: 14 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 10,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.background, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: colors.text, maxHeight: 110, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  sendBtnDisabled: { opacity: 0.5 },
});
