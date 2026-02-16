import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { employeesAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import EmployeeCard from '../../components/EmployeeCard';
import SearchBar from '../../components/SearchBar';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

export default function EmployeeListScreen({ navigation }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchEmployees = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      try {
        setError(null);
        const params = { page: pageNum, limit: 20 };
        if (search) params.search = search;

        const response = await employeesAPI.getAll(params);
        const newEmployees = response.data.employees;

        if (pageNum === 1 || isRefresh) {
          setEmployees(newEmployees);
        } else {
          setEmployees((prev) => [...prev, ...newEmployees]);
        }

        setHasMore(pageNum < response.data.pagination.totalPages);
        setPage(pageNum);
      } catch {
        setError('Nem sikerült betölteni a munkavállalókat');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [search]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchEmployees(1);
  }, [fetchEmployees]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEmployees(1, true);
  }, [fetchEmployees]);

  const onEndReached = useCallback(() => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      fetchEmployees(page + 1);
    }
  }, [loadingMore, hasMore, page, fetchEmployees]);

  if (loading) return <LoadingScreen />;
  if (error && employees.length === 0)
    return <ErrorState message={error} onRetry={() => fetchEmployees(1)} />;

  return (
    <View style={styles.container}>
      <SearchBar placeholder="Munkavállaló keresése..." onSearch={setSearch} />
      <FlatList
        data={employees}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EmployeeCard
            employee={item}
            onPress={() => navigation.navigate('EmployeeDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<EmptyState icon="people-outline" message="Nincs találat" />}
        contentContainerStyle={employees.length === 0 && styles.emptyContainer}
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
