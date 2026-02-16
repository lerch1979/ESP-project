import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import StatusBadge from './StatusBadge';

const priorityColors = {
  1: colors.priorityLow,
  2: colors.priorityMedium,
  3: colors.priorityHigh,
  4: colors.priorityCritical,
};

export default function TicketCard({ ticket, onPress }) {
  const priorityColor = priorityColors[ticket.priority_level] || colors.textSecondary;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={styles.number}>{ticket.ticket_number}</Text>
        <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
      </View>
      <Text style={styles.title} numberOfLines={2}>{ticket.title}</Text>
      <View style={styles.footer}>
        <StatusBadge
          label={ticket.status_name}
          slug={ticket.status_slug}
          color={ticket.status_color}
        />
        <View style={styles.meta}>
          {ticket.assigned_to_name && (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={12} color={colors.textLight} />
              <Text style={styles.metaText}>{ticket.assigned_to_name}</Text>
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
    alignItems: 'center',
    marginBottom: 6,
  },
  number: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
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
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
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
});
