import fs from "node:fs";
import path from "node:path";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { type ComponentType, createElement, type ReactElement } from "react";
import { Pressable, Switch, TextInput } from "react-native";
import type { TestInstance } from "test-renderer";
import { Ready } from "./screens/after/AfterView.stories";
import { SafetySheet } from "./screens/meet/SafetySheet";
import { Conversation } from "./screens/thread/ThreadView.stories";

/**
 * The accessibility floor for every screen view. Each story under `src` is rendered (the stories are the states the design shows,
 * the same ones the visual capture takes) and the tree is searched for anything a person can press, switch or type into that a
 * screen reader could not name: no role, or no label. This file is the A24 check in code; A11Y.md lists what only a phone can show.
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

const FILES = storyFiles(path.join(__dirname)).sort();

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

function storyElement(module: StoryModule, story: Story): ReactElement {
  if (story.render) return createElement(story.render);
  if (!module.default.component) throw new Error(`${module.default.title} has a story with no render and no component`);
  return createElement(module.default.component as ComponentType<object>, { ...module.default.args, ...story.args });
}

describe("every story", () => {
  it("finds the stories", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(50);
  });

  for (const file of FILES) {
    const module = require(file) as StoryModule;
    const stories = Object.entries(module).filter(([name]) => name !== "default");
    describe(module.default.title, () => {
      for (const [name, story] of stories) {
        it(`${name}: every pressable has a role and a label`, async () => {
          await render(storyElement(module, story as Story));
          expect(accessibilityMisses(screen.container)).toEqual([]);
        });
      }
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
