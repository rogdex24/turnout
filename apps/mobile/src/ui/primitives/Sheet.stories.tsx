import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Sheet } from "./Sheet";
import { Text } from "./Text";

const meta: Meta = { title: "Primitives/Sheet", component: Sheet };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

// A sheet is a platform Modal, so one story shows it open over the screen rather than a four cell matrix.
export const Open: Story = {
  render: () => (
    <View className="flex-1 bg-bg">
      <Sheet
        visible
        title="Coming soon in this build"
        lead="Groups are not open yet. You can still browse shows and buy tickets."
        onClose={noop}
        primary={{ title: "Got it", onPress: noop }}
        secondary={{ title: "Close", onPress: noop }}
      >
        <Text variant="body">Open the show page to buy a ticket.</Text>
      </Sheet>
    </View>
  ),
};
