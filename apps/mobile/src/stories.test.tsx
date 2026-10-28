import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react-native";
import type { ReactElement } from "react";

/** Every story renders without throwing. The stories are the Maestro visual captures' source, so a story that crashes is a broken capture. */
const root = __dirname;
const files = (fs.readdirSync(root, { recursive: true, encoding: "utf8" }) as string[]).filter((f) => /\.stories\.tsx$/.test(f)).sort();

interface StoryModule {
  default: { title: string; component?: (props: never) => ReactElement | null; args?: object };
  [name: string]: unknown;
}

describe.each(files)("%s", (file) => {
  const mod = require(path.join(root, file)) as StoryModule;
  const names = Object.keys(mod).filter((k) => k !== "default");

  test("has a title and at least one story", () => {
    expect(mod.default.title).toMatch(/^[A-Za-z]+\/[A-Za-z]+$/);
    expect(names.length).toBeGreaterThan(0);
  });

  test.each(names)("%s renders", async (name) => {
    const story = mod[name] as { render?: () => ReactElement; args?: object };
    const Component = mod.default.component as ((props: object) => ReactElement | null) | undefined;
    if (story.render) await render(story.render());
    else if (Component) await render(<Component {...mod.default.args} {...story.args} />);
  });
});

test("story titles are unique, so storybook ids are", () => {
  const titles = files.map((f) => (require(path.join(root, f)) as StoryModule).default.title);
  expect(new Set(titles).size).toBe(titles.length);
});
