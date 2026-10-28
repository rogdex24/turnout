import type { Meta, StoryObj } from "@storybook/react-native";
import { groupFacts } from "@/model/groupFacts";
import { groupBeforeRevealFixture, PLANS, planFixture } from "@/model/planFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { PlanView, type PlanViewProps } from "./PlanView";

const meta: Meta = { title: "Screens/Plan", component: PlanView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
/** Fixed at 10:00 AM IST on the show day, so the reveal at 5:00 PM reads the same every day. */
const NOW = Date.parse("2026-10-30T10:00:00+05:30");

const base: PlanViewProps = {
  plan: PLANS.needs_ticket,
  facts: null,
  now: NOW,
  onBack: noop,
  onAddTicket: noop,
  onOpenMeetCard: noop,
  onLeave: noop,
  onFindShow: noop,
  onChangeHandle: noop,
};

const framed = (props: Partial<PlanViewProps>) => () => (
  <Matrix framed>
    <PlanView {...base} {...props} />
  </Matrix>
);

const confirmed = groupFacts(PLANS.group_confirmed, groupBeforeRevealFixture());
const small = groupFacts(PLANS.group_confirmed, groupBeforeRevealFixture({ size: 3, belowPlan: true }));
const live = groupFacts(PLANS.meet_card_live, groupBeforeRevealFixture({ state: "live" }));

export const NeedsTicket: Story = { render: framed({}) };
export const CheckingTicket: Story = { render: framed({ plan: PLANS.checking_ticket }) };
export const TicketRejected: Story = { render: framed({ plan: PLANS.ticket_rejected }) };
export const FindingGroup: Story = { render: framed({ plan: PLANS.finding_group, lookingCount: 7 }) };
export const FindingGroupAlone: Story = { render: framed({ plan: PLANS.finding_group }) };
export const GroupConfirmed: Story = { render: framed({ plan: PLANS.group_confirmed, facts: confirmed }) };
export const GroupOfThree: Story = { render: framed({ plan: PLANS.group_confirmed, facts: small }) };
export const GroupOffline: Story = {
  render: framed({ plan: PLANS.group_confirmed, facts: groupFacts(PLANS.group_confirmed, null), offline: true }),
};
export const MeetCardLive: Story = { render: framed({ plan: PLANS.meet_card_live, facts: live }) };
export const NoGroup: Story = { render: framed({ plan: PLANS.no_group }) };
export const NoGroupHandlePending: Story = { render: framed({ plan: planFixture({ ...PLANS.no_group, reason: "handle_pending" }) }) };
export const NoGroupHandleRejected: Story = { render: framed({ plan: planFixture({ ...PLANS.no_group, reason: "handle_rejected" }) }) };
export const NoGroupCalledOff: Story = { render: framed({ plan: planFixture({ ...PLANS.no_group, reason: "group_called_off" }) }) };
export const NoGroupLateReview: Story = { render: framed({ plan: planFixture({ ...PLANS.no_group, reason: "late_review" }) }) };
export const Withdrawn: Story = { render: framed({ plan: PLANS.withdrawn }) };
export const Done: Story = { render: framed({ plan: PLANS.done, facts: groupFacts(PLANS.done, null) }) };
export const Offline: Story = { render: framed({ plan: PLANS.finding_group, offline: true }) };
