import type { ReactElement } from "react";
import { view } from "./storybook.requires";

type StoryId = `${string}--${string}`;

/** A story id looks like `primitives-button--primary`: the title and the story name, both lower-cased and joined with dashes. */
export function isStoryId(value: string | undefined): value is StoryId {
  return !!value && /^[a-z0-9-]+--[a-z0-9-]+$/.test(value);
}

// getStorybookUI returns a new component each call. One per story keeps the element type stable between renders.
const roots = new Map<string, ReturnType<typeof view.getStorybookUI>>();

function rootFor(initialSelection: StoryId | undefined) {
  const key = initialSelection ?? "";
  let Root = roots.get(key);
  if (!Root) {
    Root = view.getStorybookUI({ initialSelection, shouldPersistSelection: false, onDeviceUI: !initialSelection });
    roots.set(key, Root);
  }
  return Root;
}

/**
 * The Storybook screen. With a story id it shows that story alone, with no Storybook chrome and no stored selection, which is what the
 * e2e capture flows open through `turnout-e2e://storybook?story=<id>`. Without one it shows the full on-device browser.
 */
export function renderStorybook(story?: string): ReactElement {
  const Root = rootFor(isStoryId(story) ? story : undefined);
  return <Root />;
}
