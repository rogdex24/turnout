import type { Meta, StoryObj } from "@storybook/react-native";
import { Info } from "phosphor-react-native";
import { Matrix } from "../storybook/Matrix";
import { Note } from "./Note";

const meta: Meta = { title: "Primitives/Note", component: Note };

export default meta;
type Story = StoryObj;

export const Neutral: Story = {
  render: () => (
    <Matrix padded>
      <Note icon={Info}>We delete your ticket photo after the show.</Note>
    </Matrix>
  ),
};
