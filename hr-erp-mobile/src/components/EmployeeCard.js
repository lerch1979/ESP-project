import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { UPLOADS_BASE_URL } from '../services/api';
import StatusBadge from './StatusBadge';

export default function EmployeeCard({ employee, onPress }) {
  const photoUrl = employee.profile_photo_url
    ? `${UPLOADS_BASE_URL}${employee.profile_photo_url}`
    : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={24} color={colors.primary} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>
          {employee.last_name} {employee.first_name}
        </Text>
        <Text style={styles.detail}>{employee.employee_number}</Text>
        {employee.position && (
          <Text style={styles.detail} numberOfLines={1}>{employee.position}</Text>
        )}
      </View>
      <StatusBadge
        label={employee.status_name}
        slug={employee.status_slug}
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  detail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
