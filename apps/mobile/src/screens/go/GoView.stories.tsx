import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { GoView, type GoViewProps } from "./GoView";

const meta: Meta = { title: "Screens/Go", component: GoView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

// The sheet is a platform Modal, so each story shows it open over a plain screen rather than a four cell matrix.
function sheet(props: Partial<GoViewProps>) {
  return (
    <View className="flex-1 bg-bg">
      <GoView groupType="open" womenOnlyOffered explain onGroupType={noop} onNext={noop} onClose={noop} onFinish={noop} {...props} />
    </View>
  );
}

export const FirstTime: Story = { render: () => sheet({}) };
export const Returning: Story = { render: () => sheet({ explain: false }) };
export const WomenOnly: Story = { render: () => sheet({ groupType: "women_only" }) };
export const NoWomenOnlyChoice: Story = { render: () => sheet({ womenOnlyOffered: false }) };
export const Making: Story = { render: () => sheet({ busy: true }) };
export const MissingSomething: Story = { render: () => sheet({ issue: { kind: "not_matchable", missing: ["photo", "handle"] } }) };
export const Offline: Story = { render: () => sheet({ issue: { kind: "offline" } }) };
export const Stopped: Story = { render: () => sheet({ stopped: true }) };
