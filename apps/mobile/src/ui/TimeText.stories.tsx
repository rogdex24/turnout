import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Matrix } from "./storybook/Matrix";
import { TimeText } from "./TimeText";

const meta: Meta = { title: "UI/TimeText", component: TimeText };

export default meta;
type Story = StoryObj;

export const Parts: Story = {
  render: () => (
    <Matrix padded>
      <View className="gap-1">
        <TimeText value="2026-11-07T19:00:00+05:30" />
        <TimeText value="2026-11-07T19:00:00+05:30" part="day" />
        <TimeText value="2026-11-07T19:00:00+05:30" part="time" />
        <TimeText value="2026-11-07" />
      </View>
    </Matrix>
  ),
};
