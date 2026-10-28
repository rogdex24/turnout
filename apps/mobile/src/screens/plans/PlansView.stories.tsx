import type { Meta, StoryObj } from "@storybook/react-native";
import { PLANS, planFixture } from "@/model/planFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { PlansView, type PlansViewProps } from "./PlansView";

const meta: Meta = { title: "Screens/Plans", component: PlansView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

const base: PlansViewProps = {
  state: { status: "ready", plans: Object.values(PLANS) },
  onRefresh: noop,
  onRetry: noop,
  onOpenPlan: noop,
  onFindShow: noop,
};

const framed = (props: Partial<PlansViewProps>) => () => (
  <Matrix framed>
    <PlansView {...base} {...props} />
  </Matrix>
);

const past = (id: string) => planFixture({ id, state: "done", ticket: { state: "approved", rejectReason: null } });

export const Loading: Story = { render: framed({ state: { status: "loading" } }) };
export const Empty: Story = { render: framed({ state: { status: "ready", plans: [] } }) };
export const EveryState: Story = { render: framed({}) };
export const UpcomingOnly: Story = {
  render: framed({ state: { status: "ready", plans: [PLANS.needs_ticket, PLANS.finding_group] } }),
};
export const PastOnly: Story = { render: framed({ state: { status: "ready", plans: [past("past-1"), PLANS.withdrawn] } }) };
export const Refreshing: Story = { render: framed({ refreshing: true }) };
export const Offline: Story = { render: framed({ offline: true }) };
export const ErrorServer: Story = { render: framed({ state: { status: "error", kind: "server" } }) };
