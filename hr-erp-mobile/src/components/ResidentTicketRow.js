import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import StatusBadge from './StatusBadge';
import { colors } from '../constants/colors';

function formatDate(d) {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}.`;
}

// Chronological resident ticket row: category icon chip + short title + date + status.
export default function ResidentTicketRow({ ticket, onPress, dimmed }) {
  const { t } = useTranslation();
  const chipBg = (ticket.category_color || colors.primary) + '22'; // ~13% alpha tint
  return (
    <TouchableOpacity style={[styles.row, dimmed && styles.dimmed]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconChip, { backgroundColor: chipBg }]}>
        <Text style={styles.icon}>{ticket.category_icon || '📋'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{ticket.title}</Text>
        {/* MIÉRT LÁTJA EZT A JEGYET. A közös helyiségek miatt a listájában megjelennek
            olyan bejelentések is, amiket nem ő tett. Jelölés nélkül ez zavarba ejtő —
            a lakó azt hinné, valaki az ő nevében írt, vagy hogy elrontottunk valamit. */}
        {ticket.lathatosag_oka === 'kozos' ? (
          <Text style={styles.reason} numberOfLines={1}>
            🏠 {t('tickets.sharedHouse', { defaultValue: 'Közös — az egész szállásra vonatkozik' })}
          </Text>
        ) : ticket.lathatosag_oka === 'erintett' ? (
          <Text style={styles.reason} numberOfLines={1}>
            👥 {t('tickets.affectsYou', { defaultValue: 'Téged is érint' })}
          </Text>
        ) : null}
        <Text style={styles.date}>{formatDate(ticket.created_at)}</Text>
      </View>
      <StatusBadge label={t(`status.${ticket.status_slug}`, { defaultValue: ticket.status_name })} slug={ticket.status_slug} color={ticket.status_color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginVertical: 5,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dimmed: { opacity: 0.6 },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: { fontSize: 22 },
  body: { flex: 1, marginRight: 8 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  reason: { fontSize: 12, color: colors.primary, marginTop: 2 },
  date: { fontSize: 12, color: colors.textLight, marginTop: 3 },
});
