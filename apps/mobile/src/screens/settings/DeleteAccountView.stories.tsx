import type { Meta, StoryObj } from "@storybook/react-native";
import { deleteAccount } from "@/copy/deleteAccount";
import { Matrix } from "@/ui/storybook/Matrix";
import { DeleteAccountView, type DeleteAccountViewProps } from "./DeleteAccountView";

const meta: Meta = { title: "Screens/SettingsDeleteAccount", component: DeleteAccountView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const base: DeleteAccountViewProps = {
  step: "explain",
  last4: "0123",
  groupWillBeTold: false,
  code: "",
  onCodeChange: noop,
  onContinue: noop,
  onSend: noop,
  onSendAgain: noop,
  onKeep: noop,
  onBack: noop,
};

function frame(props: Partial<DeleteAccountViewProps>) {
  return (
    <Matrix framed>
      <DeleteAccountView {...base} {...props} />
    </Matrix>
  );
}

export const Explain: Story = { render: () => frame({}) };
export const ExplainWithAGroupSoon: Story = { render: () => frame({ groupWillBeTold: true }) };
export const Confirm: Story = { render: () => frame({ step: "confirm" }) };
export const Sending: Story = { render: () => frame({ step: "confirm", sending: true }) };
export const CouldNotSend: Story = { render: () => frame({ step: "confirm", message: deleteAccount.errors.cantSend }) };
export const EnterCode: Story = { render: () => frame({ step: "code" }) };
export const WrongCode: Story = { render: () => frame({ step: "code", message: deleteAccount.errors.wrong(4) }) };
export const Deleting: Story = { render: () => frame({ step: "code", code: "123456", deleting: true }) };
