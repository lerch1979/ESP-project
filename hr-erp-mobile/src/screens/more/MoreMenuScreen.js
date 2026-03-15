import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { useAuth } from '../../contexts/AuthContext';

const menuSections = [
  {
    title: 'Projektek & Feladatok',
    items: [
      { key: 'projects', icon: 'folder-outline', label: 'Projektek', screen: 'Projects' },
      { key: 'myTasks', icon: 'checkbox-outline', label: 'Feladataim', screen: 'MyTasks' },
    ],
  },
  {
    title: 'Pénzügy',
    items: [
      { key: 'invoices', icon: 'wallet-outline', label: 'Számlák', screen: 'InvoiceList' },
    ],
  },
  {
    title: 'Tartalom',
    items: [
      { key: 'accommodations', icon: 'home-outline', label: 'Szálláshelyek', screen: 'AccommodationList' },
      { key: 'documents', icon: 'document-text-outline', label: 'Dokumentumok', screen: 'DocumentList' },
      { key: 'videos', icon: 'videocam-outline', label: 'Videók', screen: 'VideoList' },
    ],
  },
  {
    title: 'Kommunikáció',
    items: [
      { key: 'chatbot', icon: 'chatbubbles-outline', label: 'Chatbot', screen: 'ChatbotChat' },
      { key: 'chatbotHistory', icon: 'time-outline', label: 'Korábbi beszélgetések', screen: 'ChatbotList' },
      { key: 'faq', icon: 'help-circle-outline', label: 'FAQ / GYIK', screen: 'FAQ' },
    ],
  },
  {
    title: 'Egyeb',
    items: [
      { key: 'calendar', icon: 'calendar-outline', label: 'Naptar', screen: 'Calendar' },
      { key: 'googleCalendar', icon: 'logo-google', label: 'Google Naptar', screen: 'GoogleCalendar' },
      { key: 'profile', icon: 'person-circle-outline', label: 'Profil', screen: 'Profile' },
    ],
  },
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {menuSections.map((section) => (
        <View key={section.title}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.items.map((item) => (
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
        </View>
      ))}

      <TouchableOpacity
        style={[styles.menuItem, styles.logoutItem]}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={22} color={colors.error} />
        <Text style={[styles.menuLabel, styles.logoutLabel]}>Kijelentkezés</Text>
      </TouchableOpacity>
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
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
  contentContainer: {
    paddingBottom: 20,
  },
  bottomPadding: {
    height: 20,
  },
});
