import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { taskAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

const statusConfig = {
  todo: { label: 'Teendő', color: colors.statusOpen },
  in_progress: { label: 'Folyamatban', color: colors.statusInProgress },
  in_review: { label: 'Ellenőrzés', color: colors.info },
  done: { label: 'Kész', color: colors.statusResolved },
  blocked: { label: 'Blokkolva', color: colors.error },
};

const priorityConfig = {
  low: { label: 'Alacsony', color: colors.priorityLow },
  medium: { label: 'Közepes', color: colors.priorityMedium },
  high: { label: 'Magas', color: colors.priorityHigh },
  critical: { label: 'Kritikus', color: colors.priorityCritical },
};

const statusTransitions = {
  todo: ['in_progress'],
  in_progress: ['in_review', 'blocked'],
  in_review: ['done', 'in_progress'],
  done: ['in_progress'],
  blocked: ['in_progress'],
};

export default function TaskDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  const fetchTask = useCallback(async () => {
    try {
      setError(null);
      const response = await taskAPI.getById(id);
      setTask(response.data);
    } catch (err) {
      setError('Nem sikerült betölteni a feladat adatait');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  useEffect(() => {
    if (task?.title) {
      navigation.setOptions({ title: task.title });
    }
  }, [task?.title, navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTask();
  }, [fetchTask]);

  const handleStatusChange = (newStatus) => {
    const statusLabel = statusConfig[newStatus]?.label || newStatus;
    Alert.alert(
      'Státusz módosítása',
      `Biztosan módosítja a státuszt: "${statusLabel}"?`,
      [
        { text: 'Mégse', style: 'cancel' },
        {
          text: 'Módosítás',
          onPress: async () => {
            try {
              setUpdating(true);
              await taskAPI.updateStatus(id, { status: newStatus });
              setTask((prev) => ({ ...prev, status: newStatus }));
            } catch (err) {
              Alert.alert('Hiba', 'Nem sikerült módosítani a státuszt');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchTask} />;
  if (!task) return null;

  const status = statusConfig[task.status] || statusConfig.todo;
  const priority = priorityConfig[task.priority] || priorityConfig.medium;
  const transitions = statusTransitions[task.status] || [];
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.card}>
        <Text style={styles.title}>{task.title}</Text>

        <View style={styles.badges}>
          <StatusBadge label={status.label} color={status.color} />
          <StatusBadge label={priority.label} color={priority.color} />
        </View>

        {task.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Leírás</Text>
            <Text style={styles.descriptionText}>{task.description}</Text>
          </View>
        ) : null}

        <View style={styles.detailsGrid}>
          {task.assignee_name && (
            <View style={styles.detailItem}>
              <Ionicons name="person-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.detailLabel}>Felelős</Text>
                <Text style={styles.detailValue}>{task.assignee_name}</Text>
              </View>
            </View>
          )}
          {task.project_name && (
            <View style={styles.detailItem}>
              <Ionicons name="folder-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.detailLabel}>Projekt</Text>
                <Text style={styles.detailValue}>{task.project_name}</Text>
              </View>
            </View>
          )}
          {task.due_date && (
            <View style={styles.detailItem}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={isOverdue ? colors.error : colors.textLight}
              />
              <View>
                <Text style={styles.detailLabel}>Határidő</Text>
                <Text style={[styles.detailValue, isOverdue && styles.overdueValue]}>
                  {new Date(task.due_date).toLocaleDateString('hu-HU')}
                  {isOverdue ? ' (lejárt)' : ''}
                </Text>
              </View>
            </View>
          )}
          {task.created_at && (
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={16} color={colors.textLight} />
              <View>
                <Text style={styles.detailLabel}>Létrehozva</Text>
                <Text style={styles.detailValue}>
                  {new Date(task.created_at).toLocaleDateString('hu-HU')}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {transitions.length > 0 && (
        <View style={styles.actionsCard}>
          <Text style={styles.actionsTitle}>Státusz módosítása</Text>
          <View style={styles.actionsRow}>
            {transitions.map((nextStatus) => {
              const nextConfig = statusConfig[nextStatus];
              return (
                <TouchableOpacity
                  key={nextStatus}
                  style={[styles.actionButton, { borderColor: nextConfig.color }]}
                  onPress={() => handleStatusChange(nextStatus)}
                  disabled={updating}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.actionButtonText, { color: nextConfig.color }]}>
                    {nextConfig.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  section: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textLight,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
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
  overdueValue: {
    color: colors.error,
  },
  actionsCard: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  actionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 20,
  },
});
