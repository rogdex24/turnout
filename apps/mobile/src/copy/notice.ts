/** The privacy notice screen. The notice text itself is `NOTICE_PARAGRAPHS` in the contract, so the app, the site and the store listing say the same thing. */
export const notice = {
  title: "How we use your details",
  /** Signed in, and the notice moved to a new version since this person agreed. */
  titleChanged: "We updated our notice",
  lead: "Read this before you sign in. It takes a minute.",
  leadChanged: "Please read what changed and agree again to keep going.",
  grievanceTitle: "Grievance officer",
  grievanceIntro: "Write to the grievance officer to ask what we hold about you, to correct it, or to raise a complaint.",
  grievanceLoading: "Loading the grievance officer's details",
  grievanceFailed: "We couldn't load the grievance officer's details. You need a connection to agree.",
  grievanceLabels: { name: "Name", address: "Address", email: "Email", phone: "Phone" },
  agree: "I agree",
  agreeHint: "Agree to the notice above",
  errors: {
    offline: "You're offline. Connect and try again.",
    server: "Something went wrong on our side. Try again in a moment.",
    updateApp: "The notice has a newer version. Update the app to continue.",
  },
} as const;
