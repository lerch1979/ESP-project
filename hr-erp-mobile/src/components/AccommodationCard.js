import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import StatusBadge from './StatusBadge';

const typeLabels = {
  studio: 'Stúdió',
  '1br': '1 szobás',
  '2br': '2 szobás',
  '3br': '3 szobás',
  dormitory: 'Munkásszálló',
};

export default function AccommodationCard({ accommodation, onPress }) {
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
            {typeLabels[accommodation.type] || accommodation.type}
          </Text>
          <Text style={styles.capacity}>
            <Ionicons name="people-outline" size={12} color={colors.textLight} />{' '}
            {accommodation.capacity} fő
          </Text>
        </View>
      </View>
      <StatusBadge
        label={accommodation.status === 'available' ? 'Szabad' : accommodation.status === 'occupied' ? 'Foglalt' : 'Karbantartás'}
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
