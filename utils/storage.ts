import { Platform } from 'react-native';

function getSecureStore() {
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return getSecureStore().getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  await getSecureStore().setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  await getSecureStore().deleteItemAsync(key);
}
