export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export const USER_AGENT = "hydsocial-sync/0.1 (+https://github.com/hydsocial; contact: takedown@hydsocial.in)";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
