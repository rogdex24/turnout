import type { Meta, StoryObj } from "@storybook/react-native";
import { CaretLeft, Share } from "phosphor-react-native";
import { View } from "react-native";
import { Matrix } from "../storybook/Matrix";
import { IconButton } from "./IconButton";

const meta: Meta = { title: "Primitives/IconButton", component: IconButton };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Back: Story = {
  render: () => (
    <Matrix padded>
      <IconButton icon={CaretLeft} label="Back" onPress={noop} />
    </Matrix>
  ),
};

export const Ring: Story = {
  render: () => (
    <Matrix padded>
      <IconButton icon={Share} label="Share" ring onPress={noop} />
    </Matrix>
  ),
};

export const OnPhoto: Story = {
  render: () => (
    <Matrix padded>
      <View className="bg-poster-music p-4">
        <IconButton icon={CaretLeft} label="Back" onPhoto onPress={noop} />
      </View>
    </Matrix>
  ),
};
