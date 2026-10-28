/** Whether the last request got an answer. A failed fetch flips it to offline, any response flips it back. Screens read it for the offline bar. */
type Listener = () => void;

export interface Connectivity {
  isOffline(): boolean;
  report(online: boolean): void;
  subscribe(listener: Listener): () => void;
}

export function createConnectivity(): Connectivity {
  let offline = false;
  const listeners = new Set<Listener>();
  return {
    isOffline: () => offline,
    report(online) {
      if (offline === !online) return;
      offline = !online;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
