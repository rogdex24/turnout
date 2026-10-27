export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** The published contact for takedown requests, shown on the site and sent with every fetch. */
export const TAKEDOWN_EMAIL = "takedown@hydsocial.in";

export const USER_AGENT = `hydsocial-sync/0.1 (+https://github.com/hydsocial; contact: ${TAKEDOWN_EMAIL})`;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
