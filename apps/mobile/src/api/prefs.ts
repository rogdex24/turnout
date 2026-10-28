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
  goExplained: "goExplained",
  ticketAsked: "ticketAsked",
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

/** The one sentence about how groups work is shown the first time a person goes with a group, then left out. */
export function goExplained(prefs: KeyValueStore): boolean {
  return prefs.getString(PREF_KEYS.goExplained) === "1";
}

export function markGoExplained(prefs: KeyValueStore): void {
  prefs.set(PREF_KEYS.goExplained, "1");
}

/** The notification question is asked once, after the first ticket goes up, whatever the answer. */
export function ticketAsked(prefs: KeyValueStore): boolean {
  return prefs.getString(PREF_KEYS.ticketAsked) === "1";
}

export function markTicketAsked(prefs: KeyValueStore): void {
  prefs.set(PREF_KEYS.ticketAsked, "1");
}

/** The "group confirmed" buzz and animation play once per plan, the first time the person sees that state. */
export function confirmedPlayed(prefs: KeyValueStore, planId: string): boolean {
  return prefs.getString(`confirmedPlayed:${planId}`) === "1";
}

export function markConfirmedPlayed(prefs: KeyValueStore, planId: string): void {
  prefs.set(`confirmedPlayed:${planId}`, "1");
}
