import fs from "node:fs";
import path from "node:path";
import { type ComponentType, createElement, type ReactElement } from "react";

/**
 * Every story under `src`, for the tests that render them: `a11y.test.tsx` (each state is named for a screen reader) and
 * `visualStories.test.tsx` (each story the device runs photograph exists and shows its ready text).
 */

interface StoryModule {
  default: { title: string; component?: ComponentType<never>; args?: object };
  [name: string]: unknown;
}

interface Story {
  render?: () => ReactElement;
  args?: object;
}

export interface LoadedStory {
  file: string;
  title: string;
  name: string;
  /** The id Storybook opens it by: the title lower-cased with "/" and spaces as "-", then "--", then the name in kebab case. */
  id: string;
  element: () => ReactElement;
}

const SRC = path.join(__dirname, "..", "src");

const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

export const STORY_FILES = (fs.readdirSync(SRC, { recursive: true, encoding: "utf8" }) as string[])
  .filter((file) => file.endsWith(".stories.tsx"))
  .sort();

export function loadStories(): LoadedStory[] {
  return STORY_FILES.flatMap((file) => {
    const module = require(path.join(SRC, file)) as StoryModule;
    const { title, component, args } = module.default;
    return Object.entries(module)
      .filter(([name]) => name !== "default")
      .map(([name, value]) => {
        const story = value as Story;
        const element = (): ReactElement => {
          if (story.render) return createElement(story.render);
          if (!component) throw new Error(`${title} has a story with no render and no component`);
          return createElement(component as ComponentType<object>, { ...args, ...story.args });
        };
        return { file, title, name, id: `${title.toLowerCase().replace(/[/ ]+/g, "-")}--${kebab(name)}`, element };
      });
  });
}
