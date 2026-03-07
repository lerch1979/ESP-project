import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import StatusBadge from './StatusBadge';

const priorityColors = {
  low: colors.priorityLow,
  medium: colors.priorityMedium,
  high: colors.priorityHigh,
  critical: colors.priorityCritical,
};

const priorityLabels = {
  low: 'Alacsony',
  medium: 'Közepes',
  high: 'Magas',
  critical: 'Kritikus',
};

const statusConfig = {
  todo: { label: 'Teendő', color: colors.statusOpen },
  in_progress: { label: 'Folyamatban', color: colors.statusInProgress },
  in_review: { label: 'Ellenőrzés', color: colors.info },
  done: { label: 'Kész', color: colors.statusResolved },
  blocked: { label: 'Blokkolva', color: colors.error },
};

export default function TaskCard({ task, onPress, compact = false }) {
  const priorityColor = priorityColors[task.priority] || colors.textSecondary;
  const status = statusConfig[task.status] || statusConfig.todo;

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.priorityStripe, { backgroundColor: priorityColor }]} />
        <View style={styles.compactContent}>
          <Text style={styles.compactTitle} numberOfLines={1}>{task.title}</Text>
          <View style={styles.compactMeta}>
            <StatusBadge label={status.label} color={status.color} />
            {task.due_date && (
              <Text style={styles.compactDate}>
                {new Date(task.due_date).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
          <Text style={styles.title} numberOfLines={2}>{task.title}</Text>
        </View>
      </View>

      {task.description ? (
        <Text style={styles.description} numberOfLines={2}>{task.description}</Text>
      ) : null}

      <View style={styles.footer}>
        <StatusBadge label={status.label} color={status.color} />
        <View style={styles.meta}>
          {task.assignee_name && (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={12} color={colors.textLight} />
              <Text style={styles.metaText}>{task.assignee_name}</Text>
            </View>
          )}
          {task.due_date && (
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={12} color={
                new Date(task.due_date) < new Date() && task.status !== 'done'
                  ? colors.error
                  : colors.textLight
              } />
              <Text style={[
                styles.metaText,
                new Date(task.due_date) < new Date() && task.status !== 'done' && styles.overdueText,
              ]}>
                {new Date(task.due_date).toLocaleDateString('hu-HU')}
              </Text>
            </View>
          )}
          {task.project_name && (
            <View style={styles.metaItem}>
              <Ionicons name="folder-outline" size={12} color={colors.textLight} />
              <Text style={styles.metaText}>{task.project_name}</Text>
            </View>
          )}
        </View>
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
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
    marginLeft: 16,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: colors.textLight,
  },
  overdueText: {
    color: colors.error,
    fontWeight: '600',
  },
  // Compact mode styles
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    marginVertical: 3,
    overflow: 'hidden',
  },
  priorityStripe: {
    width: 3,
    alignSelf: 'stretch',
  },
  compactContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  compactTitle: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactDate: {
    fontSize: 11,
    color: colors.textLight,
  },
});
