import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { accommodationsAPI } from '../../services/api';
import { colors } from '../../constants/colors';
import StatusBadge from '../../components/StatusBadge';
import { TYPE_KEY, STATUS_KEY } from '../../components/AccommodationCard';
import LoadingScreen from '../../components/LoadingScreen';
import ErrorState from '../../components/ErrorState';
import { formatMoney } from '../../utils/locale';

export default function AccommodationDetailScreen({ route }) {
  const { t, i18n } = useTranslation();
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
      setError(t('common.errorOccurred'));
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
            label={t(STATUS_KEY[accommodation.status] || 'accStatus.maintenance')}
            slug={accommodation.status}
          />
        </View>

        <Text style={styles.name}>{accommodation.name}</Text>
        <Text style={styles.address}>{accommodation.address}</Text>

        <View style={styles.divider} />

        <InfoRow label={t('accommodation.type')} value={TYPE_KEY[accommodation.type] ? t(TYPE_KEY[accommodation.type]) : accommodation.type} />
        <InfoRow label={t('accommodation.capacity')} value={t('accommodation.people', { count: accommodation.capacity })} />
        <InfoRow label={t('accommodation.monthlyRent')} value={accommodation.monthly_rent ? formatMoney(accommodation.monthly_rent, i18n.language) : '-'} />
        <InfoRow label={t('accommodation.currentContractor')} value={accommodation.current_contractor_name || '-'} />

        {accommodation.notes && (
          <>
            <View style={styles.divider} />
            <Text style={styles.notesLabel}>{t('accommodation.notes')}</Text>
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
