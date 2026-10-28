import type { Meta, StoryObj } from "@storybook/react-native";
import { showFixture } from "@/api/showFixtures";
import { Matrix } from "@/ui/storybook/Matrix";
import { FeaturedCard, ShowTile } from "./ShowCard";

const meta: Meta = { title: "Screens/ShowCard", component: ShowTile };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const Featured: Story = {
  render: () => (
    <Matrix padded>
      <FeaturedCard show={showFixture()} onPress={noop} />
    </Matrix>
  ),
};

export const FeaturedFreeNoVenue: Story = {
  render: () => (
    <Matrix padded>
      <FeaturedCard
        show={showFixture({
          is_free: true,
          price_min: null,
          price_max: null,
          venue: { name: null, area: "jubilee-hills", lat: null, lng: null },
        })}
        onPress={noop}
      />
    </Matrix>
  ),
};

export const FeaturedDateOnly: Story = {
  render: () => (
    <Matrix padded>
      <FeaturedCard show={showFixture({ starts_at_local: "2026-11-07", price_max: null })} onPress={noop} />
    </Matrix>
  ),
};

export const Tile: Story = {
  render: () => (
    <Matrix padded>
      <ShowTile show={showFixture({ title: "Telugu Stand-up Night", category: "comedy" })} onPress={noop} />
    </Matrix>
  ),
};

export const TileLongTitle: Story = {
  render: () => (
    <Matrix padded>
      <ShowTile
        show={showFixture({ title: "An Evening of Carnatic Fusion with the Hyderabad Youth Orchestra", category: "music" })}
        onPress={noop}
      />
    </Matrix>
  ),
};
