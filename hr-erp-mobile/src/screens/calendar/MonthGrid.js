import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';

// One stable color per event type — used for the month-grid dots AND the legend.
// Mirrors the agenda's TYPE_ICON set (5 derived types + shift + inspection).
export const TYPE_COLOR = {
  checkin: '#2e7d32',
  checkout: '#c62828',
  visa_expiry: '#f9a825',
  contract_expiry: '#6a1b9a',
  ticket_deadline: '#1565c0',
  shift: '#00838f',
  inspection: '#ad1457',
};

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

// Local YYYY-MM-DD key (NOT toISOString — that would UTC-shift the day).
export function ymdKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Lightweight, dependency-free month grid. Monday-first weeks, localized labels.
// Each day shows up to 4 color-coded dots (one per distinct event type that day).
export default function MonthGrid({ monthDate, eventsByDay, selectedKey, onSelectDay, onPrev, onNext, language }) {
  const { weeks, monthLabel } = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7; // shift so Monday = column 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    const w = [];
    for (let i = 0; i < cells.length; i += 7) w.push(cells.slice(i, i + 7));
    let label;
    try {
      label = first.toLocaleDateString(language, { month: 'long', year: 'numeric' });
    } catch {
      label = `${year}-${String(month + 1).padStart(2, '0')}`;
    }
    return { weeks: w, monthLabel: label };
  }, [monthDate, language]);

  const weekdays = useMemo(() => {
    const names = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2024, 0, 1 + i); // 2024-01-01 was a Monday
      try {
        names.push(d.toLocaleDateString(language, { weekday: 'short' }));
      } catch {
        names.push(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i]);
      }
    }
    return names;
  }, [language]);

  const todayKey = ymdKey(new Date());

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onPrev} hitSlop={HIT}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.month}>{monthLabel}</Text>
        <TouchableOpacity onPress={onNext} hitSlop={HIT}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((w, i) => (
          <Text key={i} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={styles.cell} />;
            const key = ymdKey(day);
            const evs = eventsByDay[key] || [];
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const types = [...new Set(evs.map((e) => e.type))].slice(0, 4);
            return (
              <TouchableOpacity
                key={di}
                style={[styles.cell, isSelected && styles.cellSelected]}
                onPress={() => onSelectDay(key)}
                activeOpacity={0.6}
              >
                <View style={[styles.dayNum, isToday && styles.todayNum]}>
                  <Text style={[
                    styles.dayNumText,
                    isToday && styles.todayNumText,
                    isSelected && !isToday && styles.selectedNumText,
                  ]}>
                    {day.getDate()}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {types.map((t, ti) => (
                    <View key={ti} style={[styles.dot, { backgroundColor: TYPE_COLOR[t] || colors.primary }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.white, paddingBottom: 8 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  month: { fontSize: 16, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600',
    color: colors.textLight, textTransform: 'uppercase', paddingVertical: 4,
  },
  cell: {
    flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'flex-start',
    paddingTop: 4, borderRadius: 8,
  },
  cellSelected: { backgroundColor: '#e8f1e9' },
  dayNum: {
    width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  todayNum: { backgroundColor: colors.primary },
  dayNumText: { fontSize: 13, color: colors.text },
  todayNumText: { color: colors.white, fontWeight: '700' },
  selectedNumText: { color: colors.primaryDark, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 2, marginTop: 2, minHeight: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
