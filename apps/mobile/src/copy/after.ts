/** Every user-facing string lives under src/copy. After the show (B13.1). */
export const after = {
  title: "After the show",
  loading: "Loading your group",
  lead: (showTitle: string) => `Your group for ${showTitle}`,
  /** The default is stated first and plainly: nothing is asked of the person. */
  doNothing: {
    title: "You don't have to do anything",
    body: "If it went fine, leave this page. Nothing is sent, and nobody is told.",
  },
  private: "What you mark here is private. The person never sees it and is not told.",
  window: (until: string) => `You can mark someone until ${until}.`,
  notComfortable: {
    action: "I didn't feel comfortable",
    actionLabel: (name: string) => `I didn't feel comfortable with ${name}`,
    done: "Marked, privately",
    doneLabel: (name: string) => `You marked ${name}, privately`,
    sending: "Saving",
    queued: "You're offline. We'll save this when you're back online.",
    failed: "That didn't go through. Try again.",
  },
  confirm: {
    title: (name: string) => `Mark ${name}?`,
    lead: "This is private. They aren't told, and you won't be put in a group with them again.",
    confirm: "Yes, mark them",
    cancel: "Not now",
  },
  report: {
    action: "Report",
    actionLabel: (name: string) => `Report ${name}`,
  },
  notYet: {
    title: "This opens the morning after the show",
    body: "Your group shows here from the morning after, for 3 days.",
  },
  closed: {
    title: "This has closed",
    body: "You can mark someone for 3 days after the show.",
    action: "Back to your plans",
  },
  open: "How did it go?",
  openLabel: "How did it go? Opens your group from the show",
} as const;
