import type { NO_GROUP_REASONS, WITHDRAWN_REASONS } from "@turnout/contract/app/plans";

type NoGroupReason = (typeof NO_GROUP_REASONS)[number];
type WithdrawnReason = (typeof WITHDRAWN_REASONS)[number];

/** One plan: where it stands, what the person can do, and the sheet that lets them leave it. */
export const plan = {
  title: "Your plan",
  steps: {
    label: "Plan progress",
    ticket: "Ticket",
    group: "Group",
    meetCard: "Meet card",
    done: "done",
    current: "current step",
    pending: "not yet",
    off: "not happening",
  },
  statusLabel: "Status",
  needsTicket: {
    title: "Add your ticket",
    body: "Add your ticket and we'll start looking for a group.",
    action: "Add your ticket",
  },
  checking: {
    title: "Checking your ticket",
    body: "We're looking at it now. You don't need to do anything.",
  },
  rejected: {
    title: "We couldn't use your ticket",
    action: "Send another ticket",
    unknown: "We couldn't use the ticket you sent. Send another one.",
  },
  finding: {
    title: "Finding your group",
    none: "No group yet.",
    looking: (count: number) =>
      count === 1 ? "No group yet. 1 person with a ticket is looking." : `No group yet. ${count} people with tickets are looking.`,
    setBy: (when: string) => `Groups are set by ${when}, 24 hours before.`,
  },
  confirmed: {
    title: "Group confirmed",
    body: (revealAt: string) => `You're going with a group. See who at ${revealAt}.`,
    bodyAfter: "You're going with a group. Your meet card opens any moment.",
    smaller: (size: number) => `Fewer people than usual. Your group goes ahead with ${size}.`,
    reveal: {
      /** The count is the others; the person is the "plus you". */
      label: (others: number) => (others === 1 ? "person with a ticket, plus you" : "people with tickets, plus you"),
      accessibility: (others: number) => (others === 1 ? "1 person with a ticket, plus you" : `${others} people with tickets, plus you`),
      when: (revealAt: string) => `Names, photos and the cafe at ${revealAt}`,
      soon: "Names, photos and the cafe any moment now",
    },
    meetAround: (time: string) => `You'll meet around ${time} near the venue.`,
  },
  live: {
    title: "Your meet card is live",
    body: "See who you're meeting, where, and when.",
    action: "Open meet card",
  },
  noGroup: {
    pill: "Called off",
    closedPill: "Plan closed",
    title: "No group this time",
    /** Why, in plain words. The ticket is never taken away, so each one says it is still theirs where it is true. */
    reasons: {
      no_match:
        "Not enough people had tickets for this show, so we called it off. Your ticket is still yours; go on your own or with friends.",
      group_called_off:
        "Your group was called off before the show because too few people could still go. Your ticket is still yours; go on your own or with friends.",
      handle_pending:
        "We were still checking your profile link when groups were set, so this plan closed. Your ticket is still yours; go on your own or with friends.",
      handle_rejected:
        "We couldn't accept your profile link before groups were set, so this plan closed. Change it and you can join a group for your next show.",
      late_review:
        "Your ticket reached us too late to check before groups were set, so this plan closed. Your ticket is still yours; go on your own or with friends.",
      ticket_rejected: "We couldn't use your ticket before groups were set, so this plan closed. Go on your own or with friends.",
      no_ticket: "No ticket reached us before groups were set, so this plan closed. You can still go to the show.",
    } satisfies Record<NoGroupReason, string>,
    unknown: "This plan closed before a group could form.",
    findAnother: "Find another show",
    changeHandle: "Change your profile link",
  },
  withdrawn: {
    pill: "You left",
    title: "You left this plan",
    /** `cancelled` is the person's own choice; the others are decided elsewhere and stay neutral. */
    reasons: {
      cancelled: "You're out of the group search. Your BookMyShow ticket isn't affected.",
      delisted: "This show is no longer listed, so the plan ended.",
      suspended: "This plan ended.",
      banned: "This plan ended.",
      stopped: "This plan ended.",
      deleted: "This plan ended.",
    } satisfies Record<WithdrawnReason, string>,
    findAnother: "Find another show",
  },
  done: {
    pill: "Done",
    title: "You went to this show",
    withGroup: (others: number) => (others === 1 ? "You went with 1 other." : `You went with ${others} others.`),
    alone: "That's the plan done.",
  },
  rows: {
    chat: "Group chat",
    chatOpens: (when: string) => `Opens at ${when}`,
    chatClosed: "Closed",
    ticket: "Ticket",
    ticketChecking: "Checking",
    ticketRejected: "Not accepted",
    ticketAccepted: "Accepted",
    ticketStill: "Still yours",
    leave: "Leave this plan",
  },
  loading: "Loading your plan",
  missing: {
    title: "We can't find that plan",
    body: "It may have been removed. Your plans are one tap away.",
    action: "See your plans",
  },
  cancel: {
    title: "Leave this plan?",
    lead: "We'll take you out of the group search. Your BookMyShow ticket isn't affected.",
    groupNote: "Within 3 hours of the show, your group will be told someone left.",
    confirm: "Leave plan",
    stay: "Stay",
  },
} as const;
