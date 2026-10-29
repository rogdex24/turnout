import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react-native";
import { type ComponentType, createElement, type ReactElement } from "react";
import stories from "../.maestro/visual/stories.json";

/**
 * Each story the device runs photograph (`.maestro/visual/stories.json`) must exist under the id it is opened by, and its ready
 * text must show once it renders, or the capture flow waits 30 seconds and fails on the device. The id follows Storybook: the title
 * lower-cased with "/" and spaces as "-", then "--", then the export name in kebab case.
 */

interface StoryModule {
  default: { title: string; component?: ComponentType<never>; args?: object };
  [name: string]: unknown;
}

interface Story {
  render?: () => ReactElement;
  args?: object;
}

function storyFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return storyFiles(full);
    return entry.name.endsWith(".stories.tsx") ? [full] : [];
  });
}

const kebab = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
const titleId = (title: string) => title.toLowerCase().replace(/[/ ]+/g, "-");

const BY_ID = new Map<string, () => ReactElement>();
for (const file of storyFiles(__dirname)) {
  const module = require(file) as StoryModule;
  for (const [name, value] of Object.entries(module)) {
    if (name === "default") continue;
    const story = value as Story;
    const element = () =>
      story.render
        ? createElement(story.render)
        : createElement(module.default.component as ComponentType<object>, { ...module.default.args, ...story.args });
    BY_ID.set(`${titleId(module.default.title)}--${kebab(name)}`, element);
  }
}

describe("the stories the device runs photograph", () => {
  it("lists the listing screens and unique folders", () => {
    expect(stories.length).toBeGreaterThanOrEqual(8);
    expect(new Set(stories.map((story) => story.folder)).size).toBe(stories.length);
  });

  for (const entry of stories) {
    it(`${entry.id} exists and shows "${entry.ready}"`, async () => {
      const element = BY_ID.get(entry.id);
      expect(element).toBeDefined();
      await render((element as () => ReactElement)());
      expect(screen.getAllByText(entry.ready).length).toBeGreaterThan(0);
    });
  }
});
