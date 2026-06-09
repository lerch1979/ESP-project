import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../constants/colors';
import { useAuth } from '../contexts/AuthContext';

const LANGS = [
  { code: 'hu', label: 'Magyar' },
  { code: 'uk', label: 'Українська' },
  { code: 'tl', label: 'Tagalog' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Hiba', 'Kérjük, töltse ki az összes mezőt.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (error) {
      console.error('[Login] Error:', error.message, error.code);
      let message;
      if (error.response?.data?.message) {
        // Server returned an error message
        message = error.response.data.message;
      } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        message = 'Nem sikerült csatlakozni a szerverhez. Ellenőrizze a hálózati kapcsolatot.';
      } else if (error.code === 'ECONNABORTED') {
        message = 'A szerver nem válaszol (időtúllépés).';
      } else {
        message = 'Bejelentkezés sikertelen. Próbálja újra.';
      }
      Alert.alert('Hiba', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Housing Solutions</Text>
        <Text style={styles.headerSubtitle}>HR-ERP Rendszer</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.langRow}>
          {LANGS.map((l) => (
            <TouchableOpacity
              key={l.code}
              style={[styles.langChip, i18n.language === l.code && styles.langChipActive]}
              onPress={() => i18n.changeLanguage(l.code)}
              activeOpacity={0.7}
            >
              <Text style={[styles.langChipText, i18n.language === l.code && styles.langChipTextActive]}>
                {l.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.title}>{t('login.subtitle')}</Text>

        <Text style={styles.label}>{t('login.email')}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="kiss.janos@abc-kft.hu"
          placeholderTextColor={colors.textLight}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <Text style={styles.label}>{t('login.password')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="password123"
          placeholderTextColor={colors.textLight}
          secureTextEntry
          editable={!loading}
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>{t('login.button')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  form: {
    flex: 1,
    padding: 24,
    marginTop: -20,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  langChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  langChipText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  langChipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
