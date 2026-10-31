import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { SafetyView } from "./SafetyView";

const meta: Meta = { title: "Screens/SettingsSafety", component: SafetyView };

export default meta;
type Story = StoryObj;

export const Page: Story = {
  render: () => (
    <Matrix framed>
      <SafetyView onBack={() => undefined} onCall={() => undefined} />
    </Matrix>
  ),
};
