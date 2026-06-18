import React, { useState, useCallback } from 'react';
import { View, Text, SectionList, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { calendarAPI } from '../../services/api';
import { colors } from '../../constants/colors';

// Resident agenda — self-scoped, READ-ONLY (one-way). Shows ONLY the caller's
// own upcoming events from GET /calendar/my. System-event labels are localized
// BY TYPE (the backend's Hungarian title/description is intentionally NOT shown),
// so a non-hu resident sees the type in their own language. The ticket_deadline
// title is the resident's own text and is shown verbatim.

const TYPE_ICON = {
  ticket_deadline: 'construct-outline',
  checkin: 'log-in-outline',
  checkout: 'log-out-outline',
  visa_expiry: 'document-text-outline',
  contract_expiry: 'document-text-outline',
};

function formatDateHeader(dayKey, lang) {
  try {
    return new Date(`${dayKey}T00:00:00`).toLocaleDateString(lang, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch {
    return dayKey; // fallback: YYYY-MM-DD
  }
}

export default function ResidentCalendarScreen() {
  const { t, i18n } = useTranslation();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await calendarAPI.getMine();
      const events = res?.data?.events || [];
      // Group by day. slice(0,10) takes the YYYY-MM-DD directly off the value
      // to avoid any timezone day-shift. Sorted ascending (upcoming first).
      const byDay = {};
      for (const ev of events) {
        const key = String(ev.date).slice(0, 10);
        (byDay[key] = byDay[key] || []).push(ev);
      }
      setSections(Object.keys(byDay).sort().map((key) => ({ title: key, data: byDay[key] })));
    } catch (e) {
      console.warn('[ResidentCalendar] load failed:', e?.message || e);
      setError(t('calendar.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  // Refetch on every focus (returning to the tab refreshes the agenda).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const renderItem = ({ item }) => {
    const typeLabel = t(`calendar.eventType.${item.type}`, { defaultValue: item.title || item.type });
    const isTicket = item.type === 'ticket_deadline';
    const primary = isTicket ? (item.title || typeLabel) : typeLabel;
    const acc = item.accommodation;
    const where = acc?.name
      ? `${acc.name}${acc.room ? ` · ${t('calendar.room')} ${acc.room}` : ''}`
      : null;
    return (
      <View style={styles.card}>
        <Ionicons
          name={TYPE_ICON[item.type] || 'calendar-outline'}
          size={22}
          color={colors.primary}
          style={styles.icon}
        />
        <View style={styles.cardBody}>
          <Text style={styles.primary}>{primary}</Text>
          {isTicket && <Text style={styles.badge}>{typeLabel}</Text>}
          {where && (
            <View style={styles.whereRow}>
              <Ionicons name="home-outline" size={13} color={colors.textLight} />
              <Text style={styles.where}>{where}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SectionList
      style={styles.list}
      sections={sections}
      keyExtractor={(item, idx) => `${item.type}-${item.date}-${idx}`}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader}>{formatDateHeader(section.title, i18n.language)}</Text>
      )}
      contentContainerStyle={sections.length === 0 ? styles.emptyWrap : styles.listContent}
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={48} color={colors.textLight} />
          <Text style={styles.empty}>{error || t('calendar.empty')}</Text>
        </View>
      }
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
      }
      stickySectionHeadersEnabled
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyWrap: { flexGrow: 1 },
  empty: { marginTop: 12, color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  sectionHeader: {
    backgroundColor: colors.background,
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
    textTransform: 'capitalize',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    marginHorizontal: 12,
    marginVertical: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { marginRight: 12, marginTop: 1 },
  cardBody: { flex: 1 },
  primary: { color: colors.text, fontSize: 15, fontWeight: '600' },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    color: colors.primaryDark,
    backgroundColor: '#e8f1e9',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  where: { color: colors.textSecondary, fontSize: 13 },
});
