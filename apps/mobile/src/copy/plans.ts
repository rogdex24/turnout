/** The Plans tab and the status line a plan reads as there and on the Home bar. */
export const plans = {
  title: "Your plans",
  upcoming: "Upcoming",
  past: "Past",
  count: (n: number) => (n === 1 ? "1 plan" : `${n} plans`),
  empty: {
    title: "No plans yet",
    body: "When you go to a show with a group, it shows here.",
    action: "Find a show",
  },
  rowLabel: (title: string, when: string, status: string) => `${title}, ${when}. ${status}.`,
  status: {
    needs_ticket: "Add your ticket",
    checking_ticket: "Checking your ticket",
    ticket_rejected: "Send another ticket",
    finding_group: "Finding your group",
    group_confirmed: "Group confirmed",
    meet_card_live: "Your meet card is live",
    called_off: "Called off, no group formed",
    closed: "Closed, no ticket in time",
    withdrawn: "You left this plan",
    done: (others: number) => {
      if (others === 0) return "Done";
      return others === 1 ? "You went with 1 other" : `You went with ${others} others`;
    },
  },
} as const;
