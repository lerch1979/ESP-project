import React, { createContext, useContext, useState, useEffect } from 'react';
import { getItem, setItem, deleteItem } from '../services/storage';
import { authAPI } from '../services/api';
import i18n, { setLanguageFromProfile } from '../i18n';
import { registerPushToken, unregisterPushToken } from '../services/push';
import { isBiometricAvailable, authenticate } from '../services/biometric';

const AuthContext = createContext(null);
const BIO_KEY = 'biometricEnabled'; // SecureStore flag: null (never asked) | 'true' | 'false'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Biometrics gate the auth token already held in SecureStore. The check is
  // 100% on-device; no biometric data ever reaches the backend.
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricFlag, setBiometricFlag] = useState(null); // raw stored value

  const biometricEnabled = biometricFlag === 'true';
  // Offer the opt-in only when the device supports it AND we've never asked.
  const shouldOfferBiometric = biometricAvailable && biometricFlag == null;

  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Set the in-memory session from a stored user, then revalidate via /me.
  const hydrateUser = async (parsed) => {
    setUser(parsed);
    if (parsed.preferred_language) setLanguageFromProfile(parsed.preferred_language);
    try {
      const response = await authAPI.getMe();
      const meUser = response.data?.user || response.user;
      setUser(meUser);
      await setItem('user', JSON.stringify(meUser));
      if (meUser.preferred_language) setLanguageFromProfile(meUser.preferred_language);
      registerPushToken();
    } catch {
      // Token might be expired; the refresh interceptor handles it.
    }
  };

  const loadStoredAuth = async () => {
    try {
      const token = await getItem('token');
      const storedUser = await getItem('user');
      const flag = await getItem(BIO_KEY);
      setBiometricFlag(flag);
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);

      if (token && storedUser) {
        // Gate ON + device capable → require biometric before unlocking.
        // On failure/cancel we leave the user logged out → the LoginScreen
        // (password) is the fallback, plus a "unlock with biometrics" retry.
        if (flag === 'true' && available) {
          const ok = await authenticate(i18n.t('biometric.unlockPrompt'));
          if (!ok) { setIsLoading(false); return; }
        }
        await hydrateUser(JSON.parse(storedUser));
      }
    } catch {
      // No stored auth
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await authAPI.login(email, password);
    const { token, refreshToken, user: userData } = response.data || response;

    await setItem('token', token);
    await setItem('refreshToken', refreshToken);
    await setItem('user', JSON.stringify(userData));

    setUser(userData);
    if (userData.preferred_language) setLanguageFromProfile(userData.preferred_language);
    registerPushToken();
    // Re-check capability so the LoginScreen can offer the biometric opt-in.
    isBiometricAvailable().then(setBiometricAvailable);
    return userData;
  };

  const logout = async () => {
    await unregisterPushToken();
    try {
      await authAPI.logout();
    } catch {
      // Ignore logout API errors
    }
    await deleteItem('token');
    await deleteItem('refreshToken');
    await deleteItem('user');
    // Reset the biometric opt-in so the next user on this device is asked fresh.
    await deleteItem(BIO_KEY);
    setBiometricFlag(null);
    setUser(null);
  };

  // Enable biometric login (gate ON). Verifies the device is capable first.
  const enableBiometric = async () => {
    const available = await isBiometricAvailable();
    setBiometricAvailable(available);
    if (!available) return false;
    await setItem(BIO_KEY, 'true');
    setBiometricFlag('true');
    return true;
  };

  // Turn the gate OFF (does NOT log out — the token stays for auto-login). Also
  // used to record a "not now" decline so we don't keep asking.
  const disableBiometric = async () => {
    await setItem(BIO_KEY, 'false');
    setBiometricFlag('false');
  };

  // Retry unlock from the LoginScreen when the launch prompt was cancelled.
  const unlockWithBiometric = async () => {
    const ok = await authenticate(i18n.t('biometric.unlockPrompt'));
    if (!ok) return false;
    const storedUser = await getItem('user');
    if (!storedUser) return false;
    await hydrateUser(JSON.parse(storedUser));
    return true;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        biometricAvailable,
        biometricEnabled,
        shouldOfferBiometric,
        enableBiometric,
        disableBiometric,
        unlockWithBiometric,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
