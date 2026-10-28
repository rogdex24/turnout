import type { Meta, StoryObj } from "@storybook/react-native";
import { typography } from "@turnout/design-tokens";
import { ScrollView } from "react-native";
import { Text } from "./Text";

const meta = { title: "Primitives/Text", component: Text } satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every type token in DESIGN.md, one line each. */
export const Scale: Story = {
  render: () => (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="gap-3 p-4">
      {(Object.keys(typography) as (keyof typeof typography)[]).map((token) => (
        <Text key={token} variant={token}>
          {token}
        </Text>
      ))}
    </ScrollView>
  ),
};
