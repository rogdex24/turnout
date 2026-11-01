import type { Meta, StoryObj } from "@storybook/react-native";
import { MEMBERS } from "@/api/groupFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { type ReportPerson, ReportView, type ReportViewProps } from "./ReportView";

const meta: Meta = { title: "Screens/Report", component: ReportView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

const people: ReportPerson[] = MEMBERS.filter((member) => !member.isYou).map(({ memberRef, firstName, photoUrl }) => ({
  memberRef,
  firstName,
  photoUrl,
  memoryCacheKey: `g1:${memberRef}`,
}));

const base: ReportViewProps = {
  state: { status: "form", people, initialMemberRef: null, aboutMessage: false },
  offline: false,
  sending: false,
  failed: false,
  onBack: noop,
  onRetry: noop,
  onCall: noop,
  onSubmit: () => null,
  onDone: noop,
};

const framed = (props: Partial<ReportViewProps>) => () => (
  <Matrix framed>
    <ReportView {...base} {...props} />
  </Matrix>
);

export const Loading: Story = { render: framed({ state: { status: "loading" } }) };
export const ErrorOffline: Story = { render: framed({ state: { status: "error", kind: "offline" }, offline: true }) };
export const NobodyPicked: Story = { render: framed({}) };
export const AboutAMessage: Story = {
  render: framed({ state: { status: "form", people, initialMemberRef: "m-sana", aboutMessage: true } }),
};
export const Sending: Story = {
  render: framed({ state: { status: "form", people, initialMemberRef: "m-sana", aboutMessage: false }, sending: true }),
};
export const NotSent: Story = {
  render: framed({ state: { status: "form", people, initialMemberRef: "m-sana", aboutMessage: false }, failed: true }),
};
export const Offline: Story = {
  render: framed({ state: { status: "form", people, initialMemberRef: "m-sana", aboutMessage: false }, offline: true }),
};
export const Queued: Story = { render: framed({ state: { status: "queued" }, offline: true }) };
export const Sent: Story = { render: framed({ state: { status: "sent" } }) };
