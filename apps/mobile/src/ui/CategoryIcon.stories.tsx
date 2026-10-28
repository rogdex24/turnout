import type { Meta, StoryObj } from "@storybook/react-native";
import { CATEGORIES } from "@turnout/contract/category";
import { View } from "react-native";
import { CategoryIcon } from "./CategoryIcon";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/CategoryIcon", component: CategoryIcon };

export default meta;
type Story = StoryObj;

export const All: Story = {
  render: () => (
    <Matrix padded>
      <View className="flex-row flex-wrap gap-4">
        {CATEGORIES.map((category) => (
          <CategoryIcon key={category} category={category} />
        ))}
      </View>
    </Matrix>
  ),
};
