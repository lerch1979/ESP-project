import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../constants/colors';

/**
 * Simple bar+line trend chart for pulse history.
 *
 * @param {Array<{date: string, value: number, avg?: number}>} data
 * @param {number}  [maxValue]   – y-axis max (default 5)
 * @param {number}  [height]     – chart height in px (default 120)
 * @param {string}  [barColor]   – bar fill color
 * @param {string}  [avgColor]   – moving average line color
 * @param {number}  [maxBars]    – max bars to display (default 14)
 * @param {boolean} [showLegend] – show legend below chart (default true)
 */
export default function TrendChart({
  data = [],
  maxValue = 5,
  height = 120,
  barColor = colors.primary,
  avgColor = colors.warning,
  maxBars = 14,
  showLegend = true,
}) {
  const displayData = data.slice(-maxBars);

  if (displayData.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>Nincs elegendő adat a megjelenítéshez.</Text>
      </View>
    );
  }

  const trackHeight = height - 20; // leave room for labels

  return (
    <View>
      <View style={[styles.chartContainer, { height }]}>
        {displayData.map((item, idx) => {
          const barH = Math.max((item.value / maxValue) * trackHeight, 2);
          const avgH = item.avg != null ? (item.avg / maxValue) * trackHeight : null;
          const dateObj = new Date(item.date);
          const dayLabel = `${dateObj.getDate()}.`;

          return (
            <View key={idx} style={styles.barWrapper}>
              <View style={[styles.barTrack, { height: trackHeight }]}>
                {/* Average marker */}
                {avgH != null && (
                  <View
                    style={[
                      styles.avgLine,
                      { bottom: avgH, backgroundColor: avgColor },
                    ]}
                  />
                )}
                {/* Bar */}
                <View
                  style={[
                    styles.bar,
                    { height: barH, backgroundColor: barColor },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{dayLabel}</Text>
            </View>
          );
        })}
      </View>

      {showLegend && (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: barColor }]} />
            <Text style={styles.legendText}>Napi érték</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: avgColor }]} />
            <Text style={styles.legendText}>7 napos átlag</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  barWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    width: 14,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  bar: {
    width: 14,
    borderRadius: 7,
    minHeight: 2,
  },
  avgLine: {
    position: 'absolute',
    left: -3,
    right: -3,
    height: 2.5,
    borderRadius: 1,
  },
  barLabel: {
    fontSize: 9,
    color: colors.textLight,
    marginTop: 4,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
