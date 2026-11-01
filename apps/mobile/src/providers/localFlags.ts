import { acceptedNotice, type KeyValueStore, PREF_KEYS, welcomeSeen } from "../api/prefs";

export interface LocalFlagsSnapshot {
  welcomeSeen: boolean;
  acceptedNotice: string | null;
}

/**
 * The two facts that live on this phone and move the gates before sign-in: the welcome cards were seen, and which notice version was
 * agreed to. A store with a snapshot, so the router re-reads the gates the moment either changes (`useSyncExternalStore`).
 */
export interface LocalFlags {
  getSnapshot(): LocalFlagsSnapshot;
  subscribe(listener: () => void): () => void;
  markWelcomeSeen(): void;
  acceptNotice(version: string): void;
  /** The store was changed from outside (the wipe at sign-out): read it again and tell the router. */
  refresh(): void;
}

export function createLocalFlags(prefs: KeyValueStore): LocalFlags {
  const listeners = new Set<() => void>();
  const read = (): LocalFlagsSnapshot => ({ welcomeSeen: welcomeSeen(prefs), acceptedNotice: acceptedNotice(prefs) });
  let snapshot = read();

  function changed() {
    snapshot = read();
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    markWelcomeSeen() {
      prefs.set(PREF_KEYS.welcomeSeen, "1");
      changed();
    },
    acceptNotice(version) {
      prefs.set(PREF_KEYS.acceptedNotice, version);
      changed();
    },
    refresh: changed,
  };
}
