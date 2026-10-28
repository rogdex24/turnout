import { type ConfigResponse, configResponseSchema } from "@turnout/contract/app/config";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

export function fetchConfig(api: ApiClient): Promise<ConfigResponse> {
  return api.request({ path: "/config", schema: configResponseSchema, auth: false });
}

/** The server's settings the app reads before sign-in: the grievance officer, the support address, the minimum version. */
export const configQuery = (api: ApiClient) => ({ queryKey: queryKeys.config(), queryFn: () => fetchConfig(api) });
