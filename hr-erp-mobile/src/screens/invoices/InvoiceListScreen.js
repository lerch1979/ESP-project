import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { invoiceAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import InvoiceCard from '../../components/InvoiceCard';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

const statusFilters = [
  { value: 'draft', label: 'Piszkozat' },
  { value: 'sent', label: 'Elküldve' },
  { value: 'paid', label: 'Kifizetve' },
  { value: 'overdue', label: 'Lejárt' },
];

export default function InvoiceListScreen({ navigation }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const isFirstLoad = useRef(true);

  const fetchInvoices = useCallback(async (pageNum = 1, append = false) => {
    try {
      setError(null);
      const params = { page: pageNum, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.payment_status = statusFilter;
      const response = await invoiceAPI.getAll(params);
      const data = response.data?.invoices || [];
      const pagination = response.data?.pagination;

      if (append) {
        setInvoices((prev) => [...prev, ...data]);
      } else {
        setInvoices(data);
      }

      setHasMore(pagination ? pageNum < pagination.totalPages : false);
      setPage(pageNum);
    } catch (err) {
      setError('Nem sikerült betölteni a számlákat');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      isFirstLoad.current = false;
    }
  }, [search, statusFilter]);

  useEffect(() => {
    if (isFirstLoad.current) {
      fetchInvoices(1);
    } else {
      setLoading(true);
      fetchInvoices(1);
    }
  }, [fetchInvoices]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInvoices(1);
  }, [fetchInvoices]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      setLoadingMore(true);
      fetchInvoices(page + 1, true);
    }
  }, [loadingMore, hasMore, loading, page, fetchInvoices]);

  if (loading && isFirstLoad.current) return <LoadingScreen />;
  if (error && invoices.length === 0) return <ErrorState message={error} onRetry={() => fetchInvoices(1)} />;

  return (
    <View style={styles.container}>
      <SearchBar
        onSearch={setSearch}
        placeholder="Számla keresése..."
      />
      <FilterChips
        options={statusFilters}
        selected={statusFilter}
        onSelect={setStatusFilter}
      />
      <FlatList
        data={invoices}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <InvoiceCard
            invoice={item}
            onPress={() => navigation.navigate('InvoiceDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={invoices.length === 0 && styles.emptyContainer}
        ListEmptyComponent={<EmptyState icon="receipt-outline" message="Nincs számla" />}
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
