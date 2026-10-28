import { useQuery } from "@tanstack/react-query";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { useSyncExternalStore } from "react";
import { meQuery } from "../api/me";
import { type Gate, resolveGate } from "../model/gates";
import { useDeps } from "./AppProviders";

export function useApi() {
  return useDeps().api;
}

export function useSessionState() {
  const { session } = useDeps();
  return useSyncExternalStore(session.subscribe, session.getState);
}

export function useLocalFlags() {
  const { localFlags } = useDeps();
  const snapshot = useSyncExternalStore(localFlags.subscribe, localFlags.getSnapshot);
  return { ...snapshot, markWelcomeSeen: localFlags.markWelcomeSeen, acceptNotice: localFlags.acceptNotice };
}

/** The signed-in member. Waits for the disk cache first, so an offline start has an answer. */
export function useMe() {
  const { api } = useDeps();
  const { status } = useSessionState();
  return useQuery({ ...meQuery(api), enabled: status === "signed_in" });
}

/** Where the router sends a person, from the keychain, the flags on this phone and `me`. */
export function useGate(): Gate {
  const session = useSessionState();
  const flags = useLocalFlags();
  const me = useMe();
  // A first load that failed for lack of a network is paused, not errored, until the network is back. Nothing is saved to show, so say so.
  const stalledOffline = me.status === "pending" && me.fetchStatus === "paused" && me.failureCount > 0;
  return resolveGate({
    session: session.status,
    welcomeSeen: flags.welcomeSeen,
    acceptedNotice: flags.acceptedNotice,
    noticeVersion: NOTICE_VERSION,
    me: { data: session.status === "signed_in" ? me.data : undefined, failed: me.isError || stalledOffline },
  });
}
