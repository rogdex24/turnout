import Constants from "expo-constants";
import { Platform } from "react-native";

type Os = "android" | "ios";
type ApiUrls = { android: string; ios: string };

/**
 * The API base URL: EXPO_PUBLIC_API_URL when the bundler inlined one, otherwise the per-platform pair app.config.ts put in
 * `extra.apiUrl` (the Android emulator reaches the host at 10.0.2.2, the iOS simulator at localhost).
 */
export function pickApiUrl(explicit: string | undefined, extra: ApiUrls | undefined, os: Os): string {
  if (explicit) return explicit;
  if (extra?.[os]) return extra[os];
  throw new Error("No API URL. Set EXPO_PUBLIC_API_URL.");
}

export function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra?.apiUrl as ApiUrls | undefined;
  return pickApiUrl(process.env.EXPO_PUBLIC_API_URL, extra, Platform.OS === "ios" ? "ios" : "android");
}
