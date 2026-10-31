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
      undetermined: "Turn them on here, or we'll ask when you first add a ticket.",
    },
    ask: "Turn on notifications",
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
  /** Settings, safety and 112 (B14). What keeps a meet safe, and what to do when one is not. */
  safety: {
    title: "Safety and 112",
    lead: "Turnout groups meet in public places. Here is what we do, and what you can do at any time.",
    sections: [
      {
        heading: "In danger now",
        items: [
          "Call 112. It reaches the police, fire and ambulance anywhere in India.",
          "Turnout is not an emergency service, and we can't send help.",
        ],
      },
      {
        heading: "Where you meet",
        items: [
          "Your group meets at a cafe we pick. Never at a home, never in a car.",
          "Names, photos and the cafe appear 3 hours before the show.",
          "You can leave a plan whenever you like.",
        ],
      },
      {
        heading: "On the day",
        items: [
          "The meet card has a Safety button with Call 112, Report and Leave.",
          "Tell a friend where you are going and who you are meeting.",
        ],
      },
      {
        heading: "If someone makes you uneasy",
        items: [
          "Report them from the meet card, from one of their messages, or after the show.",
          "They stop being matched at once. We read every report within 24 hours, and they won't know who reported them.",
          "After the show you can mark someone privately. You are never put in a group with them again, and they are not told.",
        ],
      },
    ],
  },
} as const;
