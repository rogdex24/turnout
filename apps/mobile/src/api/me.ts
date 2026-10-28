import type { Query } from "@tanstack/react-query";
import { type MeResponse, meResponseSchema } from "@turnout/contract/app/me";
import type { ApiClient } from "./client";
import { queryKeys } from "./keys";

export function fetchMe(api: ApiClient): Promise<MeResponse> {
  return api.request({ path: "/me", schema: meResponseSchema });
}

/** The signed-in member. The gates read it, so it is also kept on disk (encrypted) and a start without a network still routes. */
export const meQuery = (api: ApiClient) => ({ queryKey: queryKeys.me(), queryFn: () => fetchMe(api) });

/** While the handle check is pending, `me` is asked again every minute so the strip clears or changes without a restart. */
export const HANDLE_POLL_MS = 60_000;

export function meRefetchInterval(query: Pick<Query<MeResponse>, "state">): number | false {
  return query.state.data?.handle.state === "pending" ? HANDLE_POLL_MS : false;
}
