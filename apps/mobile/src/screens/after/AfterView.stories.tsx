import type { Meta, StoryObj } from "@storybook/react-native";
import { MEMBERS } from "@/api/groupFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { type AfterData, AfterView, type AfterViewProps } from "./AfterView";

const meta: Meta = { title: "Screens/After", component: AfterView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

const data: AfterData = {
  groupId: "g1",
  showTitle: "Traffic Jam Tales",
  feedbackOpenUntil: "2026-11-11T04:30:00.000Z",
  members: MEMBERS.filter((member) => !member.isYou),
  marked: [],
};

const base: AfterViewProps = {
  state: { status: "ready", data },
  offline: false,
  mark: null,
  onBack: noop,
  onRetry: noop,
  onMark: noop,
  onReport: noop,
  onClosed: noop,
};

const framed = (props: Partial<AfterViewProps>) => () => (
  <Matrix framed>
    <AfterView {...base} {...props} />
  </Matrix>
);

const ready = (over: Partial<AfterData> = {}, props: Partial<AfterViewProps> = {}) =>
  framed({ state: { status: "ready", data: { ...data, ...over } }, ...props });

export const Loading: Story = { render: framed({ state: { status: "loading" } }) };
export const Ready: Story = { render: ready() };
export const OneMarked: Story = { render: ready({ marked: ["m-sana"] }) };
export const Sending: Story = { render: ready({}, { mark: { memberRef: "m-sana", status: "sending" } }) };
export const QueuedOffline: Story = {
  render: ready({ marked: ["m-sana"] }, { offline: true, mark: { memberRef: "m-sana", status: "queued" } }),
};
export const Failed: Story = { render: ready({}, { mark: { memberRef: "m-sana", status: "failed" } }) };
export const NotYet: Story = { render: framed({ state: { status: "notYet" } }) };
export const Closed: Story = { render: framed({ state: { status: "closed" } }) };
export const LoadFailed: Story = { render: framed({ state: { status: "error", kind: "offline" } }) };
