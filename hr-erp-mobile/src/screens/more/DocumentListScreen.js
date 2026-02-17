import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { documentsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import DocumentCard from '../../components/DocumentCard';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

const typeFilters = [
  { label: 'Mind', value: null },
  { label: 'Szerződés', value: 'contract' },
  { label: 'Bizonyítvány', value: 'certificate' },
  { label: 'Igazolvány', value: 'id_card' },
  { label: 'Orvosi', value: 'medical' },
  { label: 'Engedély', value: 'permit' },
  { label: 'Szabályzat', value: 'policy' },
  { label: 'Sablon', value: 'template' },
  { label: 'Egyéb', value: 'other' },
];

export default function DocumentListScreen({ navigation }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchDocuments = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      try {
        setError(null);
        const params = { page: pageNum, limit: 20 };
        if (search) params.search = search;
        if (typeFilter) params.document_type = typeFilter;

        const response = await documentsAPI.getAll(params);
        const newItems = response.data.documents;

        if (pageNum === 1 || isRefresh) {
          setDocuments(newItems);
        } else {
          setDocuments((prev) => [...prev, ...newItems]);
        }

        setHasMore(pageNum < response.data.pagination.totalPages);
        setPage(pageNum);
      } catch {
        setError('Nem sikerült betölteni a dokumentumokat');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search, typeFilter]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchDocuments(1);
  }, [fetchDocuments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDocuments(1, true);
  }, [fetchDocuments]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      fetchDocuments(page + 1);
    }
  }, [loadingMore, hasMore, page, fetchDocuments]);

  if (loading) return <LoadingScreen />;
  if (error && documents.length === 0)
    return <ErrorState message={error} onRetry={() => fetchDocuments(1)} />;

  return (
    <View style={styles.container}>
      <SearchBar placeholder="Dokumentum keresése..." onSearch={setSearch} />
      <FilterChips options={typeFilters} selected={typeFilter} onSelect={setTypeFilter} />
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DocumentCard
            document={item}
            onPress={() => navigation.navigate('DocumentDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="document-text-outline" message="Nincs találat" />}
        contentContainerStyle={documents.length === 0 && styles.emptyContainer}
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
