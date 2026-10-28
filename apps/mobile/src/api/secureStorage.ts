import * as SecureStore from "expo-secure-store";

/** The few secrets the app keeps. The refresh token and the key that encrypts the query cache live here and nowhere else. */
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const SECRET_KEYS = {
  refreshToken: "turnout.refreshToken",
  cacheKey: "turnout.cacheKey",
} as const;

const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** Keychain on iOS, Keystore-backed storage on Android. Never backed up to another phone. */
export const secureStore: SecretStore = {
  get: (key) => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: (key) => SecureStore.deleteItemAsync(key, options),
};

export function memorySecretStore(initial: Record<string, string> = {}): SecretStore & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    remove: async (key) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

/**
 * The key for the encrypted query cache: 24 random bytes as 32 base64 characters, which is the 32 bytes MMKV takes for AES-256 and
 * keeps 192 bits of entropy (32 raw bytes would not survive MMKV's string key). Made once, kept in the keychain.
 */
export async function ensureCacheKey(secure: SecretStore, randomBytes: (count: number) => Uint8Array): Promise<string> {
  const existing = await secure.get(SECRET_KEYS.cacheKey);
  if (existing !== null && existing.length === 32) return existing;
  const key = btoa(String.fromCharCode(...randomBytes(24)));
  await secure.set(SECRET_KEYS.cacheKey, key);
  return key;
}
