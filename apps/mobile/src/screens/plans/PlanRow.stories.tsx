import type { Meta, StoryObj } from "@storybook/react-native";
import { PLANS } from "@/model/planFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { PlanRow } from "./PlanRow";

const meta: Meta = { title: "Components/PlanRow", component: PlanRow };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const EveryState: Story = {
  render: () => (
    <Matrix padded>
      {Object.values(PLANS).map((plan) => (
        <PlanRow key={plan.id} plan={plan} onPress={noop} />
      ))}
    </Matrix>
  ),
};
