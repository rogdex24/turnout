import type { Database } from "bun:sqlite";
import { getHandle } from "./handles.js";
import { getMember, isPhoneBanned } from "./members.js";
import { type MatchableInput, type MissingItem, missingItems } from "./model/matchable.js";
import { getProfile } from "./profiles.js";

/** What the matching rules need to know about a member, read from the database. Null when the member does not exist. */
export function matchableInput(db: Database, memberId: string): MatchableInput | null {
  const member = getMember(db, memberId);
  if (member === null) return null;
  const profile = getProfile(db, memberId);
  const handle = getHandle(db, memberId);
  return {
    phoneVerified: member.phone_verified_at !== null,
    status: member.status,
    firstName: profile?.first_name ?? null,
    gender: profile?.gender ?? null,
    photoKey: profile?.photo_key ?? null,
    handleStatus: handle?.status ?? null,
    banned: member.phone_e164 !== null && isPhoneBanned(db, member.phone_e164),
  };
}

/**
 * What is missing before this member can make a plan. A plan only needs a submitted handle that has not been turned down: the
 * review can take a day, and the member adds a ticket meanwhile. A pending handle is then what keeps them out of a group.
 */
export function missingForPlan(db: Database, memberId: string): MissingItem[] {
  const input = matchableInput(db, memberId);
  if (input === null) return ["account"];
  return missingItems({ ...input, handleStatus: input.handleStatus === "pending" ? "approved" : input.handleStatus });
}
