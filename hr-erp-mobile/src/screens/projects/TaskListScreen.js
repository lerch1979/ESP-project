import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { taskAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import TaskCard from '../../components/TaskCard';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

const statusFilters = [
  { value: 'todo', label: 'Teendő' },
  { value: 'in_progress', label: 'Folyamatban' },
  { value: 'in_review', label: 'Ellenőrzés' },
  { value: 'done', label: 'Kész' },
  { value: 'blocked', label: 'Blokkolva' },
];

export default function TaskListScreen({ navigation }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const params = { my_tasks: true };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await taskAPI.getAll(params);
      setTasks(response.data || []);
    } catch (err) {
      setError('Nem sikerült betölteni a feladatokat');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchTasks();
    });
    return unsubscribe;
  }, [navigation, fetchTasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTasks();
  }, [fetchTasks]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchTasks} />;

  return (
    <View style={styles.container}>
      <SearchBar
        onSearch={setSearch}
        placeholder="Feladat keresése..."
      />
      <FilterChips
        options={statusFilters}
        selected={statusFilter}
        onSelect={setStatusFilter}
      />
      <FlatList
        data={tasks}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={() => navigation.navigate('TaskDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={tasks.length === 0 && styles.emptyContainer}
        ListEmptyComponent={<EmptyState icon="checkbox-outline" message="Nincs feladat" />}
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
