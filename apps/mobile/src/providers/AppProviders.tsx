import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createContext, type ReactNode, use } from "react";
import { useStartTelemetry } from "../analytics/useStartTelemetry";
import { dehydrateOptions } from "../api/persister";
import { CACHE_MAX_AGE_MS } from "../api/queryClient";
import type { AppDeps } from "./deps";
import { useAppFocus } from "./useAppFocus";

const DepsContext = createContext<AppDeps | null>(null);

export function useDeps(): AppDeps {
  const deps = use(DepsContext);
  if (deps === null) throw new Error("useDeps was called outside AppProviders.");
  return deps;
}

/** Hands the wired app to every screen and restores the disk cache before any query runs, so a start without a network still has its shows. */
export function AppProviders({ deps, children }: { deps: AppDeps; children: ReactNode }) {
  useStartTelemetry(deps.prefs);
  useAppFocus();
  return (
    <DepsContext value={deps}>
      <PersistQueryClientProvider
        client={deps.queryClient}
        persistOptions={{ persister: deps.persister, maxAge: CACHE_MAX_AGE_MS, buster: deps.buster, dehydrateOptions }}
      >
        {children}
      </PersistQueryClientProvider>
    </DepsContext>
  );
}
