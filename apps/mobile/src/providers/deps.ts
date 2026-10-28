import type { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import { createSession, revokeOnServer, type Session } from "../api/auth";
import { type ApiClient, createApiClient, fetchTransport, type Transport } from "../api/client";
import { type Connectivity, createConnectivity } from "../api/connectivity";
import { cacheBuster, createCachePersister } from "../api/persister";
import type { KeyValueStore } from "../api/prefs";
import { createAppQueryClient, followConnectivity } from "../api/queryClient";
import type { SecretStore } from "../api/secureStorage";
import { createLocalFlags, type LocalFlags } from "./localFlags";

/** Everything the screens reach through context. Built once at start by `bootApp`, or by tests from in-memory parts. */
export interface AppDeps {
  session: Session;
  api: ApiClient;
  connectivity: Connectivity;
  queryClient: QueryClient;
  persister: Persister;
  /** The buster for the disk cache as this run started: the app version and the person who was signed in. */
  buster: string;
  prefs: KeyValueStore;
  localFlags: LocalFlags;
  appVersion: string;
}

export interface DepParts {
  secure: SecretStore;
  prefs: KeyValueStore;
  /** The encrypted store for the query cache. */
  cacheStore: KeyValueStore;
  origin: string;
  transport?: Transport;
  appVersion: string;
  queryClient?: QueryClient;
  now?: () => number;
}

/** The one wiring of session, client, cache and local flags. The sign-out hook empties the cache and the notice, so the next person on the phone starts clean. */
export async function createAppDeps(parts: DepParts): Promise<AppDeps> {
  const { secure, prefs, cacheStore, origin, transport = fetchTransport, appVersion } = parts;
  const connectivity = createConnectivity();
  const queryClient = parts.queryClient ?? createAppQueryClient();
  const localFlags = createLocalFlags(prefs);

  // The session needs the client to end itself on the server, and the client needs the session for tokens.
  let api: ApiClient;
  const session = createSession({
    secure,
    prefs,
    origin,
    transport,
    now: parts.now,
    revoke: (accessToken) => revokeOnServer(api)(accessToken),
  });
  api = createApiClient({ origin, session, connectivity, transport });

  const persister = createCachePersister(cacheStore, { buster: () => cacheBuster(appVersion, session.getState().userId) });
  session.onSignedOut(() => {
    queryClient.clear();
    persister.removeClient();
    localFlags.forgetNotice();
  });
  await session.load();
  followConnectivity(connectivity, queryClient);

  return {
    session,
    api,
    connectivity,
    queryClient,
    persister,
    buster: cacheBuster(appVersion, session.getState().userId),
    prefs,
    localFlags,
    appVersion,
  };
}
