import type { Meta, StoryObj } from "@storybook/react-native";
import { typography } from "@turnout/design-tokens";
import { Matrix } from "../storybook/Matrix";
import { Text } from "./Text";

const meta: Meta = { title: "Primitives/Text", component: Text };

export default meta;
type Story = StoryObj;

/** Every type token in DESIGN.md, one line each. The display faces stay fixed at the largest text size. */
export const Scale: Story = {
  render: () => (
    <Matrix padded>
      {(Object.keys(typography) as (keyof typeof typography)[]).map((token) => (
        <Text key={token} variant={token} numberOfLines={1}>
          {token}
        </Text>
      ))}
    </Matrix>
  ),
};

export const Tabular: Story = {
  render: () => (
    <Matrix padded>
      <Text variant="body" tabular>
        Sat 7 Nov, 7:00 PM, ₹1,499
      </Text>
    </Matrix>
  ),
};
