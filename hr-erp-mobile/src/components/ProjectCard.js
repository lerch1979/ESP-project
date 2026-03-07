import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import StatusBadge from './StatusBadge';

const statusConfig = {
  planning: { label: 'Tervezés', color: colors.info },
  active: { label: 'Aktív', color: colors.success },
  on_hold: { label: 'Szüneteltetve', color: colors.warning },
  completed: { label: 'Befejezett', color: colors.textSecondary },
  cancelled: { label: 'Megszakítva', color: colors.error },
};

export default function ProjectCard({ project, onPress }) {
  const status = statusConfig[project.status] || statusConfig.planning;
  const progress = project.progress || 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{project.name}</Text>
        <StatusBadge label={status.label} color={status.color} />
      </View>

      {project.description ? (
        <Text style={styles.description} numberOfLines={2}>{project.description}</Text>
      ) : null}

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>{progress}%</Text>
      </View>

      <View style={styles.footer}>
        {project.manager_name ? (
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={13} color={colors.textLight} />
            <Text style={styles.metaText}>{project.manager_name}</Text>
          </View>
        ) : null}
        {project.task_count != null ? (
          <View style={styles.metaItem}>
            <Ionicons name="checkbox-outline" size={13} color={colors.textLight} />
            <Text style={styles.metaText}>
              {project.completed_task_count || 0}/{project.task_count} feladat
            </Text>
          </View>
        ) : null}
        {project.due_date ? (
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={colors.textLight} />
            <Text style={styles.metaText}>
              {new Date(project.due_date).toLocaleDateString('hu-HU')}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    minWidth: 32,
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textLight,
  },
});
