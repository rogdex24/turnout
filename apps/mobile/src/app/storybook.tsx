// Board: B1.2 (dev and e2e builds only: component workbench and the visual capture flows open it by deep link)
import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Metro inlines EXPO_PUBLIC_STORYBOOK, so in preview and production (where it is 0) the require below is folded away and Storybook never
 * reaches the bundle. The route stays, and sends anyone who opens it back home.
 */
const workbench: typeof import("../../.rnstorybook") | undefined =
  process.env.EXPO_PUBLIC_STORYBOOK === "1" ? require("../../.rnstorybook") : undefined;

export default function StorybookRoute() {
  // device=1 comes from the visual capture: the story follows the device theme and text size, set by the device job.
  const { story, device } = useLocalSearchParams<{ story?: string; device?: string }>();
  return workbench ? workbench.renderStorybook(story, device === "1") : <Redirect href="/" />;
}
