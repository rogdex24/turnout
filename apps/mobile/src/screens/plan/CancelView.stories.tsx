import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { common } from "@/copy/common";
import { CancelView, type CancelViewProps } from "./CancelView";

const meta: Meta = { title: "Screens/Cancel", component: CancelView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

// The sheet is a platform Modal, so each story shows it open over a plain screen rather than a four cell matrix.
function sheet(props: Partial<CancelViewProps>) {
  return (
    <View className="flex-1 bg-bg">
      <CancelView hasGroup={false} onLeave={noop} onStay={noop} {...props} />
    </View>
  );
}

export const NoGroup: Story = { render: () => sheet({}) };
export const InAGroup: Story = { render: () => sheet({ hasGroup: true }) };
export const Leaving: Story = { render: () => sheet({ busy: true }) };
export const Failed: Story = { render: () => sheet({ issue: common.errorGeneric }) };
