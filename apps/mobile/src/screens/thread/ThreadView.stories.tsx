import type { Meta, StoryObj } from "@storybook/react-native";
import { MEMBERS } from "@/api/groupFixtures";
import type { ThreadItem } from "@/model/thread";
import { Matrix } from "@/ui/storybook/Matrix";
import { type ThreadReady, ThreadView, type ThreadViewProps } from "./ThreadView";

const meta: Meta = { title: "Screens/Thread", component: ThreadView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

const base: ThreadViewProps = {
  state: { status: "loading" },
  offline: false,
  onBack: noop,
  onRetry: noop,
  onSend: () => null,
  onResend: noop,
  onReport: noop,
  onClosed: noop,
};

const item = (key: string, who: "priya" | "sana" | "you", body: string, time: string, over: Partial<ThreadItem> = {}): ThreadItem => ({
  key,
  memberRef: who === "you" ? "m-you" : `m-${who}`,
  firstName: { priya: "Priya", sana: "Sana", you: "Ananya" }[who],
  isYou: who === "you",
  body,
  time,
  status: "sent",
  clientId: null,
  startsRun: true,
  ...over,
});

const items: ThreadItem[] = [
  item("1", "priya", "Hi all! I'll be the one in the green jacket.", "4:01 PM"),
  item("2", "priya", "Table by the window.", "4:01 PM", { startsRun: false }),
  item("3", "you", "On my way, 10 minutes.", "4:05 PM"),
  item("4", "sana", "Running 10 min late", "4:12 PM"),
];

const ready: ThreadReady = {
  title: "Traffic Jam Tales",
  closesAt: "Sun 7:00 PM",
  items,
  photos: Object.fromEntries(MEMBERS.map((member) => [member.memberRef, member.photoUrl])),
  readOnly: false,
};

const framed = (props: Partial<ThreadViewProps>) => () => (
  <Matrix framed>
    <ThreadView {...base} {...props} />
  </Matrix>
);

const withState = (over: Partial<ThreadReady>, props: Partial<ThreadViewProps> = {}) =>
  framed({ state: { status: "ready", ...ready, ...over }, ...props });

export const Loading: Story = { render: framed({ state: { status: "loading" } }) };
export const Waiting: Story = { render: framed({ state: { status: "waiting", opensAt: "Sat 3:30 PM" } }) };
export const Closed: Story = { render: framed({ state: { status: "closed" } }) };
export const ErrorOffline: Story = { render: framed({ state: { status: "error", kind: "offline" }, offline: true }) };
export const Empty: Story = { render: withState({ items: [] }) };
export const Conversation: Story = { render: withState({}) };
export const Offline: Story = { render: withState({}, { offline: true }) };
export const NotSentYet: Story = {
  render: withState({
    items: [
      ...items,
      item("p1", "you", "At the cafe", "4:14 PM", { key: "pending-a", memberRef: null, status: "sending", clientId: "a" }),
      item("p2", "you", "See you in a minute", "4:14 PM", {
        key: "pending-b",
        memberRef: null,
        status: "queued",
        clientId: "b",
        startsRun: false,
      }),
      item("p3", "you", "Is anyone near the door?", "4:15 PM", {
        key: "pending-c",
        memberRef: null,
        status: "failed",
        clientId: "c",
        startsRun: false,
      }),
    ],
  }),
};
export const ReadOnly: Story = { render: withState({ readOnly: true, closesAt: null }) };
export const LongMessage: Story = {
  render: withState({
    items: [
      item(
        "1",
        "sana",
        "I'm at the second entrance, the one next to the juice stand, near the stairs that go up to the balcony. If you can't find me just call.",
        "4:01 PM",
      ),
      item("2", "you", "https://example.com/a/very/long/link/that/should/not/become/a/link/and/should/wrap/somewhere/sensible", "4:02 PM"),
    ],
  }),
};
