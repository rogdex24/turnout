/** Small facts that are not secret: the welcome cards were seen, which notice version this phone accepted, whose cache this is. */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): unknown;
}

export const PREF_KEYS = {
  welcomeSeen: "welcomeSeen",
  acceptedNotice: "acceptedNotice",
  userId: "userId",
  analyticsConsent: "analyticsConsent",
} as const;

export function memoryKv(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
    remove: (key) => map.delete(key),
  };
}

export function welcomeSeen(prefs: KeyValueStore): boolean {
  return prefs.getString(PREF_KEYS.welcomeSeen) === "1";
}

export function acceptedNotice(prefs: KeyValueStore): string | null {
  return prefs.getString(PREF_KEYS.acceptedNotice) ?? null;
}

/** "Share usage data" is off until the person turns it on: no value means no. */
export function analyticsConsent(prefs: KeyValueStore): boolean {
  return prefs.getString(PREF_KEYS.analyticsConsent) === "1";
}

export function setAnalyticsConsent(prefs: KeyValueStore, on: boolean): void {
  prefs.set(PREF_KEYS.analyticsConsent, on ? "1" : "0");
}
