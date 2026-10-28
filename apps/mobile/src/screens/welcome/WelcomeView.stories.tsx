import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { WelcomeView } from "./WelcomeView";

const meta: Meta = { title: "Screens/Welcome", component: WelcomeView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const FirstCard: Story = {
  render: () => (
    <Matrix framed>
      <WelcomeView onDone={noop} />
    </Matrix>
  ),
};
export const SecondCard: Story = {
  render: () => (
    <Matrix framed>
      <WelcomeView onDone={noop} initialIndex={1} />
    </Matrix>
  ),
};
export const LastCard: Story = {
  render: () => (
    <Matrix framed>
      <WelcomeView onDone={noop} initialIndex={2} />
    </Matrix>
  ),
};
