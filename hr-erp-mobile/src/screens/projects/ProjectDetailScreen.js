import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { projectAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import TaskCard from '../../components/TaskCard';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

const statusConfig = {
  planning: { label: 'Tervezés', color: colors.info },
  active: { label: 'Aktív', color: colors.success },
  on_hold: { label: 'Szüneteltetve', color: colors.warning },
  completed: { label: 'Befejezett', color: colors.textSecondary },
  cancelled: { label: 'Megszakítva', color: colors.error },
};

export default function ProjectDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchProject = useCallback(async () => {
    try {
      setError(null);
      const response = await projectAPI.getById(id);
      setProject(response.data);
    } catch (err) {
      setError('Nem sikerült betölteni a projekt adatait');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    if (project?.name) {
      navigation.setOptions({ title: project.name });
    }
  }, [project?.name, navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProject();
  }, [fetchProject]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchProject} />;
  if (!project) return null;

  const status = statusConfig[project.status] || statusConfig.planning;
  const progress = project.progress || 0;
  const tasks = project.tasks || [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Text style={styles.name}>{project.name}</Text>
          <StatusBadge label={status.label} color={status.color} />
        </View>

        {project.description ? (
          <Text style={styles.description}>{project.description}</Text>
        ) : null}

        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Haladás</Text>
            <Text style={styles.progressValue}>{progress}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        <View style={styles.detailsGrid}>
          {project.manager_name && (
            <View style={styles.detailItem}>
              <Ionicons name="person-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.detailLabel}>Projektvezető</Text>
                <Text style={styles.detailValue}>{project.manager_name}</Text>
              </View>
            </View>
          )}
          {project.start_date && (
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.detailLabel}>Kezdés</Text>
                <Text style={styles.detailValue}>
                  {new Date(project.start_date).toLocaleDateString('hu-HU')}
                </Text>
              </View>
            </View>
          )}
          {project.due_date && (
            <View style={styles.detailItem}>
              <Ionicons name="flag-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.detailLabel}>Határidő</Text>
                <Text style={styles.detailValue}>
                  {new Date(project.due_date).toLocaleDateString('hu-HU')}
                </Text>
              </View>
            </View>
          )}
          {project.task_count != null && (
            <View style={styles.detailItem}>
              <Ionicons name="checkbox-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.detailLabel}>Feladatok</Text>
                <Text style={styles.detailValue}>
                  {project.completed_task_count || 0} / {project.task_count} kész
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Feladatok ({tasks.length})</Text>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onPress={() => navigation.navigate('TaskDetail', { id: task.id })}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>Nincsenek feladatok</Text>
        )}
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerCard: {
    backgroundColor: colors.white,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    marginRight: 10,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  progressSection: {
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: '40%',
  },
  detailLabel: {
    fontSize: 11,
    color: colors.textLight,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  section: {
    marginTop: 4,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 24,
  },
  bottomPadding: {
    height: 20,
  },
});
