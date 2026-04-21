import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { colors } from '../../constants/colors';
import { useAuth } from '../../contexts/AuthContext';
import { userAPI } from '../../services/api';
import { setItem } from '../../services/storage';

const LANGUAGES = [
  { code: 'hu', name: 'Magyar',     flag: '\uD83C\uDDED\uD83C\uDDFA' },
  { code: 'en', name: 'English',    flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'tl', name: 'Tagalog',    flag: '\uD83C\uDDF5\uD83C\uDDED' },
  { code: 'uk', name: 'Українська', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
  { code: 'de', name: 'Deutsch',    flag: '\uD83C\uDDE9\uD83C\uDDEA' },
];

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { t, i18n: i18nInstance } = useTranslation();
  const currentLang = i18nInstance.language || 'hu';

  const handleLogout = () => {
    Alert.alert('Kijelentkezés', 'Biztosan ki szeretne jelentkezni?', [
      { text: 'Mégse', style: 'cancel' },
      { text: 'Kijelentkezés', style: 'destructive', onPress: logout },
    ]);
  };

  const handleLanguageChange = async (code) => {
    if (code === currentLang) return;
    try {
      await i18n.changeLanguage(code);
    } catch (e) {
      // ignore
    }
    try {
      await setItem('userLanguage', code);
    } catch (e) {
      // ignore persist failure
    }
    // Fire-and-forget backend update
    userAPI.updateLanguage(code).catch(() => {
      // Network failure shouldn't break UI
    });
  };

  if (!user) return null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={colors.primary} />
        </View>
        <Text style={styles.name}>
          {user.lastName} {user.firstName}
        </Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      <View style={styles.card}>
        <InfoRow label="E-mail" value={user.email} />
        {user.contractor && (
          <InfoRow label="Alvállalkozó" value={user.contractor.name} />
        )}
        {user.roles && user.roles.length > 0 && (
          <InfoRow label="Szerepkörök" value={user.roles.join(', ')} />
        )}
      </View>

      {/* Language picker */}
      <View style={styles.langCard}>
        <Text style={styles.langTitle}>{t('profile.language', 'Nyelv')}</Text>
        <View style={styles.langList}>
          {LANGUAGES.map((lang) => {
            const active = lang.code === currentLang;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langButton, active && styles.langButtonActive]}
                onPress={() => handleLanguageChange(lang.code)}
                activeOpacity={0.7}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={[styles.langName, active && styles.langNameActive]}>
                  {lang.name}
                </Text>
                {active && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={colors.primary}
                    style={{ marginLeft: 'auto' }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color={colors.white} />
        <Text style={styles.logoutText}>Kijelentkezés</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
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
  headerCard: {
    backgroundColor: colors.white,
    margin: 16,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  email: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
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
    flex: 1,
    textAlign: 'right',
  },
  langCard: {
    backgroundColor: colors.white,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  langTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  langList: {
    gap: 8,
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    marginBottom: 8,
  },
  langButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
    borderWidth: 2,
  },
  langFlag: {
    fontSize: 22,
    marginRight: 12,
  },
  langName: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  langNameActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  logoutText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
