import React, { createContext, useContext, useState, useEffect } from 'react';
import { getItem, setItem, deleteItem } from '../services/storage';
import { authAPI, setSessionExpiredHandler } from '../services/api';
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
  // Igaz, ha a telefonon tárolt belépés érvénytelennek bizonyult. NEM hiba-állapot:
  // ez az, amit a belépő képernyőnek ki kell mondania, hogy a felhasználó tudja,
  // miért nem jutott be, pedig a Face ID sikerült.
  const [sessionExpired, setSessionExpired] = useState(false);
  // 'expired' | 'password_changed' — a teendő ugyanaz (jelszavas belépés), az üzenet nem.
  const [sessionExpiredReason, setSessionExpiredReason] = useState('expired');

  const biometricEnabled = biometricFlag === 'true';
  // Offer the opt-in only when the device supports it AND we've never asked.
  const shouldOfferBiometric = biometricAvailable && biometricFlag == null;

  useEffect(() => {
    // A 401-es ág a tárolt belépést eldobja; innen tudjuk meg, hogy megtörtént.
    setSessionExpiredHandler((ok) => {
      setSessionExpiredReason(ok === 'password_changed' ? 'password_changed' : 'expired');
      setSessionExpired(true);
      setUser(null);
    });
    loadStoredAuth();
    return () => setSessionExpiredHandler(null);
  }, []);

  // A tárolt belépés eldobása — a biometrikus kapcsoló MARAD. A felhasználó nem
  // kapcsolta ki; ha jelszóval belép, a Face ID-nak újra mennie kell.
  const dropStoredSession = async (ok = 'expired') => {
    setSessionExpiredReason(ok);
    await deleteItem('token');
    await deleteItem('refreshToken');
    await deleteItem('user');
    setUser(null);
    setSessionExpired(true);
  };

  // A tárolt belépésből felélesztjük a munkamenetet, majd a /me-vel ELLENŐRIZZÜK.
  // Az ellenőrzés hibáját eddig egy üres catch nyelte le — így egy halott tokennel is
  // „bent" voltunk, csak minden képernyő üresen jött vissza. Mostantól különbséget
  // teszünk a két eset között:
  //   • 401 / sikertelen frissítés → a tárolt belépés HALOTT, ezt ki kell mondani;
  //   • hálózati hiba              → a belépés érvényes, csak nincs net — bent maradunk.
  // Visszatérés: 'ok' | 'session_expired' | 'offline'
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
      setSessionExpired(false);
      return 'ok';
    } catch (err) {
      const halott = err?.response?.status === 401 || err?.response?.status === 403
        || /No refresh token/i.test(err?.message || '');
      if (halott) {
        const kod = err?.response?.data?.code === 'PASSWORD_CHANGED'
          ? 'password_changed' : 'expired';
        await dropStoredSession(kod);
        return 'session_expired';
      }
      // Nincs net vagy időtúllépés: a tárolt belépést NEM dobjuk el — offline is
      // működnie kell az appnak azzal, amit már tud.
      return 'offline';
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
      } else if (flag === 'true') {
        // A biometrikus kapcsoló be van kapcsolva, de nincs mit kinyitni vele.
        // Ez ragadós állapot volt: a belépő képernyő felkínálta a Face ID-t, az
        // sikerült, és semmi nem történt — a végtelenségig.
        setSessionExpired(true);
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
    // A jelszavas belépés EGYBEN a biometrikus adat frissítése is: a fenti három
    // setItem épp most írta felül azt, amit a Face ID kinyit. Ezért tűnik el a
    // figyelmeztetés — nem „elrejtjük", hanem megszűnt az oka.
    setSessionExpired(false);
    if (userData.preferred_language) setLanguageFromProfile(userData.preferred_language);
    registerPushToken();
    // Re-check capability so the LoginScreen can offer the biometric opt-in.
    isBiometricAvailable().then(setBiometricAvailable);
    return userData;
  };

  // Saját jelszóváltás. A HÁROM SecureStore-kulcs frissítése itt nem formalitás: a
  // szerver a váltással minden korábbi tokent érvénytelenít, tehát ha a válaszban kapott
  // újat nem tárolnánk el, a felhasználó a saját jelszóváltásától esne ki — és egyben a
  // biometrikus belépés is halott adatot nyitna ki.
  const changePassword = async (currentPassword, newPassword) => {
    const valasz = await authAPI.changePassword(currentPassword, newPassword);
    const { token, refreshToken } = valasz?.data || {};
    if (token) await setItem('token', token);
    if (refreshToken) await setItem('refreshToken', refreshToken);

    const frissUser = { ...(user || {}), must_change_password: false };
    await setItem('user', JSON.stringify(frissUser));
    setUser(frissUser);
    setSessionExpired(false);
    return true;
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
  // Visszatérés OKKAL, nem puszta igaz/hamissal. A régi boolean volt a hiba másik
  // fele: a hívó minden kudarcra ugyanazt írta ki („a biometrikus azonosítás nem
  // sikerült"), pedig az ujjlenyomat/arc épp hogy sikerült — a tárolt belépés volt
  // halott. Ez a mondat félrevezette a felhasználót, aki emiatt újra és újra a
  // Face ID-t próbálta, ahelyett hogy jelszót írt volna.
  // { ok: true } | { ok: false, reason: 'biometric' | 'session_expired' }
  const unlockWithBiometric = async () => {
    const ok = await authenticate(i18n.t('biometric.unlockPrompt'));
    if (!ok) return { ok: false, reason: 'biometric' };

    const storedUser = await getItem('user');
    const storedToken = await getItem('token');
    if (!storedUser || !storedToken) {
      await dropStoredSession();
      return { ok: false, reason: 'session_expired' };
    }

    const allapot = await hydrateUser(JSON.parse(storedUser));
    if (allapot === 'session_expired') return { ok: false, reason: 'session_expired' };
    return { ok: true };
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
        changePassword,
        sessionExpired,
        sessionExpiredReason,
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
