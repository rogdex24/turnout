import type { MutationKey, QueryClient } from "@tanstack/react-query";
import { getRandomBytes } from "expo-crypto";
import type { REPLAYABLE_MUTATION_KEYS } from "./persister";

export type ReplayableName = (typeof REPLAYABLE_MUTATION_KEYS)[number];

/**
 * What a replayable mutation carries. `clientId` is made once, when the person acts, and rides in the variables, so the copy that
 * is saved to disk and sent again after a restart has the same id and the server returns the first result instead of a second one.
 */
export interface Replayable<T> {
  clientId: string;
  payload: T;
}

export function newClientId(): string {
  const hex = Array.from(getRandomBytes(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function replayable<T>(payload: T, clientId: string = newClientId()): Replayable<T> {
  return { clientId, payload };
}

export const mutationKey = (name: ReplayableName): MutationKey => [name];

/**
 * A paused mutation that comes back from disk has lost its function, so the function is registered by key on the client. The
 * screens that own check-in, thread send, feedback and report register theirs here when they land (M3, M4).
 */
export function registerReplayable<T>(
  queryClient: QueryClient,
  name: ReplayableName,
  send: (variables: Replayable<T>) => Promise<unknown>,
) {
  queryClient.setMutationDefaults(mutationKey(name), { mutationFn: send, networkMode: "online", retry: 3 });
}
