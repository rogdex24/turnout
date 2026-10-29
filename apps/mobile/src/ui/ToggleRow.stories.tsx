import type { Meta, StoryObj } from "@storybook/react-native";
import { ShieldCheck } from "phosphor-react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { ToggleRow } from "./ToggleRow";

const meta: Meta = { title: "UI/ToggleRow", component: ToggleRow };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Off: Story = {
  render: () => (
    <Matrix framed>
      <ToggleRow
        icon={ShieldCheck}
        title="Women and non-binary groups only"
        sub="Applies to plans you join from now on."
        value={false}
        onValueChange={noop}
      />
    </Matrix>
  ),
};
export const On: Story = {
  render: () => (
    <Matrix framed>
      <ToggleRow
        icon={ShieldCheck}
        title="Women and non-binary groups only"
        sub="Applies to plans you join from now on."
        value
        onValueChange={noop}
      />
    </Matrix>
  ),
};
export const Saving: Story = {
  render: () => (
    <Matrix framed>
      <ToggleRow title="Share usage data" value disabled onValueChange={noop} />
    </Matrix>
  ),
};
export const Failed: Story = {
  render: () => (
    <Matrix framed>
      <ToggleRow
        title="Women and non-binary groups only"
        value={false}
        onValueChange={noop}
        error="You're offline. Connect and try again."
      />
    </Matrix>
  ),
};
