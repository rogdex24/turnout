import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Button } from "./Button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  decorators: [
    (Story) => (
      <View className="flex-1 justify-center bg-bg px-4">
        <Story />
      </View>
    ),
  ],
  args: { title: "Continue" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary", title: "Not now" } };
export const Disabled: Story = { args: { variant: "primary", disabled: true } };
