import { render } from "@testing-library/react-native";
import { useEffect as mockUseEffect } from "react";
import { useBlockCapture } from "./useBlockCapture";

const mockPrevent = jest.fn(() => Promise.resolve());
const mockAllow = jest.fn(() => Promise.resolve());

jest.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: () => mockPrevent(),
  allowScreenCaptureAsync: () => mockAllow(),
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

  it("leaves capture alone in the e2e build, so Maestro can take screenshots", async () => {
    process.env.EXPO_PUBLIC_ALLOW_CAPTURE = "1";
    const view = await render(<Screen />);
    await view.unmount();
    expect(mockPrevent).not.toHaveBeenCalled();
    expect(mockAllow).not.toHaveBeenCalled();
  });
});
