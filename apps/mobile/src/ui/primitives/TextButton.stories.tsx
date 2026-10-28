import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Matrix } from "../storybook/Matrix";
import { TextButton } from "./TextButton";

const meta: Meta = { title: "Primitives/TextButton", component: TextButton };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Plain: Story = {
  render: () => (
    <Matrix padded>
      <TextButton title="Skip" onPress={noop} />
    </Matrix>
  ),
};
export const Link: Story = {
  render: () => (
    <Matrix padded>
      <TextButton link title="Change number" onPress={noop} />
    </Matrix>
  ),
};
export const OnPhoto: Story = {
  render: () => (
    <Matrix padded>
      <View className="items-end bg-poster-music p-4">
        <TextButton onPhoto title="Skip" onPress={noop} />
      </View>
    </Matrix>
  ),
};
