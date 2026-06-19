// Thin wrapper over expo-local-authentication. The biometric check runs entirely
// ON-DEVICE (fingerprint/face never leave the phone — that's also the GDPR answer:
// we never receive or store any biometric data). Biometrics only gate access to
// the auth token already held in the device's secure storage (Keychain/Keystore).
import * as LocalAuthentication from 'expo-local-authentication';

// True only if the device has biometric hardware AND the user has enrolled a
// fingerprint/face. If false, we never offer biometric login (password is used).
export async function isBiometricAvailable() {
  try {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    if (!hasHw) return false;
    return await LocalAuthentication.isEnrolledAsync();
  } catch {
    return false;
  }
}

// Prompt the OS biometric dialog. Returns true on success. Pure biometric
// (no device-PIN fallback) — any failure/cancel falls back to our app password.
export async function authenticate(promptMessage) {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      disableDeviceFallback: true,
      cancelLabel: undefined,
    });
    return !!res.success;
  } catch {
    return false;
  }
}
