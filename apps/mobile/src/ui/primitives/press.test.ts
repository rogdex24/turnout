import { pressed } from "@turnout/design-tokens";
import { dimOnPress, resolveStyle, scaleOnPress } from "./press";

const down = { pressed: true };
const up = { pressed: false };

test("buttons, chips and icon buttons scale while pressed", () => {
  expect(scaleOnPress(down)).toEqual({ transform: [{ scale: pressed.scale }] });
  expect(scaleOnPress(up)).toBeNull();
});

test("rows, cards and links dim while pressed", () => {
  expect(dimOnPress(down)).toEqual({ opacity: pressed.opacity });
  expect(dimOnPress(up)).toBeNull();
});

test("resolveStyle accepts a style or a function", () => {
  expect(resolveStyle({ opacity: 1 }, up)).toEqual({ opacity: 1 });
  expect(resolveStyle((state) => ({ opacity: state.pressed ? 0.5 : 1 }), down)).toEqual({ opacity: 0.5 });
  expect(resolveStyle(undefined, up)).toBeUndefined();
});
