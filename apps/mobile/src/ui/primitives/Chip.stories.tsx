import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Matrix } from "../storybook/Matrix";
import { Chip } from "./Chip";

const meta: Meta = { title: "Primitives/Chip", component: Chip };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Default: Story = {
  render: () => (
    <Matrix padded>
      <View className="flex-row flex-wrap gap-2">
        <Chip label="Jubilee Hills" onPress={noop} />
        <Chip label="Banjara Hills" onPress={noop} />
      </View>
    </Matrix>
  ),
};

export const Selected: Story = {
  render: () => (
    <Matrix padded>
      <View className="flex-row flex-wrap gap-2">
        <Chip label="All areas" selected onPress={noop} />
        <Chip label="Gachibowli" onPress={noop} />
      </View>
    </Matrix>
  ),
};
