import type { Meta, StoryObj } from "@storybook/react-native";
import { showFixture } from "@/api/showFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { ShowView, type ShowViewProps } from "./ShowView";

const meta: Meta = { title: "Screens/Show", component: ShowView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

const base: ShowViewProps = {
  detail: { status: "ready", show: showFixture() },
  lookingCount: 12,
  groupsEnabled: false,
  onBack: noop,
  onRetry: noop,
  onSeeShows: noop,
  onOpenLink: noop,
  onBuy: noop,
  onGo: noop,
  onGoTapped: noop,
};

const ready = (show = showFixture(), over: Partial<ShowViewProps> = {}) => framed({ detail: { status: "ready", show }, ...over });

const framed = (props: Partial<ShowViewProps>) => () => (
  <Matrix framed>
    <ShowView {...base} {...props} />
  </Matrix>
);

export const Loading: Story = { render: framed({ detail: { status: "loading" } }) };
export const Ready: Story = { render: ready() };
export const LookingNone: Story = { render: ready(showFixture(), { lookingCount: 0 }) };
export const LookingOne: Story = { render: ready(showFixture(), { lookingCount: 1 }) };
export const LookingUnknown: Story = { render: ready(showFixture(), { lookingCount: null }) };
export const LongTitle: Story = {
  render: ready(showFixture({ title: "An Evening of Ghazals and Stories from the Old City of Hyderabad", category: "theatre" })),
};
export const FreeNoVenue: Story = {
  render: ready(
    showFixture({
      is_free: true,
      price_min: null,
      price_max: null,
      category: "comedy",
      venue: { name: null, area: "jubilee-hills", lat: null, lng: null },
    }),
  ),
};
export const DateOnlyNoTicket: Story = {
  render: ready(showFixture({ starts_at_local: "2026-11-07", ticket_url: "", price_max: null })),
};
export const NotEligible: Story = { render: ready(showFixture({ group_eligible: false })) };
export const NotFound: Story = { render: framed({ detail: { status: "not_found" } }) };
export const ErrorServer: Story = { render: framed({ detail: { status: "error", kind: "server" } }) };
export const ErrorOffline: Story = { render: framed({ detail: { status: "error", kind: "offline" } }) };
