import type { Meta, StoryObj } from "@storybook/react-native";
import { Matrix } from "@/ui/storybook/Matrix";
import { SAMPLE_GRIEVANCE } from "../notice/fixtures";
import { GrievanceView, type GrievanceViewState } from "./GrievanceView";

const meta: Meta = { title: "Screens/SettingsGrievance", component: GrievanceView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

function frame(state: GrievanceViewState) {
  return (
    <Matrix framed>
      <GrievanceView state={state} onBack={noop} onEmail={noop} onCall={noop} />
    </Matrix>
  );
}

export const Ready: Story = { render: () => frame({ kind: "ready", officer: SAMPLE_GRIEVANCE }) };
export const DetailsNotSet: Story = { render: () => frame({ kind: "not_set" }) };
export const Loading: Story = { render: () => frame({ kind: "loading" }) };
export const Failed: Story = { render: () => frame({ kind: "failed", onRetry: noop }) };
