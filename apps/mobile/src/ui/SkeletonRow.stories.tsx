import type { Meta, StoryObj } from "@storybook/react-native";
import { SkeletonRow } from "./SkeletonRow";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/SkeletonRow", component: SkeletonRow };

export default meta;
type Story = StoryObj;

export const Line: Story = {
  render: () => (
    <Matrix>
      <SkeletonRow />
    </Matrix>
  ),
};

export const Card: Story = {
  render: () => (
    <Matrix>
      <SkeletonRow card />
    </Matrix>
  ),
};
