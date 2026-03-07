import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { projectAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import ProjectCard from '../../components/ProjectCard';
import SearchBar from '../../components/SearchBar';
import FilterChips from '../../components/FilterChips';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';

const statusFilters = [
  { value: 'active', label: 'Aktív' },
  { value: 'planning', label: 'Tervezés' },
  { value: 'on_hold', label: 'Szüneteltetve' },
  { value: 'completed', label: 'Befejezett' },
  { value: 'cancelled', label: 'Megszakítva' },
];

export default function ProjectListScreen({ navigation }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);

  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await projectAPI.getAll(params);
      setProjects(response.data || []);
    } catch (err) {
      setError('Nem sikerült betölteni a projekteket');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProjects();
  }, [fetchProjects]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchProjects} />;

  return (
    <View style={styles.container}>
      <SearchBar
        onSearch={setSearch}
        placeholder="Projekt keresése..."
      />
      <FilterChips
        options={statusFilters}
        selected={statusFilter}
        onSelect={setStatusFilter}
      />
      <FlatList
        data={projects}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProjectCard
            project={item}
            onPress={() => navigation.navigate('ProjectDetail', { id: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={projects.length === 0 && styles.emptyContainer}
        ListEmptyComponent={<EmptyState icon="folder-outline" message="Nincs találat" />}
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
