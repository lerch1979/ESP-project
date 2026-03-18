import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import carepathAPI from '../../services/carepath/api';
import { num } from '../../components/WellMind/helpers';

export default function ProviderDetailsScreen({ navigation, route }) {
  const { providerId } = route.params;
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await carepathAPI.providers.getById(providerId);
        setProvider(response.data);
      } catch { setError('Nem sikerült betölteni.'); }
      finally { setLoading(false); }
    })();
  }, [providerId]);

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (error || !provider) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
        <Text style={styles.errorText}>{error || 'Nem található.'}</Text>
      </View>
    );
  }

  const rating = num(provider.rating, null);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.avatarLarge}>
          <Ionicons name="person-circle-outline" size={80} color={colors.primary} />
        </View>
        <Text style={styles.name}>{provider.full_name}</Text>
        {provider.credentials && <Text style={styles.credentials}>{provider.credentials}</Text>}
        {provider.provider_type && <Text style={styles.providerType}>{provider.provider_type}</Text>}

        {rating != null && (
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons key={s} name={s <= Math.round(rating) ? 'star' : 'star-outline'} size={20} color={colors.warning} />
            ))}
            <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
          </View>
        )}
      </View>

      {/* Bio */}
      {provider.bio && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bemutatkozás</Text>
          <Text style={styles.bioText}>{provider.bio}</Text>
        </View>
      )}

      {/* Specialties */}
      {provider.specialties?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Szakterületek</Text>
          <View style={styles.chipsRow}>
            {provider.specialties.map((s, i) => (
              <View key={i} style={styles.specialtyChip}><Text style={styles.specialtyText}>{s}</Text></View>
            ))}
          </View>
        </View>
      )}

      {/* Languages */}
      {provider.languages?.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nyelvek</Text>
          <View style={styles.chipsRow}>
            {provider.languages.map((l, i) => (
              <View key={i} style={styles.langChip}><Text style={styles.langText}>{l}</Text></View>
            ))}
          </View>
        </View>
      )}

      {/* Location */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Helyszín</Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={20} color={colors.primary} />
          <Text style={styles.locationText}>
            {[provider.address_city, provider.address_street].filter(Boolean).join(', ') || 'Nincs megadva'}
          </Text>
        </View>
      </View>

      {/* Availability */}
      {provider.availability_hours && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Elérhetőség</Text>
          <View style={styles.availRow}>
            <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.availText}>
              {typeof provider.availability_hours === 'string'
                ? provider.availability_hours
                : JSON.stringify(provider.availability_hours)}
            </Text>
          </View>
        </View>
      )}

      {/* Contact */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Elérhetőség</Text>
        {provider.phone && (
          <View style={styles.contactRow}><Ionicons name="call-outline" size={18} color={colors.textSecondary} /><Text style={styles.contactText}>{provider.phone}</Text></View>
        )}
        {provider.email && (
          <View style={styles.contactRow}><Ionicons name="mail-outline" size={18} color={colors.textSecondary} /><Text style={styles.contactText}>{provider.email}</Text></View>
        )}
      </View>

      {/* Book Button */}
      <TouchableOpacity
        style={styles.bookBtn}
        onPress={() => navigation.navigate('Booking', { providerId: provider.id })}
      >
        <Ionicons name="calendar-outline" size={20} color={colors.white} />
        <Text style={styles.bookBtnText}>Időpont foglalás</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  headerCard: {
    backgroundColor: colors.white, margin: 16, padding: 24, borderRadius: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  avatarLarge: { marginBottom: 8 },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  credentials: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  providerType: { fontSize: 13, color: colors.primary, fontWeight: '500', marginTop: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  ratingValue: { fontSize: 15, fontWeight: '600', color: colors.text, marginLeft: 4 },
  card: {
    backgroundColor: colors.white, marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 10 },
  bioText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  specialtyChip: { backgroundColor: '#2196F3' + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  specialtyText: { fontSize: 12, color: '#2196F3', fontWeight: '500' },
  langChip: { backgroundColor: colors.primary + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  langText: { fontSize: 12, color: colors.primary, fontWeight: '500' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { fontSize: 14, color: colors.text },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  availText: { fontSize: 14, color: colors.textSecondary, flex: 1 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  contactText: { fontSize: 14, color: colors.text },
  bookBtn: {
    flexDirection: 'row', gap: 8, backgroundColor: '#2196F3', marginHorizontal: 16, paddingVertical: 16,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  bookBtnText: { color: colors.white, fontSize: 16, fontWeight: '600' },
});
