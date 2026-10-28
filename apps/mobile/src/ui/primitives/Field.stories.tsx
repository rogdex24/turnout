import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "../storybook/Matrix";
import { Field } from "./Field";

const meta: Meta = { title: "Primitives/Field", component: Field };

export default meta;
type Story = StoryObj;

export const Empty: Story = {
  render: () => (
    <Matrix padded>
      <Field label="First name" placeholder="Your first name" help="This is the name your group sees." />
    </Matrix>
  ),
};

export const Filled: Story = {
  render: () => (
    <Matrix padded>
      <Field label="First name" defaultValue="Asha" />
    </Matrix>
  ),
};

export const WithError: Story = {
  render: () => (
    <Matrix padded>
      <Field label="First name" defaultValue="A" error="Use at least 2 letters." />
    </Matrix>
  ),
};
