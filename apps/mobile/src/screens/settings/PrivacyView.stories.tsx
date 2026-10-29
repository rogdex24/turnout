import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { PrivacyView } from "./PrivacyView";

const meta: Meta = { title: "Screens/SettingsPrivacy", component: PrivacyView };

export default meta;
type Story = StoryObj;

export const Notice: Story = {
  render: () => (
    <Matrix framed>
      <PrivacyView version="2026-10-26" onBack={() => undefined} />
    </Matrix>
  ),
};
