import type { HandleState } from "@turnout/contract/profile";

/** The You tab: the account, the safety choices, what we hold, and the way out. */
export const you = {
  title: "You",
  profile: "Your profile",
  social: {
    title: "Instagram or LinkedIn",
    /** Where the handle check stands, as the sub line of its row. `missing` is an account with no handle yet. */
    state: {
      approved: "Checked",
      pending: "We're checking it",
      rejected: "We couldn't check it. Tap to change it.",
      missing: "Not added yet",
    } satisfies Record<HandleState | "missing", string>,
  },
  womenOnly: {
    title: "Women and non-binary groups only",
    sub: "Applies to plans you join from now on.",
    errors: {
      offline: "You're offline. Connect and try again.",
      server: "We couldn't save that. Try again in a moment.",
      invalid: "Women-only groups are for women and non-binary people.",
    },
  },
  notifications: "Notifications",
  blocked: { title: "Blocked people", sub: "People you chose not to meet again" },
  safety: "Safety and 112",
  howMatching: "How matching works",
  privacy: { title: "Privacy notice", sub: (version: string) => `Version ${version}` },
  grievance: "Grievance officer",
  usage: {
    title: "Share usage data",
    sub: "Helps us fix what's broken. Never your name, number or handle.",
  },
  signOut: "Sign out",
  deleteAccount: "Delete account",
  sections: { account: "Your account", safety: "Safety", about: "About", leave: "Leaving" },
} as const;
