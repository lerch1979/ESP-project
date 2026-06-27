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
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '../constants/colors';
import { useAuth } from '../contexts/AuthContext';

const LANGS = [
  { code: 'hu', label: 'Magyar' },
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Українська' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'de', label: 'Deutsch' },
];

export default function LoginScreen() {
  const {
    login, biometricAvailable, biometricEnabled, shouldOfferBiometric,
    enableBiometric, disableBiometric, unlockWithBiometric,
  } = useAuth();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // After a successful password login, offer to enable biometric login (once).
  const offerBiometric = () => {
    if (!shouldOfferBiometric) return;
    Alert.alert(
      t('biometric.enableTitle'),
      t('biometric.enablePrompt'),
      [
        { text: t('biometric.notNow'), style: 'cancel', onPress: () => { disableBiometric(); } },
        { text: t('biometric.enable'), onPress: () => { enableBiometric(); } },
      ]
    );
  };

  const handleBiometricUnlock = async () => {
    const ok = await unlockWithBiometric();
    if (!ok) Alert.alert(t('biometric.enableTitle'), t('biometric.failed'));
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(t('common.error'), t('login.errorFields'));
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      offerBiometric();
    } catch (error) {
      console.error('[Login] Error:', error.message, error.code);
      let message;
      if (error.response?.data?.message) {
        // Server returned an error message (already localized server-side)
        message = error.response.data.message;
      } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        message = t('login.errorNetwork');
      } else if (error.code === 'ECONNABORTED') {
        message = t('login.errorTimeout');
      } else {
        message = t('login.errorFailed');
      }
      Alert.alert(t('common.error'), message);
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
        <Text style={styles.langCue}>{t('login.selectLanguage')}</Text>
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
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="password123"
            placeholderTextColor={colors.textLight}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="password"
            editable={!loading}
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((v) => !v)}
            style={styles.eyeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.textLight}
            />
          </TouchableOpacity>
        </View>

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

        {/* Biometric retry — shown when enabled (e.g. after cancelling the
            launch prompt). Unlocks the token already stored on the device. */}
        {biometricAvailable && biometricEnabled && (
          <TouchableOpacity
            style={styles.bioButton}
            onPress={handleBiometricUnlock}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Ionicons name="finger-print" size={20} color={colors.primary} />
            <Text style={styles.bioButtonText}>{t('biometric.unlockButton')}</Text>
          </TouchableOpacity>
        )}
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
  langCue: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
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
  // Password field: a bordered row holding the (borderless) input + eye toggle,
  // so the icon sits inside the same box as the text.
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bioButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
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
