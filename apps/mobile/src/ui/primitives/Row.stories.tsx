import type { Meta, StoryObj } from "@storybook/react-native";
import { Bell, UserCircle } from "phosphor-react-native";
import { Matrix } from "../storybook/Matrix";
import { Row } from "./Row";

const meta: Meta = { title: "Primitives/Row", component: Row };

export default meta;
type Story = StoryObj;

const noop = () => undefined;

export const WithSub: Story = {
  render: () => (
    <Matrix>
      <Row icon={UserCircle} title="Profile" sub="Name, photo and handle" caret onPress={noop} />
      <Row icon={Bell} title="Notifications" sub="Group updates and reminders" caret onPress={noop} />
    </Matrix>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <Matrix>
      <Row title="Sign out" onPress={noop} />
    </Matrix>
  ),
};
