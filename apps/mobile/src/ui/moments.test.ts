import { AccessibilityInfo } from "react-native";
import { moments, resetMomentsForTest } from "./moments";

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
  ImpactFeedbackStyle: { Medium: "medium" },
}));

// The haptics module is mocked by name and read through requireMock: only moments.ts may import expo-haptics.
const Haptics = jest.requireMock("expo-haptics") as Record<string, jest.Mock>;

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function reduceMotionIs(on: boolean) {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(on);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetMomentsForTest();
});

it("plays the haptic when Reduce Motion is off", async () => {
  reduceMotionIs(false);
  moments.groupConfirmed();
  await flush();
  expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
  moments.selection();
  await flush();
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
});

it("plays nothing once Reduce Motion is known to be on", async () => {
  reduceMotionIs(true);
  moments.selection();
  moments.imHere();
  moments.meetCardLive();
  moments.error();
  await flush();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});

it("does not throw when the device has no haptics", async () => {
  reduceMotionIs(false);
  Haptics.selectionAsync?.mockRejectedValueOnce(new Error("unavailable"));
  expect(() => moments.selection()).not.toThrow();
  await flush();
});
