import Constants from "expo-constants";
import { apiBaseUrl } from "../api/baseUrl";
import { openCacheStore, openPrefs } from "../api/mmkvStore";
import { secureStore } from "../api/secureStorage";
import { type AppDeps, createAppDeps } from "./deps";

let booting: Promise<AppDeps> | null = null;

/**
 * Opens the real stores (keychain, MMKV, the encrypted cache file) and wires the app once. A second call, for a remount or fast
 * refresh, gets the same promise. Jest replaces this module with in-memory parts, because MMKV does not load there.
 */
export function bootApp(): Promise<AppDeps> {
  booting ??= start().catch((error: unknown) => {
    booting = null;
    throw error;
  });
  return booting;
}

async function start(): Promise<AppDeps> {
  const cacheStore = await openCacheStore(secureStore);
  return createAppDeps({
    secure: secureStore,
    prefs: openPrefs(),
    cacheStore,
    origin: apiBaseUrl(),
    appVersion: Constants.expoConfig?.version ?? "0.0.0",
  });
}
