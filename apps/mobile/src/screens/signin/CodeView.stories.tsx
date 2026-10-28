import type { Meta, StoryObj } from "@storybook/react-native";
import { signin } from "@/copy/signin";
import { Matrix } from "@/ui/storybook/Matrix";
import { CodeView, type CodeViewProps } from "./CodeView";
import { SAMPLE_LABEL } from "./fixtures";

const meta: Meta = { title: "Screens/SignInCode", component: CodeView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const base: CodeViewProps = {
  phoneLabel: SAMPLE_LABEL,
  value: "",
  onChangeText: noop,
  onSendAgain: noop,
  onPaste: noop,
  onChangeNumber: noop,
  onBack: noop,
};

const framed = (props: Partial<CodeViewProps>) => () => (
  <Matrix framed>
    <CodeView {...base} {...props} />
  </Matrix>
);

export const Empty: Story = { render: framed({}) };
export const Partial: Story = { render: framed({ value: "482" }) };
export const Checking: Story = { render: framed({ value: "482913", checking: true }) };
export const WrongCode: Story = { render: framed({ message: signin.code.wrong(4) }) };
export const LastTry: Story = { render: framed({ message: signin.code.wrong(1) }) };
export const TooManyTries: Story = {
  render: framed({ message: signin.code.tooManyTries, askAgain: true }),
};
export const Refused: Story = { render: framed({ message: signin.code.refused }) };
export const NotThereYet: Story = { render: framed({ askAgain: true }) };
export const SendAgainWait: Story = { render: framed({ askAgain: true, resendInSeconds: 24 }) };
export const Resending: Story = { render: framed({ askAgain: true, resending: true }) };
export const NewCodeSent: Story = { render: framed({ askAgain: true, message: signin.code.resent }) };
export const NotDelivered: Story = { render: framed({ askAgain: true, message: signin.code.notDelivered }) };
export const Undeliverable: Story = { render: framed({ notOnWhatsApp: true }) };
export const Offline: Story = { render: framed({ message: signin.code.offline }) };
export const UpdateApp: Story = { render: framed({ message: signin.code.updateApp }) };
