import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { type HeldHandle, SocialView, type SocialViewProps } from "./SocialView";

const meta: Meta = { title: "Screens/Social", component: SocialView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const held = (over: Partial<HeldHandle>): HeldHandle => ({
  state: "approved",
  kind: "instagram",
  handle: "ananya.k",
  rejectReason: null,
  ...over,
});

function frame(props: Partial<SocialViewProps>) {
  return (
    <Matrix framed>
      <SocialView held={held({})} input="" onBack={noop} onInput={noop} onSave={noop} onChangeHandle={noop} {...props} />
    </Matrix>
  );
}

export const Approved: Story = { render: () => frame({}) };
export const Checking: Story = { render: () => frame({ held: held({ state: "pending" }) }) };
export const TurnedDown: Story = { render: () => frame({ held: held({ state: "rejected", rejectReason: "not_found" }) }) };
export const NoHandleYet: Story = { render: () => frame({ held: held({ state: null, kind: null, handle: null }) }) };
export const Typing: Story = {
  render: () => frame({ held: held({ state: "rejected", rejectReason: "private_or_empty" }), input: "@ananya.k" }),
};
export const NotAHandle: Story = {
  render: () =>
    frame({ input: "example", error: "That isn't an Instagram or LinkedIn handle. Paste your handle or the link to your profile." }),
};
export const Sending: Story = { render: () => frame({ input: "@ananya.k", saving: true }) };
export const Sent: Story = { render: () => frame({ held: held({ state: "pending" }), saved: true }) };
