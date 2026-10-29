import { render } from "@testing-library/react-native";
import { useEffect as mockUseEffect } from "react";
import { useBlockCapture } from "./useBlockCapture";

/** The keys that are blocking capture now. Like expo-screen-capture, capture is blocked while any key is held. */
const mockHeld = new Set<string>();
const mockPrevent = jest.fn((key: string | undefined) => {
  mockHeld.add(key ?? "default");
  return Promise.resolve();
});
const mockAllow = jest.fn((key: string | undefined) => {
  mockHeld.delete(key ?? "default");
  return Promise.resolve();
});

jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: (key?: string) => mockPrevent(key),
  allowScreenCaptureAsync: (key?: string) => mockAllow(key),
}));

// The screen is focused while it is mounted, which is all this hook needs from the router.
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    mockUseEffect(effect, [effect]);
  },
}));

function Screen() {
  useBlockCapture();
  return null;
}

const original = process.env.EXPO_PUBLIC_ALLOW_CAPTURE;

afterEach(() => {
  jest.clearAllMocks();
  mockHeld.clear();
  if (original === undefined) delete process.env.EXPO_PUBLIC_ALLOW_CAPTURE;
  else process.env.EXPO_PUBLIC_ALLOW_CAPTURE = original;
});

describe("useBlockCapture", () => {
  it("blocks capture while the screen is open and allows it again when it goes", async () => {
    delete process.env.EXPO_PUBLIC_ALLOW_CAPTURE;
    const view = await render(<Screen />);
    expect(mockPrevent).toHaveBeenCalledTimes(1);
    expect(mockAllow).not.toHaveBeenCalled();
    await view.unmount();
    expect(mockAllow).toHaveBeenCalledTimes(1);
  });

  it("keeps capture blocked under a screen when a screen pushed over it is closed", async () => {
    delete process.env.EXPO_PUBLIC_ALLOW_CAPTURE;
    const after = await render(<Screen />);
    expect(mockHeld.size).toBe(1);
    // The Report form opens over After, and closes again.
    const report = await render(<Screen />);
    expect(mockHeld.size).toBe(2);
    await report.unmount();
    expect(mockHeld.size).toBe(1);
    await after.unmount();
    expect(mockHeld.size).toBe(0);
  });

  it("leaves capture alone in the e2e build, so Maestro can take screenshots", async () => {
    process.env.EXPO_PUBLIC_ALLOW_CAPTURE = "1";
    const view = await render(<Screen />);
    await view.unmount();
    expect(mockPrevent).not.toHaveBeenCalled();
    expect(mockAllow).not.toHaveBeenCalled();
  });
});
