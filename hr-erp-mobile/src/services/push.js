// Push registration for the resident app. Best-effort: every failure is logged
// and swallowed so it can never block login/logout. Registers the device's Expo
// push token with the backend (POST /push/tokens) and unregisters on logout.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { pushAPI } from './api';
import { getItem, setItem, deleteItem } from './storage';

const STORE_KEY = 'pushToken';

// Foreground behaviour: still show the notification banner while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    undefined
  );
}

// Ask permission + return the Expo push token, or null if unavailable/denied.
async function getExpoToken() {
  if (!Device.isDevice) return null; // no push on simulators/emulators

  if (Platform.OS === 'android') {
    // A default channel is required for Android to display notifications.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Általános',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  const pid = projectId();
  const tokenResp = await Notifications.getExpoPushTokenAsync(pid ? { projectId: pid } : undefined);
  return tokenResp?.data || null;
}

// Register this device with the backend. Call after login / on app resume.
export async function registerPushToken() {
  try {
    const token = await getExpoToken();
    if (!token) return null;
    await pushAPI.register(token, Platform.OS, Device.deviceName || null);
    await setItem(STORE_KEY, token);
    return token;
  } catch (e) {
    console.warn('[push] register failed:', e?.message || e);
    return null;
  }
}

// Unregister on logout so a shared device stops receiving the prior user's pushes.
export async function unregisterPushToken() {
  try {
    const token = await getItem(STORE_KEY);
    if (token) {
      await pushAPI.unregister(token).catch(() => {});
      await deleteItem(STORE_KEY);
    }
  } catch (e) {
    console.warn('[push] unregister failed:', e?.message || e);
  }
}

// Map a notification's data payload → a navigation action. Returns null if the
// type isn't routable. Used by the tap handler in App.js.
export function routeForNotification(data) {
  if (!data || !data.type) return null;
  if (data.type === 'ticket_message' && data.ticket_id) {
    return { tab: 'Tickets', nested: { screen: 'TicketDetail', params: { id: data.ticket_id } } };
  }
  if (data.type === 'expiry_alert') {
    return { tab: 'Calendar' };
  }
  return null;
}
