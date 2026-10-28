import { errorBodySchema } from "@turnout/contract/app/errors";
import type { MatchableItem } from "@turnout/contract/app/me";

/** What the screens switch on. The server's stable `code` rides along for the few places that need the detail. */
export type ApiErrorKind = "offline" | "unauthorised" | "forbidden" | "not_found" | "rate_limited" | "validation" | "server";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number | null,
    readonly code: string | null,
    readonly retryAfterSeconds: number | null = null,
    /** The two codes that carry a field: `plan_exists` names the plan to carry on with, `not_matchable` lists what is missing. */
    readonly detail: { planId: string | null; missing: readonly MatchableItem[] | null } = { planId: null, missing: null },
  ) {
    // The server's message is for logs only, so the error carries the code and nothing a person could be shown by accident.
    super(code ?? kind);
    this.name = "ApiError";
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function offlineError(): ApiError {
  return new ApiError("offline", null, null);
}

export function retryAfterSeconds(header: string | null): number | null {
  if (header === null || !/^\d+$/.test(header.trim())) return null;
  return Number(header.trim());
}

function kindFor(status: number): ApiErrorKind {
  if (status === 401) return "unauthorised";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "validation";
}

/** Turns a failed response into the error union. A body that is not the contract's error shape still classifies by status. */
export function classifyFailure(status: number, bodyText: string, retryAfter: string | null): ApiError {
  let code: string | null = null;
  let detail: ApiError["detail"] = { planId: null, missing: null };
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      code = parsed.data.error.code;
      detail = { planId: parsed.data.error.planId ?? null, missing: parsed.data.error.missing ?? null };
    }
  } catch {
    // Not JSON: HTML from a proxy, say. The status is enough.
  }
  return new ApiError(kindFor(status), status, code, retryAfterSeconds(retryAfter), detail);
}
