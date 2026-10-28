import type { HandleRejectReason } from "@turnout/contract/profile";

/** The handle check strip on Home and Settings. Plain and neutral: a rejection is information, never a mark against the person. */
export const profileCheck = {
  pending: "We're checking your profile. Usually within a day. You can add a ticket in the meantime.",
  change: "Change handle",
  rejected: {
    not_found: "We couldn't find that account.",
    private_or_empty: "That account is private or has nothing on it yet.",
    not_matching_photo: "We couldn't match your photo to that account.",
    not_a_person: "That looks like a page, not a person.",
    unknown: "We couldn't check that account.",
  } satisfies Record<HandleRejectReason | "unknown", string>,
} as const;
