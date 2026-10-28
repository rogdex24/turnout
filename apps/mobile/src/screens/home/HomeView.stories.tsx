import type { Meta, StoryObj } from "@storybook/react-native";
import { HomeView } from "./HomeView";

// Stands in for the events list story until M2: the visual capture flow (.maestro/visual) opens it by id.
const meta = { title: "Screens/Home", component: HomeView } satisfies Meta<typeof HomeView>;

export default meta;

export const Placeholder: StoryObj<typeof meta> = {};
