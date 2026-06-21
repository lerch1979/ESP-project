import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../constants/colors';
import StatusBadge from './StatusBadge';

export const TYPE_KEY = {
  studio: 'accType.studio',
  '1br': 'accType.br1',
  '2br': 'accType.br2',
  '3br': 'accType.br3',
  dormitory: 'accType.dormitory',
};
export const STATUS_KEY = {
  available: 'accStatus.available',
  occupied: 'accStatus.occupied',
  maintenance: 'accStatus.maintenance',
};

export default function AccommodationCard({ accommodation, onPress }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Ionicons name="home" size={22} color={colors.primary} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{accommodation.name}</Text>
        <Text style={styles.address} numberOfLines={1}>{accommodation.address}</Text>
        <View style={styles.meta}>
          <Text style={styles.type}>
            {TYPE_KEY[accommodation.type] ? t(TYPE_KEY[accommodation.type]) : accommodation.type}
          </Text>
          <Text style={styles.capacity}>
            <Ionicons name="people-outline" size={12} color={colors.textLight} />{' '}
            {t('accommodation.people', { count: accommodation.capacity })}
          </Text>
        </View>
      </View>
      <StatusBadge
        label={t(STATUS_KEY[accommodation.status] || 'accStatus.maintenance')}
        slug={accommodation.status}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  address: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
  meta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  type: {
    fontSize: 12,
    color: colors.textLight,
  },
  capacity: {
    fontSize: 12,
    color: colors.textLight,
  },
});
