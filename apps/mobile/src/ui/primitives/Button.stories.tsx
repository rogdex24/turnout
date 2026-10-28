import type { Meta, StoryObj } from "@storybook/react-native";
import { ArrowRight } from "phosphor-react-native";
import { Matrix } from "../storybook/Matrix";
import { Button } from "./Button";

const meta: Meta = { title: "Primitives/Button", component: Button };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Primary: Story = {
  render: () => (
    <Matrix padded>
      <Button title="Continue" onPress={noop} />
    </Matrix>
  ),
};
export const Secondary: Story = {
  render: () => (
    <Matrix padded>
      <Button variant="secondary" title="Not now" onPress={noop} />
    </Matrix>
  ),
};
export const Disabled: Story = {
  render: () => (
    <Matrix padded>
      <Button title="Continue" disabled onPress={noop} />
    </Matrix>
  ),
};
export const Loading: Story = {
  render: () => (
    <Matrix padded>
      <Button title="Sending" loading onPress={noop} />
    </Matrix>
  ),
};
export const WithIcon: Story = {
  render: () => (
    <Matrix padded>
      <Button title="Go with a group" icon={ArrowRight} onPress={noop} />
    </Matrix>
  ),
};
