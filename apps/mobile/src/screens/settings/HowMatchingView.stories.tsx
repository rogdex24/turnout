import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { HowMatchingView } from "./HowMatchingView";

const meta: Meta = { title: "Screens/SettingsHowMatching", component: HowMatchingView };

export default meta;
type Story = StoryObj;

export const Page: Story = {
  render: () => (
    <Matrix framed>
      <HowMatchingView onBack={() => undefined} />
    </Matrix>
  ),
};
