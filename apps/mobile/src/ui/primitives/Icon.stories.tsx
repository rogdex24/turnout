import type { Meta, StoryObj } from "@storybook/react-native";
import { CalendarCheck, Ticket, UserCircle } from "phosphor-react-native";
import { View } from "react-native";
import { Matrix } from "../storybook/Matrix";
import { Icon, type IconTone } from "./Icon";

const meta: Meta = { title: "Primitives/Icon", component: Icon };

export default meta;
type Story = StoryObj;

const TONES: IconTone[] = ["ink", "muted", "signal"];

export const Tones: Story = {
  render: () => (
    <Matrix padded>
      <View className="flex-row gap-4">
        {TONES.map((tone) => (
          <Icon key={tone} icon={Ticket} tone={tone} />
        ))}
      </View>
    </Matrix>
  ),
};

export const Weights: Story = {
  render: () => (
    <Matrix padded>
      <View className="flex-row gap-4">
        <Icon icon={Ticket} />
        <Icon icon={CalendarCheck} weight="fill" />
        <Icon icon={UserCircle} weight="bold" size="sm" />
      </View>
    </Matrix>
  ),
};
