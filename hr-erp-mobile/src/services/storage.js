import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store exports an empty object on web, so we fall back to localStorage
const isWeb = Platform.OS === 'web';

export async function getItem(key) {
  if (isWeb) {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key, value) {
  if (isWeb) {
    localStorage.setItem(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key) {
  if (isWeb) {
    localStorage.removeItem(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}
