import { expect, test } from "bun:test";
import { groupAfterLoss, lossNotice } from "../src/social/model/groupLoss.js";

test("before the lock, four or more stay and can refill, fewer dissolve", () => {
  expect(groupAfterLoss(6, 5, false)).toEqual({ outcome: "stay", refill: true });
  expect(groupAfterLoss(5, 4, false)).toEqual({ outcome: "stay", refill: true });
  expect(groupAfterLoss(4, 3, false)).toEqual({ outcome: "dissolve", refill: false });
  expect(groupAfterLoss(3, 2, false)).toEqual({ outcome: "dissolve", refill: false });
});

test("after the lock, three or more go ahead and never refill, fewer are called off", () => {
  expect(groupAfterLoss(6, 5, true)).toEqual({ outcome: "go_ahead", refill: false });
  expect(groupAfterLoss(4, 3, true)).toEqual({ outcome: "go_ahead", refill: false });
  expect(groupAfterLoss(3, 2, true)).toEqual({ outcome: "called_off", refill: false });
  expect(groupAfterLoss(2, 1, true)).toEqual({ outcome: "called_off", refill: false });
});

test("a group that is still six after a loss is not asked about", () => {
  expect(() => groupAfterLoss(6, 6, false)).toThrow();
  expect(() => groupAfterLoss(4, 5, false)).toThrow();
});

test("the thresholds come from the tunables", () => {
  const t = { groupSize: { min: 5, max: 6, lockedMin: 4 } } as never;
  expect(groupAfterLoss(5, 4, false, t).outcome).toBe("dissolve");
  expect(groupAfterLoss(5, 4, true, t).outcome).toBe("go_ahead");
  expect(groupAfterLoss(4, 3, true, t).outcome).toBe("called_off");
});

test("each outcome has one notice kind for the members who stay in it", () => {
  expect(lossNotice("stay")).toBe("group_smaller");
  expect(lossNotice("go_ahead")).toBe("group_smaller");
  expect(lossNotice("dissolve")).toBe("group_changed");
  expect(lossNotice("called_off")).toBe("group_called_off");
});
