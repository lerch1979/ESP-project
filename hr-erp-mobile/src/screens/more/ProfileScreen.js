import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Switch,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import i18n from '../../i18n';
import { colors } from '../../constants/colors';
import { useAuth } from '../../contexts/AuthContext';
import { userAPI, profileAPI, UPLOADS_BASE_URL } from '../../services/api';
import { setItem } from '../../services/storage';

const LANGUAGES = [
  { code: 'hu', name: 'Magyar',     flag: '\uD83C\uDDED\uD83C\uDDFA' },
  { code: 'en', name: 'English',    flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'tl', name: 'Tagalog',    flag: '\uD83C\uDDF5\uD83C\uDDED' },
  { code: 'uk', name: 'Українська', flag: '\uD83C\uDDFA\uD83C\uDDE6' },
  { code: 'de', name: 'Deutsch',    flag: '\uD83C\uDDE9\uD83C\uDDEA' },
];

export default function ProfileScreen() {
  const { user, logout, biometricAvailable, biometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const { t, i18n: i18nInstance } = useTranslation();
  const currentLang = i18nInstance.language || 'hu';

  const toggleBiometric = async (next) => {
    if (next) {
      const ok = await enableBiometric();
      if (!ok) Alert.alert(t('biometric.enableTitle'), t('biometric.unavailable'));
    } else {
      await disableBiometric();
    }
  };

  // Profile photo — self-scoped (own employee). hasEmployee gates the UI so a
  // staff user with no employee row doesn't see a broken photo control.
  const [photoUrl, setPhotoUrl] = useState(null);
  const [hasEmployee, setHasEmployee] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingUri, setPendingUri] = useState(null); // picked+resized, awaiting confirm

  useEffect(() => {
    let active = true;
    profileAPI.getMyEmployee()
      .then((r) => { if (active) { setHasEmployee(true); setPhotoUrl(r?.data?.profile_photo_url || null); } })
      .catch(() => { if (active) setHasEmployee(false); });
    return () => { active = false; };
  }, []);

  // Step 1: pick + resize → stage a PREVIEW (no upload yet).
  const pick = useCallback(async (source) => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('profile.photo.permTitle'), t('profile.photo.permBody'));
        return;
      }
      const opts = { allowsEditing: true, aspect: [1, 1], quality: 1 };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ['images'] });
      if (result.canceled || !result.assets || !result.assets[0]) return;

      // Client-side downscale + compress so the upload stays small; the server
      // re-resizes to canonical thumb/orig too.
      const manip = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPendingUri(manip.uri); // → preview + explicit Upload button
    } catch (e) {
      console.warn('[profile] photo pick failed:', e?.message || e);
      Alert.alert(t('common.error'), t('profile.photo.uploadError'));
    }
  }, [t]);

  // Step 2: explicit confirm → actually upload the staged preview.
  const confirmUpload = useCallback(async () => {
    if (!pendingUri) return;
    try {
      setUploading(true);
      const res = await profileAPI.uploadPhoto(pendingUri);
      setPhotoUrl(res?.data?.profile_photo_url || null);
      setPendingUri(null);
    } catch (e) {
      const detail = e?.response?.data?.message || e?.message || String(e);
      console.warn('[profile] photo upload failed:', detail);
      Alert.alert(t('common.error'), `${t('profile.photo.uploadError')}\n\n${detail}`);
      // keep pendingUri so the user can retry without re-picking
    } finally {
      setUploading(false);
    }
  }, [pendingUri, t]);

  const discardPending = useCallback(() => setPendingUri(null), []);

  const removePhoto = useCallback(async () => {
    try {
      setUploading(true);
      await profileAPI.deletePhoto();
      setPhotoUrl(null);
    } catch (e) {
      Alert.alert(t('common.error'), t('profile.photo.uploadError'));
    } finally {
      setUploading(false);
    }
  }, [t]);

  const openPhotoOptions = useCallback(() => {
    if (uploading) return;
    const buttons = [
      { text: t('profile.photo.takePhoto'), onPress: () => pick('camera') },
      { text: t('profile.photo.chooseGallery'), onPress: () => pick('library') },
    ];
    if (photoUrl) {
      buttons.push({ text: t('profile.photo.remove'), style: 'destructive', onPress: removePhoto });
    }
    buttons.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(t(photoUrl ? 'profile.photo.change' : 'profile.photo.add'), undefined, buttons);
  }, [uploading, photoUrl, pick, removePhoto, t]);

  const handleLogout = () => {
    Alert.alert(t('menu.logout'), t('settings.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('menu.logout'), style: 'destructive', onPress: logout },
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
    // Persist to the backend (the DB is the source for notifications/emails).
    // Surface failures so a language that didn't save isn't silently lost.
    try {
      await userAPI.updateLanguage(code);
    } catch (e) {
      Alert.alert(t('common.error'), t('settings.languageSaveFailed'));
    }
  };

  if (!user) return null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCard}>
        <TouchableOpacity
          onPress={openPhotoOptions}
          disabled={uploading || !hasEmployee || !!pendingUri}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t(photoUrl ? 'profile.photo.change' : 'profile.photo.add')}
        >
          <View style={styles.avatar}>
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : pendingUri ? (
              <Image source={{ uri: pendingUri }} style={styles.avatarImg} />
            ) : photoUrl ? (
              <Image source={{ uri: `${UPLOADS_BASE_URL}${photoUrl}` }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person" size={40} color={colors.primary} />
            )}
            {hasEmployee && !uploading && !pendingUri && (
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={14} color={colors.white} />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>
          {user.lastName} {user.firstName}
        </Text>
        <Text style={styles.email}>{user.email}</Text>

        {/* Preview → confirm step: an explicit Upload button (and Discard). */}
        {pendingUri ? (
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[styles.previewBtn, styles.uploadBtn, uploading && styles.previewBtnDisabled]}
              onPress={confirmUpload}
              disabled={uploading}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={18} color={colors.white} />
              <Text style={styles.uploadBtnText}>{t('profile.photo.upload')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.previewBtn, styles.discardBtn]}
              onPress={discardPending}
              disabled={uploading}
              activeOpacity={0.85}
            >
              <Text style={styles.discardBtnText}>{t('profile.photo.discard')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          hasEmployee && <Text style={styles.photoNotice}>{t('profile.photo.adminCanSee')}</Text>
        )}
      </View>

      <View style={styles.card}>
        <InfoRow label="E-mail" value={user.email} />
        {user.contractor && (
          <InfoRow label={t('menu.contractor')} value={user.contractor.name} />
        )}
        {user.roles && user.roles.length > 0 && (
          <InfoRow label={t('menu.roles')} value={user.roles.join(', ')} />
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

      {/* Biometric login toggle — only when the device supports it. */}
      {biometricAvailable && (
        <View style={styles.bioCard}>
          <View style={styles.bioRow}>
            <View style={styles.bioRowLeft}>
              <Ionicons name="finger-print" size={22} color={colors.primary} />
              <View style={styles.bioTextWrap}>
                <Text style={styles.bioLabel}>{t('biometric.toggleLabel')}</Text>
                <Text style={styles.bioHint}>{t('biometric.toggleHint')}</Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={toggleBiometric}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color={colors.white} />
        <Text style={styles.logoutText}>{t('menu.logout')}</Text>
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
    position: 'relative',
  },
  avatarImg: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  editBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  photoNotice: {
    fontSize: 12,
    color: colors.textLight,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    alignItems: 'center',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  previewBtnDisabled: { opacity: 0.6 },
  uploadBtn: { backgroundColor: colors.primary },
  uploadBtnText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  discardBtn: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  discardBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
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
  bioCard: {
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
  bioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bioRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, paddingRight: 12 },
  bioTextWrap: { flex: 1 },
  bioLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  bioHint: { fontSize: 12, color: colors.textLight, marginTop: 2 },
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
