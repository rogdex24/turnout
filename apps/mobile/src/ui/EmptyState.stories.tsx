import type { Meta, StoryObj } from "@storybook/react-native";
import { CalendarCheck } from "phosphor-react-native";
import { EmptyState } from "./EmptyState";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/EmptyState", component: EmptyState };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Plain: Story = {
  render: () => (
    <Matrix>
      <EmptyState icon={CalendarCheck} title="No plans yet" body="Pick a show and go with a group." />
    </Matrix>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Matrix>
      <EmptyState
        icon={CalendarCheck}
        title="No shows in this area"
        body="Try another area."
        action={{ title: "Show all areas", onPress: noop }}
      />
    </Matrix>
  ),
};
