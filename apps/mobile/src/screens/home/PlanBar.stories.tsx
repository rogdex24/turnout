import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { PlanBar } from "./PlanBar";

const meta: Meta = { title: "Screens/PlanBar", component: PlanBar };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Finding: Story = {
  render: () => (
    <Matrix>
      <PlanBar title="The Monsoon Theory" category="music" when="Fri 8:00 PM" status="Finding your group" live onPress={noop} />
    </Matrix>
  ),
};

export const Settled: Story = {
  render: () => (
    <Matrix>
      <PlanBar title="Telugu Stand-up Night" category="comedy" when="Sat 9:00 PM" status="Group of 4 confirmed" onPress={noop} />
    </Matrix>
  ),
};

export const LongTitle: Story = {
  render: () => (
    <Matrix>
      <PlanBar
        title="An Evening of Carnatic Fusion with the Hyderabad Youth Orchestra"
        category="music"
        when="Sun 6:30 PM"
        status="Finding your group"
        live
        onPress={noop}
      />
    </Matrix>
  ),
};
