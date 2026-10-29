import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { TicketView, type TicketViewProps } from "./TicketView";

const meta: Meta = { title: "Screens/Ticket", component: TicketView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const file = { uri: "file:///cache/shot.png", name: "Screenshot 2026-10-28.png", mime: "image/png", bytes: 240_000 };

function frame(props: Partial<TicketViewProps>) {
  return (
    <Matrix framed>
      <TicketView
        phase="add"
        show={{ title: "The Monsoon Theory", when: "Fri 30 Oct, 8:00 PM" }}
        proofKind="screenshot"
        file={null}
        onBack={noop}
        onChoose={noop}
        onSend={noop}
        onLater={noop}
        onDone={noop}
        onNotify={noop}
        onNotNow={noop}
        {...props}
      />
    </Matrix>
  );
}

export const Empty: Story = { render: () => frame({}) };
export const EmptyPdfAllowed: Story = { render: () => frame({ proofKind: "screenshot_or_pdf" }) };
export const Chosen: Story = { render: () => frame({ file }) };
export const ChosenPdf: Story = {
  render: () => frame({ proofKind: "screenshot_or_pdf", file: { ...file, name: "ticket.pdf", mime: "application/pdf" } }),
};
export const Sending: Story = { render: () => frame({ file, uploading: true, progress: 0.4 }) };
export const WrongKind: Story = { render: () => frame({ file, problem: "screenshot_required" }) };
export const TooLarge: Story = { render: () => frame({ file, problem: "too_large" }) };
export const Offline: Story = { render: () => frame({ file, offline: true, problem: "offline" }) };
export const Checking: Story = { render: () => frame({ phase: "checking" }) };
export const CheckingWithAsk: Story = { render: () => frame({ phase: "checking", askNotify: true }) };
export const Rejected: Story = { render: () => frame({ phase: "rejected", rejectReason: "wrong_date" }) };
export const RejectedWithNewFile: Story = { render: () => frame({ phase: "rejected", rejectReason: "unreadable", file }) };
