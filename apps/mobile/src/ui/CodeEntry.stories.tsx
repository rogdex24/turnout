import type { Meta, StoryObj } from "@storybook/react-native";
import { CodeEntry } from "./CodeEntry";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "Components/CodeEntry", component: CodeEntry };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Empty: Story = {
  render: () => (
    <Matrix padded>
      <CodeEntry value="" onChangeText={noop} label="6 digit code" progress="0 of 6 entered" />
    </Matrix>
  ),
};

export const PartlyFilled: Story = {
  render: () => (
    <Matrix padded>
      <CodeEntry value="481" onChangeText={noop} label="6 digit code" progress="3 of 6 entered" />
    </Matrix>
  ),
};

export const Full: Story = {
  render: () => (
    <Matrix padded>
      <CodeEntry value="481926" onChangeText={noop} label="6 digit code" progress="6 of 6 entered" />
    </Matrix>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Matrix padded>
      <CodeEntry value="481926" onChangeText={noop} editable={false} label="6 digit code" progress="6 of 6 entered" />
    </Matrix>
  ),
};
