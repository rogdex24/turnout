import { fireEvent, render, screen } from "@testing-library/react-native";
import { createElement, type ReactElement } from "react";
import { Pressable, Switch, TextInput } from "react-native";
import type { TestInstance } from "test-renderer";
import { loadStories, STORY_FILES } from "../jest/stories";
import { Ready } from "./screens/after/AfterView.stories";
import { SafetySheet } from "./screens/meet/SafetySheet";
import { Conversation } from "./screens/thread/ThreadView.stories";

/**
 * The accessibility floor for every screen view. Each story under `src` is rendered (the stories are the states the design shows,
 * the same ones the visual capture takes) and the tree is searched for anything a person can press, switch or type into that a
 * screen reader could not name: no role, or no label. This file is the A24 check in code; A11Y.md lists what only a phone can show.
 */

const hasText = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";
const named = (props: Props): boolean =>
  hasText(props.accessibilityLabel) || hasText(props["aria-label"]) || hasText(props.accessibilityLabelledBy);
const hasRole = (props: Props): boolean => hasText(props.accessibilityRole) || hasText(props.role);
const hides = (props: Props): boolean =>
  props.importantForAccessibility === "no-hide-descendants" || props["aria-hidden"] === true || props.accessibilityElementsHidden === true;

type Props = Record<string, unknown>;

/** True when a screen reader skips the node: the node opts out of being a stop, or an ancestor hides what is under it. */
function hiddenFromReader(node: TestInstance): boolean {
  if (node.props.accessible === false) return true;
  for (let at: TestInstance | null = node; at; at = at.parent) if (hides(at.props)) return true;
  return false;
}

/**
 * What is wrong with the pressables, switches and fields under the root, one line each. The tree is the host tree, where a Pressable
 * is a View with a click handler, a Switch is the native switch and a TextInput is itself.
 */
function accessibilityMisses(root: TestInstance): string[] {
  const misses: string[] = [];
  const id = (props: Props) => String(props.testID ?? "no testID");
  const all = root.queryAll(() => true, { includeSelf: true });
  for (const node of all) {
    const props = node.props as Props;
    if (hiddenFromReader(node)) continue;
    if (node.type === "View" && typeof props.onClick === "function") {
      if (!hasRole(props)) misses.push(`Pressable (${id(props)}) has no accessibilityRole`);
      if (!named(props)) misses.push(`Pressable (${id(props)}) has no accessibilityLabel`);
    } else if (typeof node.type === "string" && /Switch$/.test(node.type)) {
      if (!named(props)) misses.push(`Switch (${id(props)}) has no accessibilityLabel`);
    } else if (node.type === "TextInput") {
      if (!named(props)) misses.push(`TextInput (${id(props)}) has no accessibilityLabel`);
    }
  }
  return misses;
}

describe("every story", () => {
  it("finds the stories, at least one per file, under unique titles so the Storybook ids are unique", () => {
    const titleByFile = new Map(loadStories().map((story) => [story.file, story.title]));
    const titles = [...titleByFile.values()];
    expect(STORY_FILES.length).toBeGreaterThanOrEqual(50);
    expect(titleByFile.size).toBe(STORY_FILES.length);
    for (const title of titles) expect(title).toMatch(/^[A-Za-z]+\/[A-Za-z]+$/);
    expect(new Set(titles).size).toBe(titles.length);
  });

  for (const story of loadStories()) {
    it(`${story.title} ${story.name}: renders, and every pressable has a role and a label`, async () => {
      await render(story.element());
      expect(accessibilityMisses(screen.container)).toEqual([]);
    });
  }
});

describe("sheets opened from a view", () => {
  it("the safety sheet", async () => {
    await render(
      <SafetySheet visible onClose={() => undefined} onCall={() => undefined} onReport={() => undefined} onLeave={() => undefined} />,
    );
    expect(screen.getByTestId("safety-call")).toBeOnTheScreen();
    expect(accessibilityMisses(screen.container)).toEqual([]);
  });

  it("the thread's report sheet, opened by a long press", async () => {
    await render(createElement(Conversation.render as () => ReactElement));
    await fireEvent(screen.getAllByTestId(/^thread-item-/)[0] as never, "longPress");
    expect(screen.getByTestId("thread-report")).toBeOnTheScreen();
    expect(accessibilityMisses(screen.container)).toEqual([]);
  });

  it("the after-the-show confirmation", async () => {
    await render(createElement(Ready.render as () => ReactElement));
    await fireEvent.press(screen.getAllByTestId(/^after-mark-m-/)[0] as never);
    expect(screen.getByTestId("after-confirm")).toBeOnTheScreen();
    expect(accessibilityMisses(screen.container)).toEqual([]);
  });
});

describe("accessibilityMisses", () => {
  it("names each kind of miss", async () => {
    await render(
      <>
        <Pressable onPress={() => undefined} testID="bare" />
        <Pressable onPress={() => undefined} accessibilityRole="button" testID="unnamed" />
        <Pressable onPress={() => undefined} accessibilityLabel="Open" testID="no-role" />
        <Switch testID="switch" />
        <TextInput testID="field" />
      </>,
    );
    expect(accessibilityMisses(screen.container)).toEqual([
      "Pressable (bare) has no accessibilityRole",
      "Pressable (bare) has no accessibilityLabel",
      "Pressable (unnamed) has no accessibilityLabel",
      "Pressable (no-role) has no accessibilityRole",
      "Switch (switch) has no accessibilityLabel",
      "TextInput (field) has no accessibilityLabel",
    ]);
  });

  it("passes a named pressable and ones the screen reader skips", async () => {
    await render(
      <>
        <Pressable onPress={() => undefined} accessibilityRole="button" accessibilityLabel="Open" />
        <Pressable onPress={() => undefined} accessible={false} />
        <Pressable onPress={() => undefined} importantForAccessibility="no-hide-descendants">
          <Pressable onPress={() => undefined} />
        </Pressable>
      </>,
    );
    expect(accessibilityMisses(screen.container)).toEqual([]);
  });
});
