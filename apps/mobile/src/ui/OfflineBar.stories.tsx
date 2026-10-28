import type { Meta, StoryObj } from "@storybook/react-native";
import { OfflineBar } from "./OfflineBar";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/OfflineBar", component: OfflineBar };

export default meta;
type Story = StoryObj;

export const Default: Story = {
  render: () => (
    <Matrix>
      <OfflineBar />
    </Matrix>
  ),
};
