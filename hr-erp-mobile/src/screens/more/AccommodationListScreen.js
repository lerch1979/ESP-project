import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { accommodationsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import AccommodationCard from '../../components/AccommodationCard';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

const statusFilters = [
  { label: 'Mind', value: null },
  { label: 'Szabad', value: 'available' },
  { label: 'Foglalt', value: 'occupied' },
  { label: 'Karbantartás', value: 'maintenance' },
];

export default function AccommodationListScreen({ navigation }) {
  const [accommodations, setAccommodations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchAccommodations = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      try {
        setError(null);
        const params = { page: pageNum, limit: 20 };
        if (search) params.search = search;
        if (statusFilter) params.status = statusFilter;

        const response = await accommodationsAPI.getAll(params);
        const newItems = response.data.accommodations;

        if (pageNum === 1 || isRefresh) {
          setAccommodations(newItems);
        } else {
          setAccommodations((prev) => [...prev, ...newItems]);
        }

        setHasMore(pageNum < response.data.pagination.totalPages);
        setPage(pageNum);
      } catch {
        setError('Nem sikerült betölteni a szálláshelyeket');
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
    fetchAccommodations(1);
  }, [fetchAccommodations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAccommodations(1, true);
  }, [fetchAccommodations]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      fetchAccommodations(page + 1);
    }
  }, [loadingMore, hasMore, page, fetchAccommodations]);

  if (loading) return <LoadingScreen />;
  if (error && accommodations.length === 0)
    return <ErrorState message={error} onRetry={() => fetchAccommodations(1)} />;

  return (
    <View style={styles.container}>
      <SearchBar placeholder="Szálláshely keresése..." onSearch={setSearch} />
      <FilterChips options={statusFilters} selected={statusFilter} onSelect={setStatusFilter} />
      <FlatList
        data={accommodations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AccommodationCard
            accommodation={item}
            onPress={() => navigation.navigate('AccommodationDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="home-outline" message="Nincs találat" />}
        contentContainerStyle={accommodations.length === 0 && styles.emptyContainer}
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
