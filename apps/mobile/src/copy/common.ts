/** Strings shared by many screens. Every user-facing string lives under src/copy. */
export const common = {
  back: "Back",
  close: "Close",
  retry: "Try again",
  continue: "Continue",
  cancel: "Cancel",
  save: "Save",
  done: "Done",
  loading: "Loading",
  offlineBar: "You're offline. Showing what we saved.",
  /** The 112 strip on the report form and the safety page. */
  emergency: {
    text: "In danger now? Call 112",
    button: "Call 112",
    label: "Call 112, emergency, opens your phone",
  },
  errorTitle: "That didn't work",
  errorOffline: "You're offline. Check your connection and try again.",
  errorServer: "Something went wrong on our side. Try again in a moment.",
  errorRateLimited: "Too many tries. Wait a moment and try again.",
  errorGeneric: "Something went wrong. Try again.",
  stepOf: (n: number, total: number) => `${n} of ${total}`,
  categories: { comedy: "Stand-up comedy", music: "Live music", theatre: "Theatre", other: "Live event" },
} as const;
