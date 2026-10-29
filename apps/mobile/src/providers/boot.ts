import Constants from "expo-constants";
import { telemetry } from "../analytics";
import { apiBaseUrl } from "../api/baseUrl";
import { clearImageCache } from "../api/imageCache";
import { openCacheStore, openPrefs } from "../api/mmkvStore";
import { secureStore } from "../api/secureStorage";
import { createStubWhatsAppOtp } from "../api/whatsappOtp";
import { createWhatsAppOtp } from "../api/whatsappOtpNative";
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
  const prefs = openPrefs();
  return createAppDeps({
    secure: secureStore,
    prefs,
    cacheStore,
    origin: apiBaseUrl(),
    appVersion: Constants.expoConfig?.version ?? "0.0.0",
    clearImages: clearImageCache,
    stopTelemetry: () => telemetry(prefs).setConsent(false),
    // The e2e build runs against a fake sender with no WhatsApp on the device, so it takes the stub and the codes come from the test route.
    whatsappOtp: Constants.expoConfig?.extra?.variant === "e2e" ? createStubWhatsAppOtp({ installed: true }) : createWhatsAppOtp(),
  });
}
