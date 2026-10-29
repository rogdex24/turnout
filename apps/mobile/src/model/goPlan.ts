import type { MatchableItem, MeResponse } from "@turnout/contract/app/me";
import type { GroupType } from "@turnout/contract/app/plans";
import { canChooseWomenOnly } from "@turnout/contract/profile";
import { type ApiError, isApiError } from "./apiError";

/** What the sheet starts on: the person's saved preference, and "any group" for someone who cannot choose women-only. */
export function defaultGroupType(me: Pick<MeResponse, "profile"> | undefined): GroupType {
  const profile = me?.profile;
  return profile?.gender != null && canChooseWomenOnly(profile.gender) && profile.groupPref === "women_only" ? "women_only" : "open";
}

/** The women-only choice is offered to women and non-binary people only. */
export function womenOnlyOffered(me: Pick<MeResponse, "profile"> | undefined): boolean {
  const gender = me?.profile.gender;
  return gender != null && canChooseWomenOnly(gender);
}

/** Why POST /plans did not make a plan the person can carry on with. */
export type GoIssue =
  | { kind: "not_matchable"; missing: readonly MatchableItem[] }
  | { kind: "women_only" }
  | { kind: "closed" }
  | { kind: "offline" }
  | { kind: "rate_limited" }
  | { kind: "server" };

/** The plan a repeat tap lands on: the server answers 409 `plan_exists` with its id, and the person carries on with it. */
export function existingPlanId(error: unknown): string | null {
  return isApiError(error) && error.code === "plan_exists" ? error.detail.planId : null;
}

export function goIssue(error: unknown): GoIssue {
  if (!isApiError(error)) return { kind: "server" };
  return issueOf(error);
}

function issueOf(error: ApiError): GoIssue {
  if (error.kind === "offline") return { kind: "offline" };
  if (error.kind === "rate_limited") return { kind: "rate_limited" };
  if (error.code === "not_matchable") return { kind: "not_matchable", missing: error.detail.missing ?? [] };
  if (error.code === "women_only") return { kind: "women_only" };
  if (error.kind === "not_found" || error.code === "plan_closed") return { kind: "closed" };
  return { kind: "server" };
}

/** Where the person goes to add what is missing: only the handle is on its own page, the rest is the profile form. */
export function finishTarget(missing: readonly MatchableItem[]): "/settings/social" | "/settings/profile" {
  return missing.length > 0 && missing.every((item) => item === "handle") ? "/settings/social" : "/settings/profile";
}

/** "your photo", "your photo and your first name", "your photo, your first name and your gender". */
export function joinItems(items: readonly string[], and: string): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}
