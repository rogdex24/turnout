import type { GroupBeforeReveal, GroupRevealed } from "@turnout/contract/app/groups";
import type { Plan, ShowResponse } from "@turnout/contract/app/plans";

/**
 * Made-up plans for tests and stories. The show is the one in `src/api/showFixtures.ts`: 30 Oct 2026, 8:00 PM IST, which is 14:30 UTC. The
 * reveal is 3 hours before (5:00 PM IST, 11:30 UTC), the join deadline 24 hours before.
 */
export const SHOW_STARTS_AT = "2026-10-30T14:30:00.000Z";
export const REVEAL_AT = "2026-10-30T11:30:00.000Z";
export const JOIN_UNTIL = "2026-10-29T14:30:00.000Z";
export const MEET_AT = "2026-10-30T13:30:00.000Z";

export function planFixture(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
    eventId: "monsoon-theory",
    state: "needs_ticket",
    reason: null,
    groupType: "open",
    show: { title: "The Monsoon Theory", startsAt: SHOW_STARTS_AT, venueName: "Phoenix Arena" },
    ticket: null,
    joinUntil: JOIN_UNTIL,
    group: null,
    createdAt: "2026-10-27T09:00:00.000Z",
    ...overrides,
  };
}

/** A plan in each state, with the ticket and group the server would carry for it. */
export const PLANS = {
  needs_ticket: planFixture(),
  checking_ticket: planFixture({ id: "plan-2", state: "checking_ticket", ticket: { state: "pending", rejectReason: null } }),
  ticket_rejected: planFixture({ id: "plan-3", state: "ticket_rejected", ticket: { state: "rejected", rejectReason: "unreadable" } }),
  finding_group: planFixture({ id: "plan-4", state: "finding_group", ticket: { state: "approved", rejectReason: null } }),
  group_confirmed: planFixture({
    id: "plan-5",
    state: "group_confirmed",
    ticket: { state: "approved", rejectReason: null },
    group: { id: "group-1", state: "confirmed", size: 5, revealAt: REVEAL_AT },
  }),
  meet_card_live: planFixture({
    id: "plan-6",
    state: "meet_card_live",
    ticket: { state: "approved", rejectReason: null },
    group: { id: "group-1", state: "live", size: 5, revealAt: REVEAL_AT },
  }),
  no_group: planFixture({ id: "plan-7", state: "no_group", reason: "no_match", ticket: { state: "approved", rejectReason: null } }),
  withdrawn: planFixture({ id: "plan-8", state: "withdrawn", reason: "cancelled", ticket: { state: "approved", rejectReason: null } }),
  done: planFixture({
    id: "plan-9",
    state: "done",
    ticket: { state: "approved", rejectReason: null },
    group: { id: "group-1", state: "done", size: 5, revealAt: REVEAL_AT },
  }),
} as const satisfies Record<Plan["state"], Plan>;

export function memberShowFixture(overrides: Partial<ShowResponse> = {}): ShowResponse {
  return {
    publicId: "monsoon-theory",
    title: "The Monsoon Theory",
    startsAt: SHOW_STARTS_AT,
    joinUntil: JOIN_UNTIL,
    venueName: "Phoenix Arena",
    area: "hitec-city",
    category: "music",
    priceMin: 1499,
    lookingCount: 7,
    proofKind: "screenshot",
    plan: null,
    ...overrides,
  };
}

export function groupBeforeRevealFixture(overrides: Partial<GroupBeforeReveal> = {}): GroupBeforeReveal {
  return {
    state: "confirmed",
    size: 5,
    belowPlan: false,
    revealAt: REVEAL_AT,
    meetAt: MEET_AT,
    showSnapshot: { title: "The Monsoon Theory", startsAt: SHOW_STARTS_AT, venueName: "Phoenix Arena" },
    ...overrides,
  };
}

/** From T-3h: the cafe and the members, with the names the app must not show before then. */
export function groupRevealedFixture(overrides: Partial<GroupRevealed> = {}): GroupRevealed {
  return {
    ...groupBeforeRevealFixture({ state: "live" }),
    cafe: { name: "Cafe Niloufer", address: "Road No. 1, Banjara Hills", lat: 17.41, lng: 78.45, isFallback: false },
    members: [
      { memberRef: "m1", firstName: "Asha", photoUrl: null, checkedIn: false, isYou: true },
      { memberRef: "m2", firstName: "Rohan", photoUrl: "https://files.example.com/m2.jpg", checkedIn: false, isYou: false },
      { memberRef: "m3", firstName: "Meera", photoUrl: null, checkedIn: false, isYou: false },
    ],
    ...overrides,
  };
}
