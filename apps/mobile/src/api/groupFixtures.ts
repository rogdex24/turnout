import type { GroupBeforeReveal, GroupMember, GroupRevealed } from "@turnout/contract/app/groups";
import type { Plan } from "@turnout/contract/app/plans";
import type { MeetContext } from "./groups";

/** Made-up groups for tests and stories. The show starts at 7:00 PM IST on 7 Nov 2026 and the group meets an hour before. */
export const SHOW_STARTS_AT = "2026-11-07T13:30:00.000Z";
export const MEET_AT = "2026-11-07T12:30:00.000Z";
export const REVEAL_AT = "2026-11-07T10:30:00.000Z";

export function memberFixture(over: Partial<GroupMember> = {}): GroupMember {
  return { memberRef: "m-priya", firstName: "Priya", photoUrl: null, checkedIn: false, isYou: false, ...over };
}

export const MEMBERS: GroupMember[] = [
  memberFixture(),
  memberFixture({ memberRef: "m-sana", firstName: "Sana" }),
  memberFixture({ memberRef: "m-meera", firstName: "Meera" }),
  memberFixture({ memberRef: "m-you", firstName: "Ananya", isYou: true }),
];

export function groupBeforeRevealFixture(over: Partial<GroupBeforeReveal> = {}): GroupBeforeReveal {
  return {
    state: "confirmed",
    size: 4,
    belowPlan: false,
    revealAt: REVEAL_AT,
    meetAt: MEET_AT,
    showSnapshot: { title: "Traffic Jam Tales", startsAt: SHOW_STARTS_AT, venueName: "Shilpa Kala Vedika" },
    ...over,
  };
}

export function groupFixture(over: Partial<GroupRevealed> = {}): GroupRevealed {
  return {
    ...groupBeforeRevealFixture({ state: "live" }),
    cafe: { name: "Cafe Niloufer", address: "Road No 1, Hitec City", lat: 17.4435, lng: 78.3772, isFallback: false },
    members: MEMBERS,
    ...over,
  };
}

/** The group the morning after: done, with the 72 hour window open until the Wednesday at 10:00 IST. */
export const FEEDBACK_OPEN_UNTIL = "2026-11-11T04:30:00.000Z";

export function doneGroupFixture(over: Partial<GroupRevealed> = {}): GroupRevealed {
  return groupFixture({ state: "done", feedbackOpenUntil: FEEDBACK_OPEN_UNTIL, downvotedRefs: [], ...over });
}

export function planFixture(over: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    eventId: "traffic-jam-tales",
    state: "meet_card_live",
    reason: null,
    groupType: "open",
    show: { title: "Traffic Jam Tales", startsAt: SHOW_STARTS_AT, venueName: "Shilpa Kala Vedika" },
    ticket: { state: "approved", rejectReason: null },
    joinUntil: "2026-11-06T13:30:00.000Z",
    group: { id: "g1", state: "live", size: 4, revealAt: REVEAL_AT },
    createdAt: "2026-11-01T10:00:00.000Z",
    ...over,
  };
}

export const MEET_CONTEXT: MeetContext = {
  planId: "plan-1",
  eventId: "traffic-jam-tales",
  venue: { name: "Shilpa Kala Vedika", point: { lat: 17.4525, lng: 78.3811 } },
};
