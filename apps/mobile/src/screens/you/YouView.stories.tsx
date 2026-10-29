import type { Meta, StoryObj } from "@storybook/react-native";
import { you } from "@/copy/you";
import { Matrix } from "@/ui/storybook/Matrix";
import { YouView, type YouViewProps } from "./YouView";

const meta: Meta = { title: "Screens/You", component: YouView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const base: YouViewProps = {
  firstName: "Ananya",
  handleState: "approved",
  womenOnly: { available: true, value: false },
  usageData: true,
  noticeVersion: "2026-10-26",
  onOpen: noop,
  onWomenOnly: noop,
  onUsageData: noop,
  onSignOut: noop,
};

function frame(props: Partial<YouViewProps>) {
  return (
    <Matrix framed>
      <YouView {...base} {...props} />
    </Matrix>
  );
}

export const WomanWithWomenOnlyOff: Story = { render: () => frame({}) };
export const WomenOnlyOn: Story = { render: () => frame({ womenOnly: { available: true, value: true } }) };
export const WomenOnlySaving: Story = { render: () => frame({ womenOnly: { available: true, value: true, saving: true } }) };
export const WomenOnlyFailed: Story = {
  render: () => frame({ womenOnly: { available: true, value: false, error: you.womenOnly.errors.server } }),
};
export const NoWomenOnlyForAMan: Story = { render: () => frame({ womenOnly: { available: false, value: false } }) };
export const HandleBeingChecked: Story = { render: () => frame({ handleState: "pending", usageData: false }) };
export const HandleTurnedDown: Story = { render: () => frame({ handleState: "rejected" }) };
