import type { Meta, StoryObj } from "@storybook/react-native";
import { notice } from "@/copy/notice";
import { Matrix } from "@/ui/storybook/Matrix";
import { SAMPLE_GRIEVANCE } from "./fixtures";
import { NoticeView } from "./NoticeView";

const meta: Meta = { title: "Screens/Notice", component: NoticeView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
const ready = { kind: "ready", officer: SAMPLE_GRIEVANCE } as const;

export const Ready: Story = {
  render: () => (
    <Matrix framed>
      <NoticeView grievance={ready} onRetryGrievance={noop} onAgree={noop} />
    </Matrix>
  ),
};
export const LoadingContact: Story = {
  render: () => (
    <Matrix framed>
      <NoticeView grievance={{ kind: "loading" }} onRetryGrievance={noop} onAgree={noop} />
    </Matrix>
  ),
};
export const ContactFailed: Story = {
  render: () => (
    <Matrix framed>
      <NoticeView grievance={{ kind: "failed" }} onRetryGrievance={noop} onAgree={noop} />
    </Matrix>
  ),
};
export const Agreeing: Story = {
  render: () => (
    <Matrix framed>
      <NoticeView grievance={ready} onRetryGrievance={noop} onAgree={noop} agreeing />
    </Matrix>
  ),
};
export const Changed: Story = {
  render: () => (
    <Matrix framed>
      <NoticeView grievance={ready} onRetryGrievance={noop} onAgree={noop} changed />
    </Matrix>
  ),
};
export const Offline: Story = {
  render: () => (
    <Matrix framed>
      <NoticeView grievance={ready} onRetryGrievance={noop} onAgree={noop} changed error={notice.errors.offline} />
    </Matrix>
  ),
};
