import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, FlatList, RefreshControl, StyleSheet, TouchableOpacity, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

const sortOptions = [
  { value: 'date_desc', label: 'Dátum (újabb elöl)', sort_by: 'invoice_date', sort_order: 'DESC' },
  { value: 'date_asc', label: 'Dátum (régebbi elöl)', sort_by: 'invoice_date', sort_order: 'ASC' },
  { value: 'amount_desc', label: 'Összeg (csökkenő)', sort_by: 'total_amount', sort_order: 'DESC' },
  { value: 'amount_asc', label: 'Összeg (növekvő)', sort_by: 'total_amount', sort_order: 'ASC' },
  { value: 'status', label: 'Státusz szerint', sort_by: 'payment_status', sort_order: 'ASC' },
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
  const [sortKey, setSortKey] = useState('date_desc');
  const [showSortModal, setShowSortModal] = useState(false);
  const isFirstLoad = useRef(true);

  const fetchInvoices = useCallback(async (pageNum = 1, append = false) => {
    try {
      setError(null);
      const params = { page: pageNum, limit: 20 };
      if (search) params.search = search;
      if (statusFilter) params.payment_status = statusFilter;
      const sortOption = sortOptions.find((s) => s.value === sortKey);
      if (sortOption) {
        params.sort_by = sortOption.sort_by;
        params.sort_order = sortOption.sort_order;
      }
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
  }, [search, statusFilter, sortKey]);

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
      <View style={styles.filterRow}>
        <View style={styles.filterChipsContainer}>
          <FilterChips
            options={statusFilters}
            selected={statusFilter}
            onSelect={setStatusFilter}
          />
        </View>
        <TouchableOpacity style={styles.sortButton} onPress={() => setShowSortModal(true)}>
          <Ionicons name="swap-vertical" size={18} color={colors.primary} />
          <Text style={styles.sortButtonText}>Rendezés</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSortModal(false)}>
          <View style={styles.sortModal}>
            <Text style={styles.sortModalTitle}>Rendezés</Text>
            {sortOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.sortOption, sortKey === opt.value && styles.sortOptionActive]}
                onPress={() => { setSortKey(opt.value); setShowSortModal(false); }}
              >
                <Text style={[styles.sortOptionText, sortKey === opt.value && styles.sortOptionTextActive]}>
                  {opt.label}
                </Text>
                {sortKey === opt.value && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  filterChipsContainer: {
    flex: 1,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.primary + '15',
    gap: 4,
  },
  sortButtonText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    maxWidth: 320,
  },
  sortModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  sortOptionActive: {
    backgroundColor: colors.primary + '10',
  },
  sortOptionText: {
    fontSize: 14,
    color: colors.text,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});
