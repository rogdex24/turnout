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
  /** The Settings page for the handle: the same strip, the handle as it stands, and a field to change it. */
  social: {
    title: "Instagram or LinkedIn",
    lead: "So we can check you're a real person. Others in your group never see it.",
    current: "Your handle",
    none: "Nothing added yet",
    kind: { instagram: "Instagram", linkedin: "LinkedIn" },
    field: "New handle",
    placeholder: "@name or a profile link",
    save: "Send for checking",
    saved: "Sent. We're checking it.",
    errors: {
      invalid: "That isn't an Instagram or LinkedIn handle. Paste your handle or the link to your profile.",
      locked: "Your handle can't change while you're in a group.",
      limit: "You've changed your handle too many times today. Try again tomorrow.",
      offline: "You're offline. Connect and try again.",
      server: "Something went wrong on our side. Try again in a moment.",
    },
  },
} as const;
