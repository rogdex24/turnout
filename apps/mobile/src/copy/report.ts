/** Every user-facing string lives under src/copy. The report form (B13). */
export const report = {
  title: "Report",
  sos: {
    text: "In danger now? Call 112",
    button: "Call 112",
    label: "Call 112, emergency, opens your phone",
  },
  who: "Who is this about?",
  whoLabel: (name: string) => name,
  why: "What happened?",
  reasons: [
    { id: "unsafe", label: "Made me feel unsafe" },
    { id: "harassment", label: "Harassment or unwanted contact" },
    { id: "not_who", label: "Not who they said" },
    { id: "other", label: "Something else" },
  ],
  details: {
    label: "Details (optional)",
    placeholder: "Tell us what happened, if you want to.",
  },
  fine: "We read every report within 24 hours. They won't know who reported them.",
  message: "About one of their messages.",
  send: "Send report",
  failed: "That didn't go through. Try again.",
  loading: "Loading",
  sent: {
    title: "We have your report",
    body: "We read every report within 24 hours. They won't know it came from you.",
    action: "Done",
  },
  queued: {
    title: "Your report is saved",
    body: "You're offline. We'll send it when you're back online.",
    action: "Done",
  },
} as const;
