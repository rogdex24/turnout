import type { MatchableItem } from "@turnout/contract/app/me";
import type { GroupType } from "@turnout/contract/app/plans";

/** The Go with a group sheet on the Show page. */
export const go = {
  title: "Go with a group",
  /** Shown the first time only. */
  explain: "We put you in a group of 4 to 6 people with tickets to the same show. You meet at a cafe an hour before.",
  groupType: {
    label: "Who can be in your group",
    open: "Any group",
    women_only: "Women and non-binary only",
    womenOnlyHint: "Only women and non-binary people who chose this.",
  } satisfies Record<GroupType | "label" | "womenOnlyHint", string>,
  next: "Next: add your ticket",
  notNow: "Not now",
  finish: "Finish your profile",
  issues: {
    womenOnly: "Women-only groups are for women and non-binary people. Choose any group, or change it in your profile.",
    closed: "Groups aren't open for this show any more.",
    offline: "You're offline. Connect and try again.",
    rateLimited: "Too many tries. Wait a moment and try again.",
    server: "Something went wrong on our side. Try again in a moment.",
  },
  /** What a person still has to add before they can be put in a group. */
  missing: {
    lead: (items: string) => `Before we can put you in a group, add ${items}.`,
    items: {
      phone: "your phone number",
      account: "your account details",
      name: "your first name",
      gender: "your gender",
      photo: "your photo",
      handle: "your Instagram or LinkedIn",
    } satisfies Record<MatchableItem, string>,
    and: "and",
  },
} as const;
