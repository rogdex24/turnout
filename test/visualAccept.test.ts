import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { placeShots } from "../scripts/visual-accept.js";

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "visual-accept-test-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const put = (file: string, text = "x") => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

test("each visual-shots artifact replaces its device folder and other devices are left alone", () => {
  const downloaded = path.join(root, "dl");
  const baselines = path.join(root, "baselines");
  put(path.join(downloaded, "visual-shots-android-small", "events", "light.png"), "new");
  put(path.join(downloaded, "visual-shots-android-small", "events", "notes.txt"));
  put(path.join(downloaded, "other-artifact", "x.png"));
  put(path.join(baselines, "android-small", "events", "old.png"));
  put(path.join(baselines, "ios-large", "events", "keep.png"));

  expect(placeShots(downloaded, baselines)).toEqual({ "android-small": 1 });
  expect(fs.readFileSync(path.join(baselines, "android-small", "events", "light.png"), "utf8")).toBe("new");
  expect(fs.existsSync(path.join(baselines, "android-small", "events", "old.png"))).toBe(false);
  expect(fs.existsSync(path.join(baselines, "android-small", "events", "notes.txt"))).toBe(false);
  expect(fs.existsSync(path.join(baselines, "ios-large", "events", "keep.png"))).toBe(true);
});

test("an artifact with no PNGs is an error and leaves the old baselines", () => {
  const downloaded = path.join(root, "dl");
  const baselines = path.join(root, "baselines");
  put(path.join(downloaded, "visual-shots-ios-small", "readme.txt"));
  put(path.join(baselines, "ios-small", "a.png"));
  expect(() => placeShots(downloaded, baselines)).toThrow("no PNGs");
  expect(fs.existsSync(path.join(baselines, "ios-small", "a.png"))).toBe(true);
});
