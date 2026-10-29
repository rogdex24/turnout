import type { Meta, StoryObj } from "@storybook/react-native";
import { groupFixture, MEET_AT, MEMBERS, memberFixture, REVEAL_AT, SHOW_STARTS_AT } from "@/api/groupFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { type MeetCardData, MeetView, type MeetViewProps } from "./MeetView";

const meta: Meta = { title: "Screens/Meet", component: MeetView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const at = (iso: string, plusMinutes = 0) => Date.parse(iso) + plusMinutes * 60_000;

const group = groupFixture();
const card: MeetCardData = {
  showTitle: group.showSnapshot.title,
  startsAt: SHOW_STARTS_AT,
  meetAt: MEET_AT,
  cafe: group.cafe,
  venue: { name: "Shilpa Kala Vedika", lat: 17.4525, lng: 78.3811 },
  members: MEMBERS,
  belowPlan: false,
};

const base: MeetViewProps = {
  state: { status: "ready", card },
  // 48 minutes before the group meets, 108 before the show: the "I'm here" button is not open yet.
  now: at(MEET_AT, -48),
  offline: false,
  here: "idle",
  line: { kind: "hidden" },
  realMap: false,
  onBack: noop,
  onRetry: noop,
  onOpenShow: noop,
  onOpenMaps: noop,
  onAskLocation: noop,
  onOpenSettings: noop,
  onHere: noop,
  onCall: noop,
  onLeave: noop,
  onClosed: noop,
};

const framed = (props: Partial<MeetViewProps>) => () => (
  <Matrix framed>
    <MeetView {...base} {...props} />
  </Matrix>
);

const ready = (over: Partial<MeetCardData> = {}, props: Partial<MeetViewProps> = {}) =>
  framed({ state: { status: "ready", card: { ...card, ...over } }, ...props });

// 80 minutes before the show: check-in is open.
const OPEN = at(SHOW_STARTS_AT, -80);

export const Loading: Story = { render: framed({ state: { status: "loading" } }) };
export const Waiting: Story = { render: framed({ state: { status: "waiting", revealAt: REVEAL_AT }, now: at(REVEAL_AT, -120) }) };
export const Early: Story = { render: ready() };
export const OpenToCheckIn: Story = { render: ready({}, { now: OPEN }) };
export const Sending: Story = { render: ready({}, { now: OPEN, here: "sending" }) };
export const CheckedIn: Story = {
  render: ready({ members: MEMBERS.map((member) => (member.isYou ? { ...member, checkedIn: true } : member)) }, { now: OPEN }),
};
export const CheckedInOffline: Story = {
  render: ready(
    { members: MEMBERS.map((member) => (member.isYou ? { ...member, checkedIn: true } : member)) },
    { now: OPEN, offline: true, here: "queued" },
  ),
};
export const SomeoneIsHere: Story = {
  render: ready({ members: [memberFixture({ checkedIn: true }), ...MEMBERS.slice(1)] }, { now: OPEN }),
};
export const Failed: Story = { render: ready({}, { now: OPEN, here: "failed" }) };
export const CheckInClosed: Story = { render: ready({}, { now: at(SHOW_STARTS_AT, 90) }) };
export const RealMap: Story = { render: ready({}, { realMap: true }) };
export const NoVenuePin: Story = { render: ready({ venue: { name: null, lat: null, lng: null } }) };
export const FallbackCafe: Story = {
  render: ready({ cafe: { name: "Shilpa Kala Vedika entrance", address: null, lat: 17.4525, lng: 78.3811, isFallback: true } }),
};
export const LocationAsk: Story = { render: ready({}, { line: { kind: "ask", canAsk: true } }) };
export const LocationInSettings: Story = { render: ready({}, { line: { kind: "ask", canAsk: false } }) };
export const LocationFinding: Story = { render: ready({}, { line: { kind: "finding" } }) };
export const LocationWalk: Story = { render: ready({}, { line: { kind: "walk", minutes: 6 } }) };
export const AtTheCafe: Story = { render: ready({}, { line: { kind: "at_cafe" } }) };
export const SmallerGroup: Story = { render: ready({ belowPlan: true, members: MEMBERS.slice(0, 3) }) };
export const OfflineWithoutPlan: Story = { render: ready({}, { offline: true, onOpenShow: null, onLeave: null }) };
export const Closed: Story = { render: framed({ state: { status: "closed" } }) };
export const ErrorServer: Story = { render: framed({ state: { status: "error", kind: "server" } }) };
export const ErrorOffline: Story = { render: framed({ state: { status: "error", kind: "offline" }, offline: true }) };
