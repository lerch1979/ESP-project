import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ticketsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import TicketCard from '../../components/TicketCard';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

const statusFilters = [
  { label: 'Mind', value: null },
  { label: 'Új', value: 'new' },
  { label: 'Folyamatban', value: 'in_progress' },
  { label: 'Várakozik', value: 'waiting' },
  { label: 'Anyagra vár', value: 'waiting_material' },
  { label: 'Lezárva', value: 'completed' },
];

export default function TicketListScreen({ navigation }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTickets = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      try {
        setError(null);
        const params = { page: pageNum, limit: 20 };
        if (search) params.search = search;
        if (statusFilter) params.status = statusFilter;

        const response = await ticketsAPI.getAll(params);
        const newTickets = response.data.tickets;

        if (pageNum === 1 || isRefresh) {
          setTickets(newTickets);
        } else {
          setTickets((prev) => [...prev, ...newTickets]);
        }

        setHasMore(pageNum < response.data.pagination.totalPages);
        setPage(pageNum);
      } catch {
        setError('Nem sikerült betölteni a hibajegyeket');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, statusFilter]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchTickets(1);
  }, [fetchTickets]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTickets(1, true);
  }, [fetchTickets]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      fetchTickets(page + 1);
    }
  }, [loadingMore, hasMore, page, fetchTickets]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('CreateTicket')}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="add-circle-outline" size={26} color={colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  if (loading) return <LoadingScreen />;
  if (error && tickets.length === 0) return <ErrorState message={error} onRetry={() => fetchTickets(1)} />;

  return (
    <View style={styles.container}>
      <SearchBar placeholder="Hibajegy keresése..." onSearch={setSearch} />
      <FilterChips options={statusFilters} selected={statusFilter} onSelect={setStatusFilter} />
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TicketCard
            ticket={item}
            onPress={() => navigation.navigate('TicketDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="ticket-outline" message="Nincs találat" />}
        contentContainerStyle={tickets.length === 0 && styles.emptyContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
  },
});
