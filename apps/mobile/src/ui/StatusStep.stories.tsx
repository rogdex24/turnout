import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { StatusStep } from "./StatusStep";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/StatusStep", component: StatusStep };

export default meta;
type Story = StoryObj;

export const Tones: Story = {
  render: () => (
    <Matrix padded>
      <View className="gap-3">
        <StatusStep tone="live">Finding your group</StatusStep>
        <StatusStep tone="done">Ticket added</StatusStep>
        <StatusStep tone="waiting">Waiting for your ticket</StatusStep>
      </View>
    </Matrix>
  ),
};
