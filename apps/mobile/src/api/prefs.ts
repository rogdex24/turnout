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
