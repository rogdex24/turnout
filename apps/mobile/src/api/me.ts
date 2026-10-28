import { type MeResponse, meResponseSchema } from "@turnout/contract/app/me";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

export function fetchMe(api: ApiClient): Promise<MeResponse> {
  return api.request({ path: "/me", schema: meResponseSchema });
}

/** The signed-in member. The gates read it, so it is also kept on disk (encrypted) and a start without a network still routes. */
export const meQuery = (api: ApiClient) => ({ queryKey: queryKeys.me(), queryFn: () => fetchMe(api) });
