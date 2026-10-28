import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Poster } from "./Poster";
import { Matrix } from "./storybook/Matrix";

const meta: Meta = { title: "UI/Poster", component: Poster };

export default meta;
type Story = StoryObj;

const LONG = "An Evening of Stand Up Comedy and Improvised Songs With Friends";

export const PlaceholderFeatured: Story = {
  render: () => (
    <Matrix padded>
      <Poster variant="featured" title="Traffic Jam Tales" category="comedy" />
    </Matrix>
  ),
};

export const PlaceholderTones: Story = {
  render: () => (
    <Matrix padded>
      <View className="gap-3">
        <Poster variant="tile" title="Indie Music Night" category="music" />
        <Poster variant="tile" title="Swami" category="theatre" />
        <Poster variant="tile" title="Pottery Evening" category="workshop" subLine="Workshop" />
      </View>
    </Matrix>
  ),
};

export const LongTitle: Story = {
  render: () => (
    <Matrix padded>
      <Poster variant="featured" title={LONG} category="comedy" />
    </Matrix>
  ),
};

export const Hero: Story = {
  render: () => (
    <Matrix padded>
      <Poster variant="hero" title="Traffic Jam Tales" category="comedy" subLine="Stand-up comedy, Shilpakala Vedika" />
    </Matrix>
  ),
};

export const Thumb: Story = {
  render: () => (
    <Matrix padded>
      <View className="flex-row gap-3">
        <Poster variant="thumb" title="Traffic Jam Tales" category="comedy" />
        <Poster variant="thumb" title="Indie Music Night" category="music" />
        <Poster variant="thumb" title="Swami" category="theatre" />
      </View>
    </Matrix>
  ),
};

export const WithImage: Story = {
  render: () => (
    <Matrix padded>
      <Poster variant="featured" title="Traffic Jam Tales" category="comedy" imageUrl="https://example.com/poster.jpg" />
    </Matrix>
  ),
};
