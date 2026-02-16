import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accommodationsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';

const typeLabels = {
  studio: 'Stúdió',
  '1br': '1 szobás',
  '2br': '2 szobás',
  '3br': '3 szobás',
  dormitory: 'Munkásszálló',
};

const statusLabels = {
  available: 'Szabad',
  occupied: 'Foglalt',
  maintenance: 'Karbantartás alatt',
};

export default function AccommodationDetailScreen({ route }) {
  const { id } = route.params;
  const [accommodation, setAccommodation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchAccommodation = useCallback(async () => {
    try {
      setError(null);
      const response = await accommodationsAPI.getById(id);
      setAccommodation(response.data.accommodation);
    } catch {
      setError('Nem sikerült betölteni az adatokat');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAccommodation();
  }, [fetchAccommodation]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorState message={error} onRetry={fetchAccommodation} />;
  if (!accommodation) return null;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchAccommodation(); }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconContainer}>
            <Ionicons name="home" size={28} color={colors.primary} />
          </View>
          <StatusBadge
            label={statusLabels[accommodation.status] || accommodation.status}
            slug={accommodation.status}
          />
        </View>

        <Text style={styles.name}>{accommodation.name}</Text>
        <Text style={styles.address}>{accommodation.address}</Text>

        <View style={styles.divider} />

        <InfoRow label="Típus" value={typeLabels[accommodation.type] || accommodation.type} />
        <InfoRow label="Kapacitás" value={`${accommodation.capacity} fő`} />
        <InfoRow label="Havi bérleti díj" value={accommodation.monthly_rent ? `${Number(accommodation.monthly_rent).toLocaleString('hu-HU')} Ft` : '-'} />
        <InfoRow label="Jelenlegi alvállalkozó" value={accommodation.current_contractor_name || '-'} />

        {accommodation.notes && (
          <>
            <View style={styles.divider} />
            <Text style={styles.notesLabel}>Megjegyzések</Text>
            <Text style={styles.notes}>{accommodation.notes}</Text>
          </>
        )}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  address: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  notes: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
