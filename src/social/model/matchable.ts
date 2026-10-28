import type { Gender } from "@turnout/contract/profile";

/** What is still missing before a person can be put in a group. The codes are the contract's `MatchableItem`. */
export type MissingItem = "phone" | "account" | "name" | "gender" | "photo" | "handle";

export interface MatchableInput {
  /** `member.phone_verified_at`: a code has proved the number. */
  phoneVerified: boolean;
  /** `member.status`. Only `active` can be matched; `stopped` is a person who asked not to be (the ticker's rule). */
  status: string;
  firstName: string | null;
  gender: Gender | null;
  photoKey: string | null;
  /** `social_handle.status`, or null when there is no handle. */
  handleStatus: "pending" | "approved" | "rejected" | null;
  /** True when the phone is on the ban list. */
  banned: boolean;
}

/**
 * The items a person still has to supply, in the order the app asks for them. Empty means matchable. `account` covers every
 * status that is not `active` and a banned number; the app shows its own screen for those and never lists the others.
 */
export function missingItems(input: MatchableInput): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!input.phoneVerified) missing.push("phone");
  if (input.status !== "active" || input.banned) missing.push("account");
  if (!input.firstName) missing.push("name");
  if (!input.gender) missing.push("gender");
  if (!input.photoKey) missing.push("photo");
  if (input.handleStatus !== "approved") missing.push("handle");
  return missing;
}

export const isMatchable = (input: MatchableInput): boolean => missingItems(input).length === 0;
