import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { num } from '../WellMind/helpers';

export default function ProviderCard({ provider, onPress }) {
  const rating = num(provider.rating, null);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Ionicons name="person-circle-outline" size={48} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{provider.full_name}</Text>
        {provider.credentials && <Text style={styles.credentials}>{provider.credentials}</Text>}
        <View style={styles.metaRow}>
          {rating != null && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            </View>
          )}
          {provider.distance_km != null && (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{num(provider.distance_km).toFixed(1)} km</Text>
            </View>
          )}
          {provider.address_city && (
            <View style={styles.metaItem}>
              <Ionicons name="business-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>{provider.address_city}</Text>
            </View>
          )}
        </View>
        {provider.specialties?.length > 0 && (
          <View style={styles.specialtiesRow}>
            {provider.specialties.slice(0, 3).map((s, i) => (
              <View key={i} style={styles.specialtyChip}>
                <Text style={styles.specialtyText}>{s}</Text>
              </View>
            ))}
            {provider.specialties.length > 3 && (
              <Text style={styles.moreText}>+{provider.specialties.length - 3}</Text>
            )}
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, padding: 14, borderRadius: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  avatar: { marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  credentials: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: 13, fontWeight: '600', color: colors.text },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: colors.textSecondary },
  specialtiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  specialtyChip: { backgroundColor: '#2196F3' + '12', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  specialtyText: { fontSize: 10, color: '#2196F3', fontWeight: '500' },
  moreText: { fontSize: 10, color: colors.textLight, alignSelf: 'center' },
});
