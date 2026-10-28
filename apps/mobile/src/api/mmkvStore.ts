import { getRandomBytes } from "expo-crypto";
import { createMMKV } from "react-native-mmkv";
import type { KeyValueStore } from "./prefs";
import { ensureCacheKey, type SecretStore } from "./secureStorage";

/** Small facts that are not secret (welcome seen, accepted notice version, whose cache this is). Plain MMKV; nothing sensitive goes here. */
export function openPrefs(): KeyValueStore {
  return createMMKV({ id: "turnout-prefs" });
}

/** The query cache file: AES-256 with a key that only the keychain holds, so the file on disk reads as noise. */
export async function openCacheStore(secure: SecretStore): Promise<KeyValueStore> {
  const encryptionKey = await ensureCacheKey(secure, getRandomBytes);
  return createMMKV({ id: "turnout-cache", encryptionKey, encryptionType: "AES-256" });
}
