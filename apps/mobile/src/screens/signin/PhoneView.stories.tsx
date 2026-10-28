import type { Meta, StoryObj } from "@storybook/react-native";
import { signin } from "@/copy/signin";
import { Matrix } from "@/ui/storybook/Matrix";
import { SAMPLE_FIELD } from "./fixtures";
import { PhoneView } from "./PhoneView";

const meta: Meta = { title: "Screens/SignInPhone", component: PhoneView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const FILLED = SAMPLE_FIELD;

export const Empty: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value="" onChangeText={noop} onSend={noop} onBack={noop} />
    </Matrix>
  ),
};
export const Filled: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} />
    </Matrix>
  ),
};
export const Sending: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} sending />
    </Matrix>
  ),
};
export const NoWhatsApp: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value="" onChangeText={noop} onSend={noop} onBack={noop} noWhatsApp />
    </Matrix>
  ),
};
export const BadNumber: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={SAMPLE_FIELD.slice(0, 5)} onChangeText={noop} onSend={noop} onBack={noop} error={signin.phone.errors.badPhone} />
    </Matrix>
  ),
};
export const Refused: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} error={signin.phone.errors.refused} />
    </Matrix>
  ),
};
export const Paused: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} error={signin.phone.errors.paused} />
    </Matrix>
  ),
};
export const WaitToTryAgain: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} error={signin.phone.errors.wait(120)} />
    </Matrix>
  ),
};
export const CouldNotSend: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} error={signin.phone.errors.couldNotSend} />
    </Matrix>
  ),
};
export const Offline: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} error={signin.phone.errors.offline} />
    </Matrix>
  ),
};
export const ServerError: Story = {
  render: () => (
    <Matrix framed>
      <PhoneView value={FILLED} onChangeText={noop} onSend={noop} onBack={noop} error={signin.phone.errors.server} />
    </Matrix>
  ),
};
