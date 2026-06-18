import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, SectionList, ScrollView, RefreshControl, ActivityIndicator,
  TouchableOpacity, Alert, StyleSheet, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
// SDK 54: cacheDirectory / writeAsStringAsync / getContentUriAsync moved OUT of
// the default expo-file-system export into the /legacy subpath. Importing the
// default entry made FileSystem.EncodingType undefined → `.UTF8` threw before
// the share sheet ("export failed"). The legacy import restores the old API.
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { calendarAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import MonthGrid, { TYPE_COLOR, ymdKey } from './MonthGrid';

// Resident calendar — self-scoped, READ-ONLY (one-way). Shows ONLY the caller's
// own upcoming events from GET /calendar/my. Two views over the SAME feed:
//   • List  — agenda grouped by day (default)
//   • Month — color-coded grid; tap a day to see its events below.
// System-event labels are localized BY TYPE (the backend's Hungarian
// title/description is intentionally NOT shown); the ticket_deadline title is
// the resident's own text and is shown verbatim.

const TYPE_ICON = {
  ticket_deadline: 'construct-outline',
  checkin: 'log-in-outline',
  checkout: 'log-out-outline',
  visa_expiry: 'document-text-outline',
  contract_expiry: 'document-text-outline',
  shift: 'time-outline',
  inspection: 'clipboard-outline',
};

function dayKeyOf(ev) {
  return String(ev.date).slice(0, 10); // YYYY-MM-DD straight off the value (no TZ shift)
}

function formatDateHeader(dayKey, lang) {
  try {
    return new Date(`${dayKey}T00:00:00`).toLocaleDateString(lang, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch {
    return dayKey; // fallback: YYYY-MM-DD
  }
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function ResidentCalendarScreen() {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'month'
  const [monthDate, setMonthDate] = useState(() => firstOfMonth(new Date()));
  const [selectedKey, setSelectedKey] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await calendarAPI.getMine();
      setEvents(res?.data?.events || []);
    } catch (e) {
      console.warn('[ResidentCalendar] load failed:', e?.message || e);
      setError(t('calendar.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  // Refetch on every focus (returning to the tab refreshes the calendar).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  // events grouped by YYYY-MM-DD → used by both the agenda and the month grid.
  const eventsByDay = useMemo(() => {
    const byDay = {};
    for (const ev of events) {
      const key = dayKeyOf(ev);
      (byDay[key] = byDay[key] || []).push(ev);
    }
    return byDay;
  }, [events]);

  const sections = useMemo(
    () => Object.keys(eventsByDay).sort().map((key) => ({ title: key, data: eventsByDay[key] })),
    [eventsByDay]
  );

  // Layer 2 — one-way "add to my calendar": fetch the self-scoped .ics, write it
  // to a temp file, and hand it to the native share sheet (any calendar app, no
  // account). Read-only; nothing flows back into HR-ERP.
  const addToCalendar = useCallback(async (item) => {
    try {
      const ics = await calendarAPI.myIcs(item.type, item.id, i18n.language);
      // Legacy writeAsStringAsync defaults to UTF-8 — no EncodingType needed.
      const uri = `${FileSystem.cacheDirectory}event.ics`;
      await FileSystem.writeAsStringAsync(uri, ics);

      if (Platform.OS === 'android') {
        // Android calendar apps import an .ics via an ACTION_VIEW intent on a
        // content:// URI — NOT the ACTION_SEND share sheet (calendars don't
        // register as send targets). Open the OS "import event" screen directly.
        try {
          const contentUri = await FileSystem.getContentUriAsync(uri);
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: 'text/calendar',
          });
          return;
        } catch (intentErr) {
          // No VIEW handler installed → fall back to the share sheet below.
          console.warn('[ResidentCalendar] VIEW intent failed, falling back to share:', intentErr?.message || intentErr);
        }
      }

      // iOS (and Android fallback): the share sheet surfaces "Add to Calendar"
      // via the ICS UTI on iOS.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'text/calendar',
          UTI: 'com.apple.ical.ics',
          dialogTitle: t('calendar.addToCalendar'),
        });
      } else {
        Alert.alert(t('calendar.title'), t('calendar.icsError'));
      }
    } catch (e) {
      // Surface the real error so on-device failures are diagnosable (the
      // generic message alone hid the root cause). Safe to trim later.
      const detail = e?.message || String(e);
      console.warn('[ResidentCalendar] ics export failed:', detail, e?.stack || '');
      Alert.alert(t('calendar.title'), `${t('calendar.icsError')}\n\n${detail}`);
    }
  }, [t, i18n.language]);

  const renderEventCard = useCallback((item) => {
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
          color={TYPE_COLOR[item.type] || colors.primary}
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
          {item.id ? (
            <TouchableOpacity
              onPress={() => addToCalendar(item)}
              style={styles.addBtn}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={styles.addBtnText}>{t('calendar.addToCalendar')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }, [t, addToCalendar]);

  const goPrevMonth = useCallback(() => {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);
  const goNextMonth = useCallback(() => {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  const Toggle = (
    <View style={styles.toggle}>
      {['list', 'month'].map((v) => (
        <TouchableOpacity
          key={v}
          style={[styles.toggleBtn, view === v && styles.toggleBtnActive]}
          onPress={() => setView(v)}
        >
          <Ionicons
            name={v === 'list' ? 'list-outline' : 'grid-outline'}
            size={16}
            color={view === v ? colors.white : colors.textSecondary}
          />
          <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
            {t(v === 'list' ? 'calendar.viewList' : 'calendar.viewMonth')}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (view === 'list') {
    return (
      <View style={styles.flex}>
        {Toggle}
        <SectionList
          style={styles.list}
          sections={sections}
          keyExtractor={(item, idx) => `${item.type}-${item.date}-${idx}`}
          renderItem={({ item }) => renderEventCard(item)}
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
      </View>
    );
  }

  // Month view — grid + the selected day's events below it.
  const dayEvents = selectedKey ? (eventsByDay[selectedKey] || []) : [];
  return (
    <View style={styles.flex}>
      {Toggle}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        <MonthGrid
          monthDate={monthDate}
          eventsByDay={eventsByDay}
          selectedKey={selectedKey}
          onSelectDay={setSelectedKey}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
          language={i18n.language}
        />
        {selectedKey ? (
          <View style={styles.daySection}>
            <Text style={styles.sectionHeader}>{formatDateHeader(selectedKey, i18n.language)}</Text>
            {dayEvents.length ? (
              dayEvents.map((item, idx) => (
                <View key={`${item.type}-${item.id || idx}`}>{renderEventCard(item)}</View>
              ))
            ) : (
              <Text style={styles.dayEmpty}>{t('calendar.empty')}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.hint}>{t('calendar.tapDay')}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyWrap: { flexGrow: 1 },
  empty: { marginTop: 12, color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  toggle: {
    flexDirection: 'row', backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: 8, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  toggleBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  toggleTextActive: { color: colors.white },
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
  daySection: { paddingBottom: 8 },
  dayEmpty: { color: colors.textLight, fontSize: 14, paddingHorizontal: 16, paddingVertical: 8 },
  hint: { color: colors.textLight, fontSize: 14, textAlign: 'center', paddingHorizontal: 24, paddingTop: 20 },
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
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginTop: 10,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, borderColor: colors.primary,
  },
  addBtnText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
});
