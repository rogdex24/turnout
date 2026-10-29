import type { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import { type KeyValueStore, PREF_KEYS, welcomeSeen } from "./prefs";

export interface LocalWipeParts {
  prefs: KeyValueStore;
  queryClient: QueryClient;
  persister: Persister;
  /** Re-reads the store and tells the router, so the gates move the moment the wipe is done. */
  flags: { refresh(): void };
  /** Empties the image cache. Failing to is not a reason to stay signed in. */
  clearImages: () => Promise<void>;
  /** Stops Sentry and PostHog. The next person on the phone has not agreed to anything. */
  stopTelemetry: () => void;
}

export interface LocalWipe {
  /** Empties what this phone holds about the person. Runs from `session.onSignedOut`, before the keychain is emptied. */
  run(): Promise<void>;
  /** The next `run` also forgets that the welcome cards were seen, so the phone starts at Welcome as a new install does. */
  forgetWelcomeToo(): void;
}

/**
 * Everything local, in one place: the query cache (memory and the encrypted file), the small facts in MMKV, the image cache and
 * the usage-data choice. The refresh token and the member id go with the session itself. An ordinary sign-out keeps the welcome
 * cards seen, since they teach the app and say nothing about the person. Deleting an account does not.
 */
export function createLocalWipe({ prefs, queryClient, persister, flags, clearImages, stopTelemetry }: LocalWipeParts): LocalWipe {
  let forgetWelcome = false;
  return {
    forgetWelcomeToo() {
      forgetWelcome = true;
    },
    async run() {
      const keepWelcome = welcomeSeen(prefs) && !forgetWelcome;
      forgetWelcome = false;
      stopTelemetry();
      queryClient.clear();
      await persister.removeClient();
      prefs.clearAll();
      if (keepWelcome) prefs.set(PREF_KEYS.welcomeSeen, "1");
      flags.refresh();
      await clearImages().catch(() => {});
    },
  };
}

/** The account is gone and every token with it: end the session on this phone only, and wipe the phone including the welcome cards. */
export async function endAfterDeletion(session: { endLocal(): Promise<void> }, wipe: LocalWipe): Promise<void> {
  wipe.forgetWelcomeToo();
  await session.endLocal();
}
