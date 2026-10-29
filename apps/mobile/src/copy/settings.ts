import { NOTICE_PARAGRAPHS } from "@turnout/contract/app/notice";

/** The pages behind the You tab that only show things: notifications, blocked people, the notice and the grievance officer. */
export const settings = {
  notifications: {
    title: "Notifications",
    lead: "We send news about your tickets and your group, your meet card on show day, and messages from your group. Nothing else.",
    status: { label: "On this phone", granted: "On", denied: "Off", undetermined: "Not asked yet" },
    hint: {
      granted: "You can turn them off in your phone's settings.",
      denied: "Turn them on in your phone's settings to hear when your group is set.",
      undetermined: "We'll ask when you first add a ticket.",
    },
    openSettings: "Open phone settings",
    channelsTitle: "What you'll see",
  },
  blocked: {
    title: "Blocked people",
    lead: "People you reported or chose not to meet again. You won't be put in a group with them. This list is only for you to look at.",
    empty: { title: "Nobody here", body: "You haven't blocked anyone." },
    row: (showTitle: string, date: string) => `${showTitle}, ${date}`,
  },
  privacy: {
    title: "Privacy notice",
    version: (version: string) => `Version ${version}`,
    paragraphs: NOTICE_PARAGRAPHS,
  },
  grievance: {
    title: "Grievance officer",
    lead: "Write or call to ask what we hold about you, to correct it, or to raise a complaint.",
    labels: { name: "Name", address: "Address", email: "Email", phone: "Phone" },
    emailAction: "Write an email",
    phoneAction: "Call",
    notSet: {
      title: "Details not set",
      body: "This build of Turnout has no grievance officer details yet. They are set on the server before release.",
    },
    loading: "Loading the grievance officer's details",
    failed: "We couldn't load the grievance officer's details.",
    /** The production build does not start while the server has no real details; this is its one sentence. */
    startFailed: "Turnout can't start until the grievance officer's details are set. Try again in a little while.",
  },
  howMatching: { title: "How matching works" },
} as const;
