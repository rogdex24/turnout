import type { Meta, StoryObj } from "@storybook/react-native";
import { Share } from "phosphor-react-native";
import { BackBar } from "./BackBar";
import { IconButton } from "./primitives/IconButton";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/BackBar", component: BackBar };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Default: Story = {
  render: () => (
    <Matrix>
      <BackBar onBack={noop} />
    </Matrix>
  ),
};
export const WithAction: Story = {
  render: () => (
    <Matrix>
      <BackBar onBack={noop} trailing={<IconButton icon={Share} label="Share" onPress={noop} />} />
    </Matrix>
  ),
};
