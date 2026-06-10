import React, { useState, useEffect, useCallback } from 'react';
import { SectionList, Text, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ticketsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import ResidentTicketRow from '../../components/ResidentTicketRow';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

// Resident ticket view: chronological, newest-first, split into OPEN (prominent,
// top) and CLOSED (dimmed, below). Read-only — tapping opens the detail screen.
export default function ResidentTicketList({ navigation }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState([]);
  const [closed, setClosed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await ticketsAPI.getMine();
      const tickets = res.data.tickets || [];
      setOpen(tickets.filter((t) => !t.is_final));
      setClosed(tickets.filter((t) => t.is_final));
    } catch {
      setError(t('ticketList.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on focus so a freshly-created ticket shows up immediately.
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    load();
    return unsub;
  }, [navigation, load]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('CreateTicket')} style={{ marginRight: 12 }}>
          <Ionicons name="add-circle-outline" size={26} color={colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const sections = [{ title: t('ticketList.open', { count: open.length }), data: open, dimmed: false }];
  if (closed.length > 0) sections.push({ title: t('ticketList.closed', { count: closed.length }), data: closed, dimmed: true });
  const total = open.length + closed.length;

  return (
    <SectionList
      style={styles.container}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item, section }) => (
        <ResidentTicketRow
          ticket={item}
          dimmed={section.dimmed}
          onPress={() => navigation.navigate('TicketDetail', { id: item.id })}
        />
      )}
      renderSectionHeader={({ section }) =>
        section.data.length > 0 ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
      }
      ListEmptyComponent={<EmptyState icon="ticket-outline" message={t('ticketList.empty')} />}
      contentContainerStyle={total === 0 && styles.emptyContainer}
      stickySectionHeadersEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 6,
  },
  emptyContainer: { flex: 1 },
});
