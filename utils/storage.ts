import { Platform } from 'react-native';

function getSecureStore() {
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

const CHUNK_SIZE = 1800; // safely under the 2048-byte SecureStore limit

// Split large values across multiple keyed chunks so everything stays in SecureStore.

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
    return;
  }
  const store = getSecureStore();
  if (value.length <= CHUNK_SIZE) {
    // Clean up any old chunks from a previous large value
    await _deleteChunks(store, key);
    await store.setItemAsync(key, value);
    return;
  }
  // Delete the plain key (may exist from a previous small value)
  await store.deleteItemAsync(key).catch(() => {});
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  await Promise.all(
    chunks.map((chunk, i) => store.setItemAsync(`${key}__chunk_${i}`, chunk))
  );
  await store.setItemAsync(`${key}__chunks`, String(chunks.length));
}

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  const store = getSecureStore();
  const countStr = await store.getItemAsync(`${key}__chunks`);
  if (countStr !== null) {
    const count = parseInt(countStr, 10);
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => store.getItemAsync(`${key}__chunk_${i}`))
    );
    if (parts.some(p => p === null)) return null;
    return parts.join('');
  }
  return store.getItemAsync(key);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
    return;
  }
  const store = getSecureStore();
  await store.deleteItemAsync(key).catch(() => {});
  await _deleteChunks(store, key);
}

async function _deleteChunks(
  store: typeof import('expo-secure-store'),
  key: string,
): Promise<void> {
  const countStr = await store.getItemAsync(`${key}__chunks`).catch(() => null);
  if (countStr === null) return;
  const count = parseInt(countStr, 10);
  await Promise.all([
    store.deleteItemAsync(`${key}__chunks`).catch(() => {}),
    ...Array.from({ length: count }, (_, i) =>
      store.deleteItemAsync(`${key}__chunk_${i}`).catch(() => {})
    ),
  ]);
}

// Convenience aliases (same implementation — kept for clarity at call sites)
export const setSecureItem  = setItem;
export const getSecureItem  = getItem;
export const deleteSecureItem = deleteItem;
