import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { BlockedView, type BlockedViewProps } from "./BlockedView";

const meta: Meta = { title: "Screens/SettingsBlocked", component: BlockedView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

function frame(state: BlockedViewProps["state"]) {
  return (
    <Matrix framed>
      <BlockedView state={state} onBack={noop} />
    </Matrix>
  );
}

export const Two: Story = {
  render: () =>
    frame({
      kind: "ready",
      people: [
        { firstName: "Rohan", context: "Comedy Night, Fri 30 Oct" },
        { firstName: "Meera", context: "The Monsoon Theory, Sat 17 Oct" },
      ],
    }),
};
export const Nobody: Story = { render: () => frame({ kind: "ready", people: [] }) };
export const Loading: Story = { render: () => frame({ kind: "loading" }) };
export const Failed: Story = { render: () => frame({ kind: "failed", offline: false, onRetry: noop }) };
export const Offline: Story = { render: () => frame({ kind: "failed", offline: true, onRetry: noop }) };
