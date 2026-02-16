import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { calendarAPI } from '../services/api';
import { colors } from '../constants/colors';
import CalendarEventCard from '../components/CalendarEventCard';
import FilterChips from '../components/FilterChips';
import LoadingScreen from '../components/LoadingScreen';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';

const eventTypeFilters = [
  { label: 'Mind', value: null },
  { label: 'Bejelentkezés', value: 'checkin' },
  { label: 'Kijelentkezés', value: 'checkout' },
  { label: 'Vízum', value: 'visa_expiry' },
  { label: 'Szerződés', value: 'contract_expiry' },
  { label: 'Határidő', value: 'ticket_deadline' },
  { label: 'Műszak', value: 'shift' },
  { label: 'Orvosi', value: 'medical_appointment' },
  { label: 'Személyes', value: 'personal_event' },
];

const monthNames = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];

export default function CalendarScreen() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [eventType, setEventType] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchEvents = useCallback(async () => {
    try {
      setError(null);
      const params = { month, year };
      if (eventType) params.event_type = eventType;

      const response = await calendarAPI.getEvents(params);
      const events = response.data.events || [];

      // Group by date
      const grouped = {};
      events.forEach((event) => {
        const date = event.event_date;
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(event);
      });

      const sectionData = Object.keys(grouped)
        .sort()
        .map((date) => ({
          title: formatSectionDate(date),
          data: grouped[date],
        }));

      setSections(sectionData);
    } catch {
      setError('Nem sikerült betölteni az eseményeket');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month, year, eventType]);

  useEffect(() => {
    setLoading(true);
    fetchEvents();
  }, [fetchEvents]);

  const changeMonth = (delta) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 12) { newMonth = 1; newYear++; }
    if (newMonth < 1) { newMonth = 12; newYear--; }
    setMonth(newMonth);
    setYear(newYear);
  };

  if (loading) return <LoadingScreen />;
  if (error && sections.length === 0) return <ErrorState message={error} onRetry={fetchEvents} />;

  return (
    <View style={styles.container}>
      {/* Month selector */}
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthText}>
          {year}. {monthNames[month - 1]}
        </Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
          <Ionicons name="chevron-forward" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <FilterChips options={eventTypeFilters} selected={eventType} onSelect={setEventType} />

      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item.type}-${item.related_entity_id || index}`}
        renderItem={({ item }) => (
          <View style={styles.eventItem}>
            <CalendarEventCard event={item} />
          </View>
        )}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchEvents(); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={<EmptyState icon="calendar-outline" message="Nincs esemény ebben a hónapban" />}
        contentContainerStyle={sections.length === 0 && styles.emptyContainer}
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

function formatSectionDate(dateStr) {
  const d = new Date(dateStr);
  const days = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat'];
  return `${monthNames[d.getMonth()]} ${d.getDate()}. (${days[d.getDay()]})`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  monthArrow: {
    padding: 4,
  },
  monthText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  eventItem: {
    paddingHorizontal: 16,
  },
  emptyContainer: {
    flex: 1,
  },
});
