import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { PersonAvatar } from "./PersonAvatar";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/PersonAvatar", component: PersonAvatar };

export default meta;
type Story = StoryObj;

export const Sizes: Story = {
  render: () => (
    <Matrix padded>
      <View className="flex-row items-end gap-3">
        <PersonAvatar name="Asha" />
        <PersonAvatar name="Ravi" size="sm" />
        <PersonAvatar name="Meera" size="xs" />
        <PersonAvatar name="Kiran" size="lg" />
      </View>
    </Matrix>
  ),
};

export const CheckedIn: Story = {
  render: () => (
    <Matrix padded>
      <PersonAvatar name="Asha" ring />
    </Matrix>
  ),
};
