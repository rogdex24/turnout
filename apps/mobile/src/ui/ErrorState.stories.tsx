import type { Meta, StoryObj } from "@storybook/react-native";
import { ErrorState } from "./ErrorState";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/ErrorState", component: ErrorState };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Offline: Story = {
  render: () => (
    <Matrix>
      <ErrorState kind="offline" onRetry={noop} />
    </Matrix>
  ),
};

export const Server: Story = {
  render: () => (
    <Matrix>
      <ErrorState kind="server" onRetry={noop} />
    </Matrix>
  ),
};
