import { render, screen } from "@testing-library/react-native";
import stories from "../.maestro/visual/stories.json";
import { loadStories } from "../jest/stories";

/**
 * Each story the device runs photograph (`.maestro/visual/stories.json`) must exist under the id it is opened by, and its ready
 * text must show once it renders, or the capture flow waits 30 seconds and fails on the device.
 */
const BY_ID = new Map(loadStories().map((story) => [story.id, story]));

describe("the stories the device runs photograph", () => {
  it("lists the listing screens and unique folders", () => {
    expect(stories.length).toBeGreaterThanOrEqual(8);
    expect(new Set(stories.map((story) => story.folder)).size).toBe(stories.length);
  });

  for (const entry of stories) {
    it(`${entry.id} exists and shows "${entry.ready}"`, async () => {
      const story = BY_ID.get(entry.id);
      if (!story) throw new Error(`No story has the id ${entry.id}`);
      await render(story.element());
      expect(screen.getAllByText(entry.ready).length).toBeGreaterThan(0);
    });
  }
});
