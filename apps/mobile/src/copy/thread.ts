/** Every user-facing string lives under src/copy. The group chat (B12). */
export const thread = {
  fallbackTitle: "Group chat",
  subtitle: {
    open: (closesAt: string) => `Group chat, open until ${closesAt}`,
    readOnly: "Group chat, read only",
  },
  you: "You",
  loading: "Loading the group chat",
  list: "Messages",
  waiting: {
    title: "The group chat opens 3 hours before",
    body: (opensAt: string) => `You can write to your group here from ${opensAt}.`,
  },
  closed: {
    title: "This group chat has closed",
    body: "Group chats are kept for a while after the show, and are gone when a group is called off.",
    action: "Back",
  },
  empty: {
    title: "Say hello to your group",
    body: "Only the people in this group can read what you write here.",
  },
  readOnly: "The chat is closed. You can read it, but not write.",
  /** Sender, time and text, read as one item. */
  itemLabel: (name: string, time: string, body: string) => `${name}, ${time}: ${body}`,
  status: {
    sending: "Sending",
    queued: "You're offline. We'll send this when you're back online.",
    failed: "Didn't send. Tap to try again.",
  },
  retryHint: "Sends the message again",
  composer: {
    label: "Message",
    placeholder: "Message",
    send: "Send",
  },
  quick: {
    label: "Quick messages",
    late: "Running 10 min late",
    onMyWay: "On my way",
    atCafe: "At the cafe",
  },
  report: {
    sheetTitle: (name: string) => `Message from ${name}`,
    action: "Report",
    actionLabel: "Report this message",
    close: "Close",
  },
} as const;
