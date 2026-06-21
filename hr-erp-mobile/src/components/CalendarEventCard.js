import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../constants/colors';

const eventConfig = {
  checkin: { icon: 'log-in-outline', color: colors.success, labelKey: 'calEvent.checkin' },
  checkout: { icon: 'log-out-outline', color: colors.error, labelKey: 'calEvent.checkout' },
  visa_expiry: { icon: 'document-outline', color: colors.warning, labelKey: 'calEvent.visa_expiry' },
  contract_expiry: { icon: 'briefcase-outline', color: colors.warning, labelKey: 'calEvent.contract_expiry' },
  ticket_deadline: { icon: 'ticket-outline', color: colors.error, labelKey: 'calEvent.ticket_deadline' },
  shift: { icon: 'time-outline', color: colors.info, labelKey: 'calEvent.shift' },
  medical_appointment: { icon: 'medkit-outline', color: colors.priorityHigh, labelKey: 'calEvent.medical_appointment' },
  personal_event: { icon: 'calendar-outline', color: colors.primary, labelKey: 'calEvent.personal_event' },
};

const urgencyColors = {
  past: colors.textLight,
  critical: colors.error,
  warning: colors.warning,
  normal: colors.primary,
};

export default function CalendarEventCard({ event }) {
  const { t } = useTranslation();
  const config = eventConfig[event.type] || eventConfig.personal_event;
  const borderColor = urgencyColors[event.urgency] || colors.primary;

  return (
    <View style={[styles.card, { borderLeftColor: borderColor }]}>
      <View style={[styles.iconContainer, { backgroundColor: config.color + '18' }]}>
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.type}>{t(config.labelKey)}</Text>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        {event.description ? (
          <Text style={styles.description} numberOfLines={1}>{event.description}</Text>
        ) : null}
      </View>
      {event.urgency === 'critical' && (
        <View style={styles.urgencyBadge}>
          <Text style={styles.urgencyText}>!</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 12,
    marginVertical: 3,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  type: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginTop: 2,
  },
  description: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  urgencyBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  urgencyText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
