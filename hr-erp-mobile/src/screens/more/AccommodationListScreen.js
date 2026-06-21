import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { accommodationsAPI } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { isResident } from '../../utils/roles';
import { colors } from '../../constants/colors';
import AccommodationCard from '../../components/AccommodationCard';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

const statusFilters = [
  { labelKey: 'common.all', value: null },
  { labelKey: 'accStatus.available', value: 'available' },
  { labelKey: 'accStatus.occupied', value: 'occupied' },
  { labelKey: 'accStatus.maintenance', value: 'maintenance' },
];

export default function AccommodationListScreen({ navigation }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const resident = isResident(user);
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
        // Residents see ONLY their own room (self-scoped /accommodations/my,
        // a single object); staff get the full paginated list as before.
        if (resident) {
          const response = await accommodationsAPI.getMine();
          setAccommodations(response.data.accommodation ? [response.data.accommodation] : []);
          setHasMore(false);
          setPage(1);
          return;
        }

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
        setError(resident ? t('roomView.loadError') : t('common.errorOccurred'));
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, statusFilter, resident]
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
      {!resident && (
        <>
          <SearchBar placeholder={t('accommodation.search')} onSearch={setSearch} />
          <FilterChips options={statusFilters.map((s) => ({ label: t(s.labelKey), value: s.value }))} selected={statusFilter} onSelect={setStatusFilter} />
        </>
      )}
      <FlatList
        data={accommodations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AccommodationCard
            accommodation={item}
            onPress={resident ? undefined : () => navigation.navigate('AccommodationDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="home-outline" message={resident ? t('roomView.empty') : t('common.noResults')} />}
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
