import * as SecureStore from 'expo-secure-store';

// Adaptateur natif (iOS / Android) — stockage chiffré dans le keychain
export const storage = {
  getItem:    (key: string)                => SecureStore.getItemAsync(key),
  setItem:    (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string)               => SecureStore.deleteItemAsync(key),
};
