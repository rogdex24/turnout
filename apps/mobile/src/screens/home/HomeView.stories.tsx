import type { Meta, StoryObj } from "@storybook/react-native";
import { SHOWS, showFixture } from "@/api/showFixtures";
import { dayGroups, listItems } from "@/model/showList";
import { Matrix } from "@/ui/storybook/Matrix";
import { type HomeList, HomeView, type HomeViewProps } from "./HomeView";

const meta: Meta = { title: "Screens/Home", component: HomeView };

export default meta;
type Story = StoryObj;

const noop = () => undefined;
/** The list is built against a fixed clock, so the story reads the same every day. */
const NOW = Date.parse("2026-10-30T09:00:00+05:30");
const ready = (shows = SHOWS): HomeList => ({ status: "ready", items: listItems(dayGroups(shows, NOW)) });

const AREAS = [
  { slug: "hitec-city", label: "Hitec City" },
  { slug: "jubilee-hills", label: "Jubilee Hills" },
  { slug: "banjara-hills", label: "Banjara Hills" },
];

const base: HomeViewProps = {
  list: ready(),
  areas: AREAS,
  selectedArea: null,
  onSelectArea: noop,
  strip: null,
  plan: null,
  offline: false,
  refreshing: false,
  onRefresh: noop,
  onEndReached: noop,
  more: "idle",
  onRetryMore: noop,
  onRetry: noop,
  onOpenShow: noop,
};

const framed = (props: Partial<HomeViewProps>) => () => (
  <Matrix framed>
    <HomeView {...base} {...props} />
  </Matrix>
);

export const Loading: Story = { render: framed({ list: { status: "loading" } }) };
export const Loaded: Story = { render: framed({}) };
export const LoadingMore: Story = { render: framed({ more: "loading" }) };
export const LoadMoreFailed: Story = { render: framed({ more: "failed" }) };
export const Refreshing: Story = { render: framed({ refreshing: true }) };
export const Empty: Story = { render: framed({ list: ready([]), areas: [] }) };
export const AreaFiltered: Story = {
  render: framed({
    selectedArea: "banjara-hills",
    list: ready(SHOWS.filter((show) => show.venue.area === "banjara-hills")),
  }),
};
export const EmptyArea: Story = { render: framed({ selectedArea: "jubilee-hills", list: ready([]) }) };
export const OneShow: Story = { render: framed({ list: ready([showFixture()]) }) };
export const ErrorServer: Story = { render: framed({ list: { status: "error", kind: "server" } }) };
export const ErrorOffline: Story = { render: framed({ list: { status: "error", kind: "offline" }, offline: true }) };
export const Offline: Story = { render: framed({ offline: true }) };
export const HandlePending: Story = { render: framed({ strip: { state: "pending" } }) };
export const HandleRejected: Story = {
  render: framed({ strip: { state: "rejected", reason: "private_or_empty", onChange: noop } }),
};
export const WithPlan: Story = {
  render: framed({
    plan: {
      title: "The Monsoon Theory",
      category: "music",
      when: "Fri 8:00 PM",
      status: "Finding your group",
      live: true,
      onPress: noop,
    },
  }),
};
