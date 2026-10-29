import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { NotificationsView, type NotificationsViewProps } from "./NotificationsView";

const meta: Meta = { title: "Screens/SettingsNotifications", component: NotificationsView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

function frame(permission: NotificationsViewProps["permission"]) {
  return (
    <Matrix framed>
      <NotificationsView permission={permission} onBack={noop} onOpenSettings={noop} />
    </Matrix>
  );
}

export const On: Story = { render: () => frame("granted") };
export const Off: Story = { render: () => frame("denied") };
export const NotAskedYet: Story = { render: () => frame("undetermined") };
export const Reading: Story = { render: () => frame(null) };
