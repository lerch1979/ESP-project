import React from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { useAuth } from '../../contexts/AuthContext';

const menuItems = [
  { key: 'accommodations', icon: 'home-outline', label: 'Szálláshelyek', screen: 'AccommodationList' },
  { key: 'documents', icon: 'document-text-outline', label: 'Dokumentumok', screen: 'DocumentList' },
  { key: 'googleCalendar', icon: 'logo-google', label: 'Google Naptár', screen: 'GoogleCalendar' },
  { key: 'profile', icon: 'person-circle-outline', label: 'Profil', screen: 'Profile' },
];

export default function MoreMenuScreen({ navigation }) {
  const { logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Kijelentkezés', 'Biztosan ki szeretne jelentkezni?', [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Kijelentkezés', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      {menuItems.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.menuItem}
          onPress={() => navigation.navigate(item.screen)}
          activeOpacity={0.7}
        >
          <Ionicons name={item.icon} size={22} color={colors.primary} />
          <Text style={styles.menuLabel}>{item.label}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.menuItem, styles.logoutItem]}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={22} color={colors.error} />
        <Text style={[styles.menuLabel, styles.logoutLabel]}>Kijelentkezés</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 14,
  },
  logoutItem: {
    marginTop: 24,
  },
  logoutLabel: {
    color: colors.error,
  },
});
